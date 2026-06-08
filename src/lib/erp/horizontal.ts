import { accountCodes, systemAccounts } from "@/lib/accounting/chart";
import { createJournalEntry, makeLine } from "@/lib/accounting/engine";
import type { JournalEntry, Money } from "@/lib/domain/types";
import type {
  BusinessFeatureFlag,
  DailyTransactionSummary,
  ErpModule,
  ErpWorkspace,
  IndustryTemplate,
  LocationMetric,
  PaymentMethod,
  ProductType,
  RawImportBatch,
  RawTransaction,
  RawTransactionStatus,
  SettlementRecord,
  SummaryStatus,
  TransactionSourceType,
} from "@/lib/erp/types";

export const industryTemplates: IndustryTemplate[] = [
  {
    id: "general",
    industry: "general",
    name: "General UMKM",
    description: "Template horizontal untuk usaha yang belum membutuhkan konfigurasi industri spesifik.",
    enabledModules: ["dashboard", "sales", "purchases", "accounting", "reports", "tax"],
    defaultProductType: "non_stock_item",
  },
  {
    id: "service",
    industry: "service",
    name: "Jasa",
    description: "Cocok untuk konsultan, agensi, salon, bengkel jasa, dan bisnis berbasis pekerjaan.",
    enabledModules: ["dashboard", "sales", "purchases", "accounting", "reports", "hr", "payroll", "tax"],
    defaultProductType: "service",
  },
  {
    id: "retail",
    industry: "retail",
    name: "Retail",
    description: "Retail offline dengan SKU, stok, cabang, invoice, settlement, dan laporan stok.",
    enabledModules: ["dashboard", "sales", "purchases", "inventory", "accounting", "reports", "imports", "locations", "tax"],
    defaultProductType: "stock_item",
  },
  {
    id: "food_beverage",
    industry: "food_beverage",
    name: "F&B Ringan",
    description: "F&B multi-outlet ringan dengan daily sales, stok sederhana, payroll, dan pajak.",
    enabledModules: [
      "dashboard",
      "sales",
      "purchases",
      "inventory",
      "accounting",
      "reports",
      "hr",
      "payroll",
      "imports",
      "locations",
      "tax",
    ],
    defaultProductType: "stock_item",
  },
  {
    id: "online_seller",
    industry: "online_seller",
    name: "Online Seller",
    description: "Seller marketplace/social commerce dengan import transaksi, settlement, dan rekonsiliasi channel.",
    enabledModules: ["dashboard", "sales", "purchases", "inventory", "accounting", "reports", "imports", "locations", "tax"],
    defaultProductType: "stock_item",
  },
  {
    id: "distributor",
    industry: "retail",
    name: "Distributor Kecil",
    description: "Distributor ringan dengan multi-gudang, invoice B2B, AR/AP, dan stok per lokasi.",
    enabledModules: ["dashboard", "sales", "purchases", "inventory", "accounting", "reports", "locations", "tax"],
    defaultProductType: "stock_item",
  },
];

export function enabledModulesForTemplate(templateId: string): ErpModule[] {
  return (industryTemplates.find((template) => template.id === templateId) ?? industryTemplates[0]).enabledModules;
}

export function defaultProductTypeForTemplate(templateId: string): ProductType {
  return (industryTemplates.find((template) => template.id === templateId) ?? industryTemplates[0]).defaultProductType;
}

export function featureFlagsForTemplate(businessId: string, templateId: string): BusinessFeatureFlag[] {
  return enabledModulesForTemplate(templateId).map((module) => ({
    id: `flag-${businessId}-${module}`,
    businessId,
    module,
    enabled: true,
  }));
}

export function rawTransactionKey(transaction: Pick<RawTransaction, "businessId" | "locationId" | "source" | "externalId" | "transactionDate">) {
  return [
    transaction.businessId,
    transaction.locationId,
    transaction.source,
    transaction.externalId,
    transaction.transactionDate,
  ].join("|");
}

export function markRawTransactionStatuses(
  existing: RawTransaction[],
  incoming: RawTransaction[],
): RawTransaction[] {
  const seen = new Set(existing.map(rawTransactionKey));

  return incoming.map((transaction) => {
    const key = rawTransactionKey(transaction);
    const duplicate = seen.has(key);
    seen.add(key);

    return {
      ...transaction,
      status: duplicate ? "duplicate" : transaction.status,
    };
  });
}

export function validateRawTransactions(transactions: RawTransaction[]): RawTransaction[] {
  return transactions.map((transaction) => {
    const hasValidAmounts =
      transaction.grossAmount >= 0 &&
      transaction.discountAmount >= 0 &&
      transaction.netAmount >= 0 &&
      transaction.taxAmount >= 0 &&
      transaction.grossAmount - transaction.discountAmount + transaction.taxAmount === transaction.netAmount;

    if (transaction.status === "duplicate") return transaction;

    return {
      ...transaction,
      status: hasValidAmounts ? "validated" : "failed",
    };
  });
}

function summaryKey(transaction: RawTransaction) {
  return [
    transaction.businessId,
    transaction.locationId,
    transaction.source,
    transaction.transactionDate,
  ].join("|");
}

function addPaymentBreakdown(
  breakdown: Partial<Record<PaymentMethod, Money>>,
  method: PaymentMethod,
  amount: Money,
) {
  return {
    ...breakdown,
    [method]: (breakdown[method] ?? 0) + amount,
  };
}

