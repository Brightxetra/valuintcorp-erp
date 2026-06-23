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

export function calculateBpjsContribution(baseSalary: number, policy: BpjsPolicy): BpjsCalculation {
  const grossSalary = Math.max(0, Math.round(baseSalary * policy.grossSalaryMultiplier));
  const healthBase = Math.min(grossSalary, policy.healthSalaryCap);
  const jhtBase = Math.min(grossSalary, policy.jhtSalaryCap);
  const jpnBase = Math.min(grossSalary, policy.jpnSalaryCap);

  const kesehatanEmployee = Math.round(healthBase * policy.healthEmployeeRate);
  const kesehatanEmployer = Math.round(healthBase * policy.healthEmployerRate);
  const jhtEmployee = Math.round(jhtBase * policy.jhtEmployeeRate);
  const jhtEmployer = Math.round(jhtBase * policy.jhtEmployerRate);
  const jpnEmployee = Math.round(jpnBase * policy.jpnEmployeeRate);
  const jpnEmployer = Math.round(jpnBase * policy.jpnEmployerRate);
  const jkk = Math.round(grossSalary * policy.jkkEmployerRate);
  const jkm = Math.round(grossSalary * policy.jkmEmployerRate);
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
