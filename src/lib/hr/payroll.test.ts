import { describe, expect, it } from "vitest";
import type { Employee } from "@/lib/domain/types";
import { calculateEmployeePayroll } from "@/lib/hr/payroll";

const employee: Employee = {
  id: "employee-1",
  businessId: "business-1",
  employeeNo: "EMP-001",
  name: "Dimas",
  role: "Operator",
  contractType: "permanent",
  status: "active",
  baseSalary: 10_000_000,
  joinedAt: "2026-01-01",
  bpjsParticipation: "health",
  compensationComponents: [
    { id: "bonus", name: "Bonus performa", type: "earning", calculation: "percentage", amount: 10 },
    { id: "meal", name: "Potongan makan", type: "deduction", calculation: "fixed", amount: 500_000 },
  ],
};

describe("employee payroll calculation", () => {
  it("applies compensation components and employee-specific BPJS policy", () => {
    const payroll = calculateEmployeePayroll(employee);

    expect(payroll.grossPay).toBe(11_000_000);
    expect(payroll.deductions).toBe(610_000);
    expect(payroll.netPay).toBe(10_390_000);
    expect(payroll.bpjs.totalEmployee).toBe(110_000);
    expect(payroll.bpjs.totalEmployer).toBe(440_000);
    expect(payroll.components).toContainEqual(expect.objectContaining({
      name: "BPJS perusahaan",
      amount: 440_000,
      type: "employer_contribution",
    }));
  });

  it("rejects saved deductions above gross pay", () => {
    const overDeductedEmployee = {
      ...employee,
      compensationComponents: [
        { id: "large", name: "Potongan besar", type: "deduction" as const, calculation: "fixed" as const, amount: 20_000_000 },
      ],
    };

    expect(() => calculateEmployeePayroll(overDeductedEmployee)).toThrow(/tidak boleh melebihi gaji kotor/);
  });
});
