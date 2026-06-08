import { accountCodes, getAccountByCode, systemAccounts } from "@/lib/accounting/chart";
import type {
  BusinessRole,
  ChartOfAccount,
  JournalEntry,
  JournalLine,
  JournalSource,
  Money,
  OpeningBalance,
  ReportPeriod,
} from "@/lib/domain/types";

const defaultBusinessId = "demo-business";

function id(prefix: string): string {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);

  return `${prefix}-${randomId}`;
}

export function periodFromDate(date: string): string {
  return date.slice(0, 7);
}

export function rupiah(amount: number): Money {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Money amount must be a non-negative finite number.");
  }

  return Math.round(amount);
}

export function sumDebits(lines: JournalLine[]): Money {
  return lines.reduce((total, lineItem) => total + lineItem.debit, 0);
}

export function sumCredits(lines: JournalLine[]): Money {
  return lines.reduce((total, lineItem) => total + lineItem.credit, 0);
}

export function assertBalanced(lines: JournalLine[]): void {
  const debitTotal = sumDebits(lines);
  const creditTotal = sumCredits(lines);

  if (debitTotal !== creditTotal) {
    throw new Error(`Journal is not balanced. Debit ${debitTotal} != Credit ${creditTotal}.`);
  }
}

export function assertPeriodOpen(date: string, periods: ReportPeriod[]): void {
  const lockedPeriod = periods.find(
    (period) => period.locked && period.startDate <= date && date <= period.endDate,
  );

  if (lockedPeriod) {
    throw new Error(`Period ${lockedPeriod.label} is locked. Use a correction or reversal entry.`);
  }
}

export function makeLine(
  accounts: ChartOfAccount[],
  accountCode: string,
  side: "debit" | "credit",
  amount: Money,
  memo?: string,
): JournalLine {
  if (amount <= 0) {
    throw new Error("Journal line amount must be positive.");
  }

  const account = getAccountByCode(accounts, accountCode);

  return {
    id: id("line"),
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    debit: side === "debit" ? rupiah(amount) : 0,
    credit: side === "credit" ? rupiah(amount) : 0,
    memo,
  };
}

export function createJournalEntry(params: {
  businessId?: string;
  date: string;
  description: string;
  source: JournalSource;
  lines: JournalLine[];
  createdByRole?: BusinessRole;
  referenceId?: string;
  accounts?: ChartOfAccount[];
}): JournalEntry {
  validateJournalLines(params.lines, params.accounts ?? systemAccounts);
  assertBalanced(params.lines);

  return {
    id: id("journal"),
    businessId: params.businessId ?? defaultBusinessId,
    date: params.date,
    period: periodFromDate(params.date),
    description: params.description,
    source: params.source,
    status: "posted",
    referenceId: params.referenceId,
    createdByRole: params.createdByRole ?? "finance_admin",
    createdAt: new Date().toISOString(),
    lines: params.lines,
  };
}

export function validateJournalLines(lines: JournalLine[], accounts: ChartOfAccount[]): void {
  if (lines.length < 2) {
    throw new Error("A journal entry needs at least two lines.");
  }

  for (const lineItem of lines) {
    getAccountByCode(accounts, lineItem.accountCode);

    if (lineItem.debit < 0 || lineItem.credit < 0) {
      throw new Error("Debit and credit cannot be negative.");
    }

    if (lineItem.debit > 0 && lineItem.credit > 0) {
      throw new Error("A journal line cannot contain debit and credit at the same time.");
    }

    if (lineItem.debit === 0 && lineItem.credit === 0) {
      throw new Error("A journal line must contain a debit or a credit.");
    }
  }
}

export function buildOpeningBalance(params: {
  date: string;
  balances: OpeningBalance[];
  autoOffsetAccountCode?: string | false;
  businessId?: string;
  accounts?: ChartOfAccount[];
}): JournalEntry {
  const accounts = params.accounts ?? systemAccounts;
  const lines = params.balances
    .filter((balance) => balance.amount > 0)
    .map((balance) => {
      const account = getAccountByCode(accounts, balance.accountCode);
      return makeLine(accounts, account.code, account.normalBalance, balance.amount, "Saldo awal");
    });

  const debitTotal = sumDebits(lines);
  const creditTotal = sumCredits(lines);
  const difference = Math.abs(debitTotal - creditTotal);
  const offsetAccountCode = params.autoOffsetAccountCode;

  if (difference > 0 && !offsetAccountCode) {
    throw new Error(
      `Opening balance is not balanced. Difference ${difference}. Review balances or pass an explicit autoOffsetAccountCode.`,
    );
  }

  if (difference > 0 && offsetAccountCode) {
    lines.push(
      makeLine(
        accounts,
        offsetAccountCode,
        debitTotal > creditTotal ? "credit" : "debit",
        difference,
        "Offset saldo awal",
      ),
    );
  }

  return createJournalEntry({
    businessId: params.businessId,
    date: params.date,
    description: "Saldo awal onboarding",
    source: "opening_balance",
    lines,
    accounts,
  });
}