export function summarizeRawTransactions(transactions: RawTransaction[]): DailyTransactionSummary[] {
  const summaries = new Map<string, DailyTransactionSummary>();

  for (const transaction of transactions) {
    if (!["validated", "mapped", "summarized", "posted"].includes(transaction.status)) continue;

    const key = summaryKey(transaction);
    const current =
      summaries.get(key) ??
      ({
        id: `summary-${key.replaceAll("|", "-")}`,
        businessId: transaction.businessId,
        locationId: transaction.locationId,
        source: transaction.source,
        date: transaction.transactionDate,
        status: "summarized" as SummaryStatus,
        transactionCount: 0,
        grossAmount: 0,
        discountAmount: 0,
        netAmount: 0,
        taxAmount: 0,
        paymentBreakdown: {},
        createdAt: transaction.createdAt,
      } satisfies DailyTransactionSummary);

    summaries.set(key, {
      ...current,
      transactionCount: current.transactionCount + 1,
      grossAmount: current.grossAmount + transaction.grossAmount,
      discountAmount: current.discountAmount + transaction.discountAmount,
      netAmount: current.netAmount + transaction.netAmount,
      taxAmount: current.taxAmount + transaction.taxAmount,
      paymentBreakdown: addPaymentBreakdown(current.paymentBreakdown, transaction.paymentMethod, transaction.netAmount),
    });
  }

  return Array.from(summaries.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export function buildSummaryJournal(summary: DailyTransactionSummary): JournalEntry {
  const receivableAmount = summary.netAmount;
  const revenue = Math.max(summary.netAmount - summary.taxAmount, 0);
  const lines = [
    makeLine(systemAccounts, accountCodes.cash, "debit", receivableAmount, `${summary.source} ${summary.date}`),
    makeLine(systemAccounts, accountCodes.salesRevenue, "credit", revenue, `${summary.source} ${summary.date}`),
  ];

  if (summary.taxAmount > 0) {
    lines.push(makeLine(systemAccounts, accountCodes.taxPayable, "credit", summary.taxAmount, `${summary.source} ${summary.date}`));
  }

  return createJournalEntry({
    businessId: summary.businessId,
    date: summary.date,
    description: `Ringkasan transaksi ${summary.source} ${summary.date}`,
    source: "csv_import",
    referenceId: summary.id,
    lines,
    accounts: systemAccounts,
  });
}

export function buildLocationMetrics(workspace: Pick<ErpWorkspace, "locations" | "dailyTransactionSummaries" | "salesInvoices">): LocationMetric[] {
  return workspace.locations.map((location) => {
    const summaryRevenue = workspace.dailyTransactionSummaries
      .filter((summary) => summary.locationId === location.id && summary.status !== "rolled_back")
      .reduce((total, summary) => total + summary.netAmount, 0);
    const summaryCount = workspace.dailyTransactionSummaries
      .filter((summary) => summary.locationId === location.id && summary.status !== "rolled_back")
      .reduce((total, summary) => total + summary.transactionCount, 0);

    return {
      locationId: location.id,
      revenue: summaryRevenue,
      transactionCount: summaryCount,
      averageTicket: summaryCount > 0 ? Math.round(summaryRevenue / summaryCount) : 0,
    };
  });
}

export function reconcileSummary(params: {
  summary: DailyTransactionSummary;
  rawTransactions: RawTransaction[];
  settlements?: SettlementRecord[];
}) {
  const rawTotal = params.rawTransactions
    .filter((transaction) => summaryKey(transaction) === summaryKeyFromSummary(params.summary))
    .reduce((total, transaction) => total + transaction.netAmount, 0);
  const settlementTotal = (params.settlements ?? [])
    .filter(
      (settlement) =>
        settlement.businessId === params.summary.businessId &&
        settlement.locationId === params.summary.locationId &&
        settlement.source === params.summary.source &&
        settlement.settlementDate === params.summary.date,
    )
    .reduce((total, settlement) => total + settlement.netAmount, 0);

  return {
    rawTotal,
    summaryTotal: params.summary.netAmount,
    settlementTotal,
    rawMatchesSummary: rawTotal === params.summary.netAmount,
    settlementMatchesSummary: settlementTotal === 0 || settlementTotal === params.summary.netAmount,
  };
}

function summaryKeyFromSummary(summary: DailyTransactionSummary) {
  return [summary.businessId, summary.locationId, summary.source, summary.date].join("|");
}

export function batchStatusFromTransactions(transactions: RawTransaction[]): RawTransactionStatus {
  if (transactions.length === 0) return "uploaded";
  if (transactions.every((transaction) => transaction.status === "posted")) return "posted";
  if (transactions.every((transaction) => transaction.status === "rolled_back")) return "rolled_back";
  if (transactions.some((transaction) => transaction.status === "failed")) return "failed";
  if (transactions.some((transaction) => transaction.status === "summarized")) return "summarized";
  if (transactions.some((transaction) => transaction.status === "mapped")) return "mapped";
  if (transactions.every((transaction) => ["validated", "duplicate"].includes(transaction.status))) return "validated";
  return "uploaded";
}

export function recomputeRawImportBatch(batch: RawImportBatch, transactions: RawTransaction[]): RawImportBatch {
  const scoped = transactions.filter((transaction) => transaction.batchId === batch.id);

  return {
    ...batch,
    status: batchStatusFromTransactions(scoped),
    totalRows: scoped.length,
    validRows: scoped.filter((transaction) => ["validated", "mapped", "summarized", "posted"].includes(transaction.status)).length,
    duplicateRows: scoped.filter((transaction) => transaction.status === "duplicate").length,
    errorRows: scoped.filter((transaction) => transaction.status === "failed").length,
  };
}

export function sourceLabel(source: TransactionSourceType) {
  return {
    manual: "Manual",
    pos: "POS",
    marketplace: "Marketplace",
    bank_csv: "Bank CSV",
    pos_csv: "POS CSV",
    marketplace_csv: "Marketplace CSV",
  }[source];
}
