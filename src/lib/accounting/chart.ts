import {
  type AccountType,
  type BusinessIndustry,
  type ChartOfAccount,
  normalBalanceForType,
} from "@/lib/domain/types";

export const accountCodes = {
  cash: "1000",
  accountsReceivable: "1100",
  inventory: "1200",
  fixedAssets: "1300",
  accumulatedDepreciation: "1310",
  accountsPayable: "2000",
  salaryPayable: "2100",
  taxPayable: "2200",
  ownerCapital: "3000",
  ownerDrawings: "3100",
  salesRevenue: "4000",
  serviceRevenue: "4010",
  fixedAssetDisposalGain: "4200",
  cogs: "5000",
  operatingExpense: "5100",
  depreciationExpense: "5150",
  payrollExpense: "5200",
  taxExpense: "5300",
  inventoryAdjustment: "6000",
  fixedAssetDisposalLoss: "6100",
} as const;

function account(
  code: string,
  name: string,
  type: AccountType,
  category: ChartOfAccount["category"],
  normalBalance = normalBalanceForType(type),
): ChartOfAccount {
  return {
    id: `coa-${code}`,
    businessId: null,
    code,
    name,
    type,
    category,
    normalBalance,
    isSystem: true,
    isActive: true,
  };
}

export const systemAccounts: ChartOfAccount[] = [
  account(accountCodes.cash, "Kas dan Bank", "asset", "cash"),
  account(accountCodes.accountsReceivable, "Piutang Usaha", "asset", "receivable"),
  account(accountCodes.inventory, "Persediaan", "asset", "inventory"),
  account(accountCodes.fixedAssets, "Aset Tetap", "asset", "fixed_asset"),
  account(accountCodes.accumulatedDepreciation, "Akumulasi Penyusutan", "asset", "fixed_asset", "credit"),
  account(accountCodes.accountsPayable, "Utang Usaha", "liability", "payable"),
  account(accountCodes.salaryPayable, "Utang Gaji", "liability", "payable"),
  account(accountCodes.taxPayable, "Utang Pajak", "liability", "tax"),
  account(accountCodes.ownerCapital, "Modal Pemilik", "equity", "capital"),
  account(accountCodes.ownerDrawings, "Prive Pemilik", "equity", "capital"),
  account(accountCodes.salesRevenue, "Pendapatan Penjualan", "revenue", "sales"),
  account(accountCodes.serviceRevenue, "Pendapatan Jasa", "revenue", "sales"),
  account(accountCodes.fixedAssetDisposalGain, "Laba Pelepasan Aset", "revenue", "other_income"),
  account(accountCodes.cogs, "Harga Pokok Penjualan", "expense", "cogs"),
  account(accountCodes.operatingExpense, "Beban Operasional", "expense", "operating_expense"),
  account(accountCodes.depreciationExpense, "Beban Penyusutan", "expense", "operating_expense"),
  account(accountCodes.payrollExpense, "Beban Gaji", "expense", "payroll"),
  account(accountCodes.taxExpense, "Beban Pajak", "expense", "tax"),
  account(accountCodes.inventoryAdjustment, "Penyesuaian Persediaan", "expense", "adjustment"),
  account(accountCodes.fixedAssetDisposalLoss, "Rugi Pelepasan Aset", "expense", "adjustment"),
];

export function getAccountByCode(accounts: ChartOfAccount[], code: string): ChartOfAccount {
  const found = accounts.find((accountItem) => accountItem.code === code && accountItem.isActive);

  if (!found) {
    throw new Error(`Account code ${code} is not active or not configured.`);
  }

  return found;
}

export function templateForIndustry(industry: BusinessIndustry): ChartOfAccount[] {
  if (industry === "service") {
    return systemAccounts.filter((accountItem) => accountItem.code !== accountCodes.inventory);
  }

  return systemAccounts;
}
