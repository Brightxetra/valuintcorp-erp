import type { BpjsPolicy } from "@/lib/erp/types";

export type BpjsCalculation = {
  grossSalary: number;
  kesehatanEmployee: number;
  kesehatanEmployer: number;
  jhtEmployee: number;
  jhtEmployer: number;
  jpnEmployee: number;
  jpnEmployer: number;
  jkk: number;
  jkm: number;
  totalEmployee: number;
  totalEmployer: number;
  totalContribution: number;
};

export const defaultBpjsPolicy: BpjsPolicy = {
  id: "default-bpjs-policy",
  businessId: "",
  effectiveDate: "2026-01-01",
  grossSalaryMultiplier: 1.1,
  healthEmployeeRate: 0.01,
  healthEmployerRate: 0.04,
  healthSalaryCap: 12_000_000,
  jhtEmployeeRate: 0.037,
  jhtEmployerRate: 0.037,
  jhtSalaryCap: 1_466_800,
  jpnEmployeeRate: 0.02,
  jpnEmployerRate: 0.02,
  jpnSalaryCap: 1_466_800,
  jkkEmployerRate: 0.0054,
  jkmEmployerRate: 0.003,
};

export function defaultBpjsPolicyForBusiness(businessId: string): BpjsPolicy {
  return { ...defaultBpjsPolicy, businessId };
}

export function calculateBpjsContribution(
  baseSalary: number,
  policy: BpjsPolicy,
  participation: "none" | "health" | "employment" | "both" = "both",
): BpjsCalculation {
  const grossSalary = Math.max(0, Math.round(baseSalary * policy.grossSalaryMultiplier));
  const healthBase = Math.min(grossSalary, policy.healthSalaryCap);
  const jhtBase = Math.min(grossSalary, policy.jhtSalaryCap);
  const jpnBase = Math.min(grossSalary, policy.jpnSalaryCap);

  const includesHealth = participation === "health" || participation === "both";
  const includesEmployment = participation === "employment" || participation === "both";
  const kesehatanEmployee = includesHealth ? Math.round(healthBase * policy.healthEmployeeRate) : 0;
  const kesehatanEmployer = includesHealth ? Math.round(healthBase * policy.healthEmployerRate) : 0;
  const jhtEmployee = includesEmployment ? Math.round(jhtBase * policy.jhtEmployeeRate) : 0;
  const jhtEmployer = includesEmployment ? Math.round(jhtBase * policy.jhtEmployerRate) : 0;
  const jpnEmployee = includesEmployment ? Math.round(jpnBase * policy.jpnEmployeeRate) : 0;
  const jpnEmployer = includesEmployment ? Math.round(jpnBase * policy.jpnEmployerRate) : 0;
  const jkk = includesEmployment ? Math.round(grossSalary * policy.jkkEmployerRate) : 0;
  const jkm = includesEmployment ? Math.round(grossSalary * policy.jkmEmployerRate) : 0;
  const totalEmployee = kesehatanEmployee + jhtEmployee + jpnEmployee;
  const totalEmployer = kesehatanEmployer + jhtEmployer + jpnEmployer + jkk + jkm;

  return {
    grossSalary,
    kesehatanEmployee,
    kesehatanEmployer,
    jhtEmployee,
    jhtEmployer,
    jpnEmployee,
    jpnEmployer,
    jkk,
    jkm,
    totalEmployee,
    totalEmployer,
    totalContribution: totalEmployee + totalEmployer,
  };
}

export function rateToPercent(rate: number): number {
  return Number((rate * 100).toFixed(4));
}

export function percentToRate(percent: number): number {
  return Number((percent / 100).toFixed(6));
}
