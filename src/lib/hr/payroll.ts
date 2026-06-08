import { buildPayrollJournal } from "@/lib/accounting/engine";
import type { Attendance, Employee, JournalEntry, PayrollComponent, PayrollRun } from "@/lib/domain/types";

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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
  return buildPayrollJournal({
    businessId: run.businessId,
    date,
    grossPay: run.grossPay,
    netCashPaid: run.netPay,
    taxWithheld: run.taxWithheld,
    otherDeductionsPayable: run.deductions,
  });
}