export function buildSalesJournal(params: {
  date: string;
  revenueAmount: Money;
  cashReceived?: Money;
  receivableAmount?: Money;
  taxPayable?: Money;
  cogs?: Money;
  inventoryCost?: Money;
  businessId?: string;
  accounts?: ChartOfAccount[];
}): JournalEntry {
  const accounts = params.accounts ?? systemAccounts;
  const cashReceived = params.cashReceived ?? 0;
  const receivableAmount = params.receivableAmount ?? 0;
  const taxPayable = params.taxPayable ?? 0;
  const cogs = params.cogs ?? 0;
  const inventoryCost = params.inventoryCost ?? 0;

  if (cashReceived + receivableAmount !== params.revenueAmount + taxPayable) {
    throw new Error("Sales settlement must equal revenue plus tax payable.");
  }

  if (cogs !== inventoryCost) {
    throw new Error("COGS must equal the inventory value relieved.");
  }

  const lines: JournalLine[] = [];

  if (cashReceived > 0) {
    lines.push(makeLine(accounts, accountCodes.cash, "debit", cashReceived, "Kas dari penjualan"));
  }

  if (receivableAmount > 0) {
    lines.push(
      makeLine(accounts, accountCodes.accountsReceivable, "debit", receivableAmount, "Piutang penjualan"),
    );
  }

  lines.push(makeLine(accounts, accountCodes.salesRevenue, "credit", params.revenueAmount, "Omzet"));

  if (taxPayable > 0) {
    lines.push(makeLine(accounts, accountCodes.taxPayable, "credit", taxPayable, "Pajak terutang"));
  }

  if (cogs > 0) {
    lines.push(makeLine(accounts, accountCodes.cogs, "debit", cogs, "HPP"));
    lines.push(makeLine(accounts, accountCodes.inventory, "credit", inventoryCost, "Persediaan keluar"));
  }

  return createJournalEntry({
    businessId: params.businessId,
    date: params.date,
    description: "Penjualan UMKM",
    source: "manual_transaction",
    lines,
    accounts,
  });
}

export function buildExpenseJournal(params: {
  date: string;
  amount: Money;
  paidAmount: Money;
  payableAmount?: Money;
  expenseAccountCode?: string;
  businessId?: string;
  accounts?: ChartOfAccount[];
  description?: string;
}): JournalEntry {
  const accounts = params.accounts ?? systemAccounts;
  const payableAmount = params.payableAmount ?? 0;

  if (params.paidAmount + payableAmount !== params.amount) {
    throw new Error("Expense payment and payable split must equal the expense amount.");
  }

  const lines = [
    makeLine(
      accounts,
      params.expenseAccountCode ?? accountCodes.operatingExpense,
      "debit",
      params.amount,
      "Beban",
    ),
  ];

  if (params.paidAmount > 0) {
    lines.push(makeLine(accounts, accountCodes.cash, "credit", params.paidAmount, "Dibayar kas"));
  }

  if (payableAmount > 0) {
    lines.push(makeLine(accounts, accountCodes.accountsPayable, "credit", payableAmount, "Masih terutang"));
  }

  return createJournalEntry({
    businessId: params.businessId,
    date: params.date,
    description: params.description ?? "Beban operasional",
    source: "manual_transaction",
    lines,
    accounts,
  });
}

export function buildInventoryPurchaseJournal(params: {
  date: string;
  inventoryAmount: Money;
  paidAmount: Money;
  payableAmount?: Money;
  businessId?: string;
  accounts?: ChartOfAccount[];
}): JournalEntry {
  const accounts = params.accounts ?? systemAccounts;
  const payableAmount = params.payableAmount ?? 0;

  if (params.paidAmount + payableAmount !== params.inventoryAmount) {
    throw new Error("Inventory purchase settlement must equal inventory value.");
  }

  const lines = [
    makeLine(accounts, accountCodes.inventory, "debit", params.inventoryAmount, "Pembelian stok"),
  ];

  if (params.paidAmount > 0) {
    lines.push(makeLine(accounts, accountCodes.cash, "credit", params.paidAmount, "Dibayar kas"));
  }

  if (payableAmount > 0) {
    lines.push(makeLine(accounts, accountCodes.accountsPayable, "credit", payableAmount, "Utang supplier"));
  }

  return createJournalEntry({
    businessId: params.businessId,
    date: params.date,
    description: "Pembelian persediaan",
    source: "inventory",
    lines,
    accounts,
  });
}

