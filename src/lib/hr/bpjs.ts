// ============================================================================
// PAYROLL CALCULATIONS - INCLUDING BPJS
// ============================================================================

import type { Employee, PayrollComponent, PayrollRun } from "@/lib/domain/types";
import type { Money } from "@/lib/domain/types";

interface PayrollCalculationInput {
  employee: Employee;
  workDays: number;
  presentDays: number;
  customEarnings?: PayrollComponent[];
  customDeductions?: PayrollComponent[];
}

interface PayrollCalculationResult {
  baseSalary: Money;
  totalEarnings: Money;
  totalDeductions: Money;
  grossPay: Money;
  // BPJS Kesehatan
  bpjsKesehatanEmployee: Money;    // 1% from employee
  bpjsKesehatanEmployer: Money;   // 4% from company
  // BPJS Ketenagakerjaan
  jhtEmployee: Money;             // 3.7% from employee
  jhtEmployer: Money;             // 3.7% from company (matched)
  jpnEmployee: Money;             // 2% from employee
  jpnEmployer: Money;             // 2% from company (matched)
  jkk: Money;                     // 0.24-1.74% from company (default 0.5%)
  jkm: Money;                     // 0.3% from company
  // Tax
  pph21: Money;
  // Net
  netPay: Money;
  takeHomePay: Money;
  totalCostToCompany: Money;
}

// 2024 BPJS rates (updated periodically, check annually)
const BPJS_RATES = {
  kesehatan: {
    employee: 0.01,      // 1%
    employer: 0.04,      // 4%
    maxMonthly: 1_200_000, // Max base: 12,000,000 (salary capped)
  },
  jht: {
    employee: 0.037,     // 3.7%
    employer: 0.037,     // 3.7% (matched)
    maxMonthly: 1_466_800, // Max base: 14,668,000 (salary capped)
  },
  jpn: {
    employee: 0.02,      // 2%
    employer: 0.02,      // 2% (matched)
    maxMonthly: 1_466_800, // Same cap as JHT
  },
  jkk: {
    employer: 0.005,     // 0.5% default (varies 0.24%-1.74% by risk class)
    maxMonthly: 293_360, // Max base: 14,668,000
  },
  jkm: {
    employer: 0.003,     // 0.3%
    maxMonthly: 146_680, // Max base: 14,668,000
  },
};

// PTKP 2024 for PPh 21 calculation
const PTKP_2024 = {
  single: 54_000_000,
  married: 58_500_000,
  dependent: 4_500_000,  // Per tanggungan
};

