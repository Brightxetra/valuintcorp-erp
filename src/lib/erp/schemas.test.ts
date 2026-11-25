import { describe, expect, it } from "vitest";
import { createPayrollBatchSchema, employeeSchema } from "@/lib/erp/schemas";

const employee = {
  employeeNo: "EMP-001",
  name: "Dimas",
  role: "Operator",
  contractType: "permanent",
  joinedAt: "2026-01-01",
};

describe("employee input", () => {
  it("defaults legacy clients to the existing BPJS behavior", () => {
    expect(employeeSchema.parse(employee).bpjsParticipation).toBe("both");
  });

  it("accepts each supported BPJS participation mode", () => {
    for (const bpjsParticipation of ["none", "health", "employment", "both"]) {
      expect(employeeSchema.safeParse({ ...employee, bpjsParticipation }).success).toBe(true);
    }
  });

  it("rejects daily contracts for new writes", () => {
    expect(employeeSchema.safeParse({ ...employee, contractType: "daily" }).success).toBe(false);
  });
});

describe("payroll batch input", () => {
  it("accepts unique employee ids and a real calendar date", () => {
    expect(createPayrollBatchSchema.safeParse({
      employeeIds: ["employee-1", "employee-2"],
      date: "2026-02-28",
    }).success).toBe(true);
  });

  it("rejects duplicate employees and impossible calendar dates", () => {
    expect(createPayrollBatchSchema.safeParse({
      employeeIds: ["employee-1", "employee-1"],
      date: "2026-02-28",
    }).success).toBe(false);
    expect(createPayrollBatchSchema.safeParse({
      employeeIds: ["employee-1"],
      date: "2026-02-30",
    }).success).toBe(false);
  });

  it("does not accept browser-provided payroll amounts", () => {
    const parsed = createPayrollBatchSchema.safeParse({
      employeeIds: ["employee-1"],
      date: "2026-02-28",
      grossPay: 1,
      netCashPaid: 1,
      taxWithheld: 0,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("grossPay");
  });
});