export function buildPayrollJournal(params: {
  date: string;
  grossPay: Money;
  netCashPaid: Money;
  salaryPayable?: Money;
  taxWithheld?: Money;
  otherDeductionsPayable?: Money;
  businessId?: string;
  accounts?: ChartOfAccount[];
}): JournalEntry {
  const accounts = params.accounts ?? systemAccounts;
  const salaryPayable = params.salaryPayable ?? 0;
  const taxWithheld = params.taxWithheld ?? 0;
  const otherDeductionsPayable = params.otherDeductionsPayable ?? 0;
  const creditTotal = params.netCashPaid + salaryPayable + taxWithheld + otherDeductionsPayable;

  if (creditTotal !== params.grossPay) {
    throw new Error("Payroll credits must equal gross payroll cost.");
  }

  const lines = [
    makeLine(accounts, accountCodes.payrollExpense, "debit", params.grossPay, "Beban gaji"),
  ];

  if (params.netCashPaid > 0) {
    lines.push(makeLine(accounts, accountCodes.cash, "credit", params.netCashPaid, "Gaji dibayar"));
  }

  if (salaryPayable > 0) {
    lines.push(makeLine(accounts, accountCodes.salaryPayable, "credit", salaryPayable, "Sisa gaji"));
  }

  if (taxWithheld > 0) {
    lines.push(makeLine(accounts, accountCodes.taxPayable, "credit", taxWithheld, "Potongan pajak"));
  }

  if (otherDeductionsPayable > 0) {
    lines.push(
      makeLine(accounts, accountCodes.accountsPayable, "credit", otherDeductionsPayable, "Potongan lain"),
    );
  }

  return createJournalEntry({
    businessId: params.businessId,
    date: params.date,
    description: "Payroll run",
    source: "payroll",
    lines,
    accounts,
  });
}

export function buildStockAdjustmentJournal(params: {
  date: string;
  inventoryDeltaValue: Money;
  direction: "increase" | "decrease";
  businessId?: string;
  accounts?: ChartOfAccount[];
}): JournalEntry {
  const accounts = params.accounts ?? systemAccounts;
  const lines =
    params.direction === "increase"
      ? [
          makeLine(accounts, accountCodes.inventory, "debit", params.inventoryDeltaValue, "Stok lebih"),
          makeLine(
            accounts,
            accountCodes.inventoryAdjustment,
            "credit",
            params.inventoryDeltaValue,
            "Koreksi stok lebih",
          ),
        ]
      : [
          makeLine(
            accounts,
            accountCodes.inventoryAdjustment,
            "debit",
            params.inventoryDeltaValue,
            "Koreksi stok kurang",
          ),
          makeLine(accounts, accountCodes.inventory, "credit", params.inventoryDeltaValue, "Stok kurang"),
        ];

  return createJournalEntry({
    businessId: params.businessId,
    date: params.date,
    description: "Stock opname adjustment",
    source: "inventory",
    lines,
    accounts,
  });
}

export function reverseJournalEntry(entry: JournalEntry, date: string): JournalEntry {
  const reversedLines = entry.lines.map((lineItem) => ({
    ...lineItem,
    id: id("line"),
    debit: lineItem.credit,
    credit: lineItem.debit,
    memo: `Reversal: ${lineItem.memo ?? entry.description}`,
  }));

  return createJournalEntry({
    businessId: entry.businessId,
    date,
    description: `Reversal - ${entry.description}`,
    source: "reversal",
    lines: reversedLines,
    referenceId: entry.id,
    createdByRole: entry.createdByRole,
  });
}

export function postJournalEntry(
  entry: JournalEntry,
  options: { lockedPeriods?: ReportPeriod[]; accounts?: ChartOfAccount[] } = {},
): JournalEntry {
  assertPeriodOpen(entry.date, options.lockedPeriods ?? []);
  validateJournalLines(entry.lines, options.accounts ?? systemAccounts);
  assertBalanced(entry.lines);
  return { ...entry, status: "posted" };
}

export function accountBalance(
  account: ChartOfAccount,
  entries: JournalEntry[],
  throughDate?: string,
): Money {
  const raw = entries
    .filter((entry) => entry.status === "posted")
    .filter((entry) => (throughDate ? entry.date <= throughDate : true))
    .flatMap((entry) => entry.lines)
    .filter((lineItem) => lineItem.accountCode === account.code)
    .reduce((total, lineItem) => total + lineItem.debit - lineItem.credit, 0);

  return account.normalBalance === "debit" ? raw : -raw;
}

export function trialBalance(entries: JournalEntry[], accounts: ChartOfAccount[] = systemAccounts) {
  return accounts.map((account) => ({
    account,
    debit: entries
      .filter((entry) => entry.status === "posted")
      .flatMap((entry) => entry.lines)
      .filter((lineItem) => lineItem.accountCode === account.code)
      .reduce((total, lineItem) => total + lineItem.debit, 0),
    credit: entries
      .filter((entry) => entry.status === "posted")
      .flatMap((entry) => entry.lines)
      .filter((lineItem) => lineItem.accountCode === account.code)
      .reduce((total, lineItem) => total + lineItem.credit, 0),
    balance: accountBalance(account, entries),
  }));
}