export function calculatePayrollWithBPJS(input: PayrollCalculationInput): PayrollCalculationResult {
  const { employee, workDays, presentDays, customEarnings = [], customDeductions = [] } = input;

  // 1. Calculate base salary
  let baseSalary: Money;
  if (employee.contractType === "daily") {
    // Daily rate × present days
    baseSalary = (employee.dailyRate || 0) * presentDays;
  } else {
    // Monthly salary × (present days / work days)
    baseSalary = employee.baseSalary * (presentDays / workDays);
  }

  // 2. Calculate total earnings
  const earningsAmount = customEarnings
    .filter(e => e.type === "earning")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalEarnings = baseSalary + earningsAmount;

  // 3. Calculate BPJS (only for permanent/contract employees with salary > 0)
  let bpjsKesehatanEmployee = 0;
  let bpjsKesehatanEmployer = 0;
  let jhtEmployee = 0;
  let jhtEmployer = 0;
  let jpnEmployee = 0;
  let jpnEmployer = 0;
  let jkk = 0;
  let jkm = 0;

  // Monthly salary for BPJS calculation (use actual monthly, not prorated)
  const monthlySalary = employee.contractType === "daily"
    ? (employee.dailyRate || 0) * 22 // Approximate working days
    : employee.baseSalary;

  if (monthlySalary > 0 && (employee.contractType === "permanent" || employee.contractType === "contract")) {
    // Cap for BPJS calculation
    const cappedSalary = Math.min(monthlySalary, 14_668_000); // 2024 cap

    // BPJS Kesehatan
    const kesehatanBase = Math.min(cappedSalary, BPJS_RATES.kesehatan.maxMonthly);
    bpjsKesehatanEmployee = Math.round(kesehatanBase * BPJS_RATES.kesehatan.employee);
    bpjsKesehatanEmployer = Math.round(kesehatanBase * BPJS_RATES.kesehatan.employer);

    // JHT (both employee and employer contribution)
    const jhtBase = Math.min(cappedSalary, BPJS_RATES.jht.maxMonthly);
    jhtEmployee = Math.round(jhtBase * BPJS_RATES.jht.employee);
    jhtEmployer = Math.round(jhtBase * BPJS_RATES.jht.employer);

    // JPN (both employee and employer contribution)
    const jpnBase = Math.min(cappedSalary, BPJS_RATES.jpn.maxMonthly);
    jpnEmployee = Math.round(jpnBase * BPJS_RATES.jpn.employee);
    jpnEmployer = Math.round(jpnBase * BPJS_RATES.jpn.employer);

    // JKK (employer only)
    const jkkBase = Math.min(cappedSalary, BPJS_RATES.jkk.maxMonthly);
    jkk = Math.round(jkkBase * BPJS_RATES.jkk.employer);

    // JKM (employer only)
    const jkmBase = Math.min(cappedSalary, BPJS_RATES.jkm.maxMonthly);
    jkm = Math.round(jkmBase * BPJS_RATES.jkm.employer);
  }

  // 4. Calculate PPh 21 (simplified)
  // Gross income for tax = base salary + allowances - JHT employee - JKK employer - JKM employer
  // (some items are non-taxable)
  const taxableIncome = baseSalary + earningsAmount;

  // PPh 21 calculation (simplified, progressive rates)
  const pph21 = calculatePPH21(taxableIncome, employee);

  // 5. Calculate total deductions (excluding BPJS employee portion for now)
  const deductionsAmount = customDeductions
    .filter(d => d.type === "deduction")
    .reduce((sum, d) => sum + d.amount, 0);

  // Total deductions = BPJS employee + PPh 21 + other deductions
  const totalDeductions = bpjsKesehatanEmployee + jhtEmployee + jpnEmployee + pph21 + deductionsAmount;

  // 6. Gross pay
  const grossPay = totalEarnings;

  // 7. Net pay calculation
  // Net = Gross - BPJS Employee - PPh 21 - Other deductions
  const netPay = grossPay - bpjsKesehatanEmployee - jhtEmployee - jpnEmployee - pph21 - deductionsAmount;

  // 8. Take Home Pay = what employee actually receives
  // THP = Net Pay (same as netPay in this simplified version)
  const takeHomePay = Math.max(0, netPay);

  // 9. Total cost to company = Gross + all employer contributions
  const totalCostToCompany = grossPay + bpjsKesehatanEmployer + jhtEmployer + jpnEmployer + jkk + jkm;

  return {
    baseSalary,
    totalEarnings,
    totalDeductions,
    grossPay,
    bpjsKesehatanEmployee,
    bpjsKesehatanEmployer,
    jhtEmployee,
    jhtEmployer,
    jpnEmployee,
    jpnEmployer,
    jkk,
    jkm,
    pph21,
    netPay,
    takeHomePay,
    totalCostToCompany,
  };
}

// Simplified PPh 21 calculation
function calculatePPH21(annualIncome: Money, employee: Employee): Money {
  // Monthly PPh 21
  const monthlyIncome = annualIncome;

  // Annualize for calculation
  const annual = monthlyIncome * 12;

  // PTKP (depends on marital status - simplified here)
  const ptkp = PTKP_2024.single; // Default single, can be expanded

  // Taxable income
  const taxable = Math.max(0, annual - ptkp);

  // Progressive rates (2024)
  let tax = 0;
  if (taxable > 0) {
    // 5% for first 60M
    if (taxable <= 60_000_000) {
      tax = taxable * 0.05;
    } else {
      // 5% on first 60M
      tax = 60_000_000 * 0.05;

      // 15% for next 60M-250M
      const remaining = taxable - 60_000_000;
      if (remaining <= 250_000_000) {
        tax += remaining * 0.15;
      } else {
        tax += 250_000_000 * 0.15;

        // 25% for next 250M-500M
        const remaining2 = remaining - 250_000_000;
        if (remaining2 <= 500_000_000) {
          tax += remaining2 * 0.25;
        } else {
          tax += 500_000_000 * 0.25;

          // 30% for above 500M
          tax += (remaining2 - 500_000_000) * 0.30;
        }
      }
    }
  }

  // Monthly tax
  const monthlyTax = Math.round(tax / 12);

  return monthlyTax;
}

