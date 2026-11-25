import { buildPayrollJournal } from "@/lib/accounting/engine";
import type { Attendance, Employee, JournalEntry, PayrollComponent, PayrollRun } from "@/lib/domain/types";
import type { BpjsPolicy } from "@/lib/erp/types";
import { calculateBpjsContribution, defaultBpjsPolicy, type BpjsCalculation } from "@/lib/hr/bpjs";

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export type EmployeePayrollCalculation = {
  components: PayrollComponent[];
  grossPay: number;
  deductions: number;
  taxWithheld: number;
  netPay: number;
  bpjs: BpjsCalculation;
};

function resolveComponentAmount(
  component: NonNullable<Employee["compensationComponents"]>[number],
  baseSalary: number,
) {
  return component.calculation === "percentage"
    ? Math.round(baseSalary * component.amount / 100)
    : component.amount;
}

export function calculateEmployeePayroll(
  employee: Employee,
  policy: BpjsPolicy = defaultBpjsPolicy,
  taxWithheld = 0,
): EmployeePayrollCalculation {
  const compensationComponents = (employee.compensationComponents ?? []).map((component) => ({
    id: component.id,
    name: component.name,
    amount: resolveComponentAmount(component, employee.baseSalary),
    type: component.type,
    calculation: component.calculation,
  }));
  const bpjs = calculateBpjsContribution(employee.baseSalary, policy, employee.bpjsParticipation ?? "both");
  const components: PayrollComponent[] = [
    { name: "Gaji pokok", amount: employee.baseSalary, type: "earning", calculation: "fixed" },
    ...compensationComponents,
    ...(bpjs.kesehatanEmployee > 0 ? [{ id: "bpjs-health", name: "BPJS Kesehatan karyawan", amount: bpjs.kesehatanEmployee, type: "deduction" as const, calculation: "fixed" as const }] : []),
    ...(bpjs.jhtEmployee > 0 ? [{ id: "bpjs-jht", name: "BPJS JHT karyawan", amount: bpjs.jhtEmployee, type: "deduction" as const, calculation: "fixed" as const }] : []),
    ...(bpjs.jpnEmployee > 0 ? [{ id: "bpjs-jpn", name: "BPJS JP karyawan", amount: bpjs.jpnEmployee, type: "deduction" as const, calculation: "fixed" as const }] : []),
    ...(taxWithheld > 0 ? [{ name: "Potongan pajak", amount: taxWithheld, type: "deduction" as const, calculation: "fixed" as const }] : []),
    ...(bpjs.totalEmployer > 0 ? [{ name: "BPJS perusahaan", amount: bpjs.totalEmployer, type: "employer_contribution" as const, calculation: "fixed" as const }] : []),
  ];
  const grossPay = employee.baseSalary + compensationComponents
    .filter((component) => component.type === "earning")
    .reduce((total, component) => total + component.amount, 0);
  const componentDeductions = compensationComponents
    .filter((component) => component.type === "deduction")
    .reduce((total, component) => total + component.amount, 0);
  const deductions = componentDeductions + bpjs.totalEmployee;
  const netPay = grossPay - deductions - taxWithheld;

  if (netPay < 0) {
    throw new Error("Total potongan payroll tidak boleh melebihi gaji kotor.");
  }

  return { components, grossPay, deductions, taxWithheld, netPay, bpjs };
}

export function calculatePayrollRun(params: {
  businessId: string;
  employee: Employee;
  period: string;
  workDays: number;
  attendance: Attendance[];
  components?: PayrollComponent[];
  taxWithheld?: number;
}): PayrollRun {
  if (params.workDays <= 0) {
    throw new Error("Payroll workDays must be positive.");
  }

  const presentDays = params.attendance.filter(
    (attendance) => attendance.employeeId === params.employee.id && attendance.status === "present",
  ).length;
  const base =
    params.employee.contractType === "daily"
      ? (params.employee.dailyRate ?? 0) * presentDays
      : Math.round(params.employee.baseSalary * (presentDays / params.workDays));
  const components = params.components ?? [];
  const extraEarnings = components
    .filter((component) => component.type === "earning")
    .reduce((total, component) => total + component.amount, 0);
  const deductions = components
    .filter((component) => component.type === "deduction")
    .reduce((total, component) => total + component.amount, 0);
  const taxWithheld = params.taxWithheld ?? 0;
  const grossPay = base + extraEarnings;
  const netPay = grossPay - deductions - taxWithheld;

  if (netPay < 0) {
    throw new Error("Payroll deductions cannot exceed gross pay.");
  }

  return {
    id: id("payroll"),
    businessId: params.businessId,
    period: params.period,
    employeeId: params.employee.id,
    grossPay,
    deductions,
    taxWithheld,
    netPay,
    components: [
      { name: "Gaji pokok prorata", amount: base, type: "earning" },
      ...components,
      ...(taxWithheld > 0 ? [{ name: "Estimasi potongan pajak", amount: taxWithheld, type: "deduction" as const }] : []),
    ],
  };
}

export function journalizePayrollRun(run: PayrollRun, date: string): JournalEntry {
  const employerBpjsContribution = run.components
    .filter((component) => component.type === "employer_contribution")
    .reduce((total, component) => total + component.amount, 0);

  return buildPayrollJournal({
    businessId: run.businessId,
    date,
    grossPay: run.grossPay,
    netCashPaid: run.netPay,
    taxWithheld: run.taxWithheld,
    otherDeductionsPayable: run.deductions,
    employerBpjsContribution,
  });
}
