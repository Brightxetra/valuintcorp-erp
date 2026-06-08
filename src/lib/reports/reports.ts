import { accountCodes, systemAccounts } from "@/lib/accounting/chart";
import { accountBalance } from "@/lib/accounting/engine";
import type { Business, ChartOfAccount, JournalEntry, ReportPeriod, TaxProfile } from "@/lib/domain/types";

export interface ReportLine {
  code: string;
  name: string;
  amount: number;
}

export interface IncomeStatement {
  period: ReportPeriod;
  revenue: ReportLine[];
  expenses: ReportLine[];
  totalRevenue: number;
  totalExpenses: number;
  grossProfit: number;
  netIncome: number;
}

export interface BalanceSheet {
  asOf: string;
  assets: ReportLine[];
  liabilities: ReportLine[];
  equity: ReportLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

function inPeriod(entry: JournalEntry, period: ReportPeriod): boolean {
  return period.startDate <= entry.date && entry.date <= period.endDate;
}

function lineAmount(account: ChartOfAccount, entries: JournalEntry[], throughDate?: string): ReportLine {
  const amount = accountBalance(account, entries, throughDate);

  return {
    code: account.code,
    name: account.name,
    amount: account.type === "asset" && account.normalBalance === "credit" ? -amount : amount,
  };
}

function netIncomeForEntries(entries: JournalEntry[], accounts: ChartOfAccount[]): number {
  const revenue = accounts
    .filter((account) => account.type === "revenue")
    .reduce((total, account) => total + accountBalance(account, entries), 0);
  const expenses = accounts
    .filter((account) => account.type === "expense")
    .reduce((total, account) => total + accountBalance(account, entries), 0);

  return revenue - expenses;
}

export function buildIncomeStatement(
  entries: JournalEntry[],
  period: ReportPeriod,
  accounts: ChartOfAccount[] = systemAccounts,
): IncomeStatement {
  const periodEntries = entries.filter((entry) => inPeriod(entry, period));
  const revenue = accounts
    .filter((account) => account.type === "revenue")
    .map((account) => lineAmount(account, periodEntries))
    .filter((line) => line.amount !== 0);
  const expenses = accounts
    .filter((account) => account.type === "expense")
    .map((account) => lineAmount(account, periodEntries))
    .filter((line) => line.amount !== 0);
  const totalRevenue = revenue.reduce((total, line) => total + line.amount, 0);
  const totalExpenses = expenses.reduce((total, line) => total + line.amount, 0);
  const cogs = expenses.find((line) => line.code === accountCodes.cogs)?.amount ?? 0;

  return {
    period,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    grossProfit: totalRevenue - cogs,
    netIncome: totalRevenue - totalExpenses,
  };
}

export function buildBalanceSheet(
  entries: JournalEntry[],
  period: ReportPeriod,
  accounts: ChartOfAccount[] = systemAccounts,
): BalanceSheet {
  const throughEntries = entries.filter((entry) => entry.date <= period.endDate);
  const assets = accounts
    .filter((account) => account.type === "asset")
    .map((account) => lineAmount(account, throughEntries, period.endDate))
    .filter((line) => line.amount !== 0);
  const liabilities = accounts
    .filter((account) => account.type === "liability")
    .map((account) => lineAmount(account, throughEntries, period.endDate))
    .filter((line) => line.amount !== 0);
  const equityBase = accounts
    .filter((account) => account.type === "equity")
    .map((account) => lineAmount(account, throughEntries, period.endDate))
    .filter((line) => line.amount !== 0);
  const retainedIncome = netIncomeForEntries(throughEntries, accounts);
  const equity = [...equityBase, { code: "3999", name: "Laba Tahun Berjalan", amount: retainedIncome }];

  return {
    asOf: period.endDate,
    assets,
    liabilities,
    equity,
    totalAssets: assets.reduce((total, line) => total + line.amount, 0),
    totalLiabilities: liabilities.reduce((total, line) => total + line.amount, 0),
    totalEquity: equity.reduce((total, line) => total + line.amount, 0),
  };
}

export function buildDashboardMetrics(
  entries: JournalEntry[],
  period: ReportPeriod,
  accounts: ChartOfAccount[] = systemAccounts,
) {
  const incomeStatement = buildIncomeStatement(entries, period, accounts);
  const balanceSheet = buildBalanceSheet(entries, period, accounts);
  const cash = balanceSheet.assets.find((line) => line.code === accountCodes.cash)?.amount ?? 0;
  const receivable =
    balanceSheet.assets.find((line) => line.code === accountCodes.accountsReceivable)?.amount ?? 0;
  const inventory = balanceSheet.assets.find((line) => line.code === accountCodes.inventory)?.amount ?? 0;
  const payable =
    balanceSheet.liabilities.find((line) => line.code === accountCodes.accountsPayable)?.amount ?? 0;
  const payrollCost =
    incomeStatement.expenses.find((line) => line.code === accountCodes.payrollExpense)?.amount ?? 0;

  return {
    revenue: incomeStatement.totalRevenue,
    grossProfit: incomeStatement.grossProfit,
    netIncome: incomeStatement.netIncome,
    cash,
    receivable,
    inventory,
    payable,
    payrollCost,
    marginRate:
      incomeStatement.totalRevenue > 0 ? incomeStatement.netIncome / incomeStatement.totalRevenue : 0,
  };
}

export function buildCalkNotes(params: {
  business: Business;
  taxProfile: TaxProfile;
  period: ReportPeriod;
  reportBasis?: string;
}) {
  return [
    {
      title: "Dasar penyusunan",
      body:
        params.reportBasis ??
        "Laporan disusun untuk kebutuhan manajemen UMKM dengan pendekatan SAK EMKM: biaya historis, akrual sederhana, dan pemisahan harta usaha dari harta pribadi.",
    },
    {
      title: "Profil entitas",
      body: `${params.business.displayName} bergerak pada bidang ${params.business.industry} dan menggunakan mata uang IDR.`,
    },
    {
      title: "Perpajakan",
      body: params.taxProfile.usesFinalUmkmRate
        ? `Estimasi pajak UMKM menggunakan tarif final ${(params.taxProfile.finalUmkmRate * 100).toFixed(1)}% sebagai bahan persiapan Coretax.`
        : "Profil pajak belum memakai tarif final UMKM; data tetap diekspor untuk direview sebelum pelaporan.",
    },
    {
      title: "Batasan",
      body: "Export Coretax adalah paket persiapan data, bukan penyampaian SPT langsung.",
    },
  ];
}