// Generate payroll slip data
export function generatePayrollSlip(
  employee: Employee,
  result: PayrollCalculationResult,
  period: string
) {
  const formatMoney = (n: number) => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

  return {
    header: {
      employeeName: employee.name,
      employeeNo: employee.employeeNo,
      period,
      contractType: employee.contractType === "permanent" ? "Karyawan Tetap"
        : employee.contractType === "contract" ? "Kontrak" : "Harian",
    },
    earnings: [
      { label: "Gaji Pokok", amount: result.baseSalary },
    ],
    deductions: [
      { label: "BPJS Kesehatan (1%)", amount: result.bpjsKesehatanEmployee, isBpjs: true },
      { label: "JHT (3.7%)", amount: result.jhtEmployee, isBpjs: true },
      { label: "JPN (2%)", amount: result.jpnEmployee, isBpjs: true },
      { label: "PPh 21", amount: result.pph21 },
    ],
    employerCosts: [
      { label: "BPJS Kesehatan (4%)", amount: result.bpjsKesehatanEmployer, isBpjs: true },
      { label: "JHT (3.7%)", amount: result.jhtEmployer, isBpjs: true },
      { label: "JPN (2%)", amount: result.jpnEmployer, isBpjs: true },
      { label: "JKK (0.5%)", amount: result.jkk, isBpjs: true },
      { label: "JKM (0.3%)", amount: result.jkm, isBpjs: true },
    ],
    totals: {
      grossPay: result.grossPay,
      totalDeductions: result.bpjsKesehatanEmployee + result.jhtEmployee + result.jpnEmployee + result.pph21,
      netPay: result.netPay,
      takeHomePay: result.takeHomePay,
      totalCostToCompany: result.totalCostToCompany,
    },
    formatted: {
      grossPay: formatMoney(result.grossPay),
      totalDeductions: formatMoney(result.bpjsKesehatanEmployee + result.jhtEmployee + result.jpnEmployee + result.pph21),
      netPay: formatMoney(result.netPay),
      takeHomePay: formatMoney(result.takeHomePay),
      totalCostToCompany: formatMoney(result.totalCostToCompany),
    },
  };
}

// Create payroll journal entry
export function createPayrollJournalEntry(
  businessId: string,
  date: string,
  period: string,
  employeeName: string,
  result: PayrollCalculationResult,
  accounts: Record<string, string>
) {
  const lines = [];

  // Debit: Payroll Expense
  lines.push({
    accountCode: accounts.payrollExpense || "5200",
    accountName: "Beban Gaji",
    debit: result.totalCostToCompany,
    credit: 0,
    memo: `Gaji ${employeeName}`,
  });

  // Credit: Cash/Bank (net pay)
  lines.push({
    accountCode: accounts.cash || "1000",
    accountName: "Kas dan Bank",
    debit: 0,
    credit: result.netPay,
    memo: `Bayar gaji ${employeeName}`,
  });

  // Credit: Salary Payable (unpaid portion - if any)
  // For now, we credit cash for full netPay

  // Credit: Tax Payable (PPh 21)
  if (result.pph21 > 0) {
    lines.push({
      accountCode: accounts.taxPayable || "2200",
      accountName: "Utang Pajak",
      debit: 0,
      credit: result.pph21,
      memo: `PPh 21 ${employeeName}`,
    });
  }

  // Credit: BPJS Payable (employer portion)
  const totalBpjsEmployer = result.bpjsKesehatanEmployer + result.jhtEmployer + result.jpnEmployer + result.jkk + result.jkm;
  if (totalBpjsEmployer > 0) {
    lines.push({
      accountCode: "2101", // BPJS Payable
      accountName: "Utang BPJS",
      debit: 0,
      credit: totalBpjsEmployer,
      memo: `BPJS perusahaan ${employeeName}`,
    });
  }

  return {
    businessId,
    date,
    period,
    description: `Proses Gaji ${employeeName}`,
    source: "payroll" as const,
    lines,
  };
}

// Export constants for reference
export const BPJS_CONSTANTS = {
  rates: BPJS_RATES,
  ptkp: PTKP_2024,
  description: {
    bpjsKesehatan: "BPJS Kesehatan - Asuransi kesehatan nasional",
    jht: "Jaminan Hari Tua - Tabungan hari tua karyawan",
    jpn: "Jaminan Pensiun - Dana pensiun karyawan",
    jkk: "Jaminan Kecelakaan Kerja - Perlindungan saat bekerja",
    jkm: "Jaminan Kematian - Perlindungan bagi keluarga",
  },
};