import { accountCodes, systemAccounts } from "@/lib/accounting/chart";
import {
  createJournalEntry,
  makeLine,
} from "@/lib/accounting/engine";
import type { JournalEntry, Money, StockMovement } from "@/lib/domain/types";
import { valueInventory } from "@/lib/inventory/valuation";
import { buildDashboardMetrics } from "@/lib/reports/reports";
import { buildLocationMetrics } from "@/lib/erp/horizontal";
import { fixedAssetRegisterTotals } from "@/lib/erp/fixed-assets";
import type {
  ErpTask,
  ErpMetrics,
  ErpWorkspace,
  Payment,
  PurchaseBill,
  SalesInvoice,
} from "@/lib/erp/types";

type WorkspaceData = Omit<ErpWorkspace, "metrics" | "tasks" | "locationMetrics"> &
  Partial<Pick<ErpWorkspace, "locationMetrics">>;

export function salesInvoiceTotal(invoice: Pick<SalesInvoice, "lines">): Money {
  return invoice.lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0);
}

export function salesInvoiceCogs(invoice: Pick<SalesInvoice, "lines">): Money {
  return invoice.lines.reduce((total, line) => total + line.quantity * line.cogs, 0);
}

export function purchaseBillTotal(bill: Pick<PurchaseBill, "lines">): Money {
  return bill.lines.reduce((total, line) => total + line.quantity * line.unitCost, 0);
}

export function outstandingSales(invoice: Pick<SalesInvoice, "total" | "paidAmount">): Money {
  return Math.max(invoice.total - invoice.paidAmount, 0);
}

export function outstandingPurchase(bill: Pick<PurchaseBill, "total" | "paidAmount">): Money {
  return Math.max(bill.total - bill.paidAmount, 0);
}

export function paymentStatus(total: Money, paidAmount: Money): SalesInvoice["status"] {
  if (paidAmount <= 0) return "posted";
  if (paidAmount < total) return "partially_paid";
  return "paid";
}

export function isOverdue(dueDate: string, asOf: string): boolean {
  return dueDate < asOf;
}

export function buildSalesInvoiceJournal(invoice: SalesInvoice): JournalEntry {
  const total = salesInvoiceTotal(invoice);
  const cogs = salesInvoiceCogs(invoice);
  const lines = [
    makeLine(systemAccounts, accountCodes.accountsReceivable, "debit", total, invoice.invoiceNo),
    makeLine(systemAccounts, accountCodes.salesRevenue, "credit", total, invoice.invoiceNo),
  ];

  if (cogs > 0) {
    lines.push(makeLine(systemAccounts, accountCodes.cogs, "debit", cogs, invoice.invoiceNo));
    lines.push(makeLine(systemAccounts, accountCodes.inventory, "credit", cogs, invoice.invoiceNo));
  }

  return createJournalEntry({
    businessId: invoice.businessId,
    date: invoice.date,
    description: `Invoice penjualan ${invoice.invoiceNo}`,
    source: "manual_transaction",
    referenceId: invoice.id,
    lines,
    accounts: systemAccounts,
  });
}

export function buildPurchaseBillJournal(bill: PurchaseBill): JournalEntry {
  const total = purchaseBillTotal(bill);

  return createJournalEntry({
    businessId: bill.businessId,
    date: bill.date,
    description: `Bill pembelian ${bill.billNo}`,
    source: "inventory",
    referenceId: bill.id,
    lines: [
      makeLine(systemAccounts, accountCodes.inventory, "debit", total, bill.billNo),
      makeLine(systemAccounts, accountCodes.accountsPayable, "credit", total, bill.billNo),
    ],
    accounts: systemAccounts,
  });
}

export function buildPaymentJournal(payment: Payment): JournalEntry {
  const isInbound = payment.direction === "inbound";
  const outboundClearingAccount =
    payment.documentType === "payroll_run" ? accountCodes.salaryPayable : accountCodes.accountsPayable;

  return createJournalEntry({
    businessId: payment.businessId,
    date: payment.date,
    description: `${isInbound ? "Penerimaan" : "Pembayaran"} ${payment.reference}`,
    source: "manual_transaction",
    referenceId: payment.id,
    lines: isInbound
      ? [
          makeLine(systemAccounts, accountCodes.cash, "debit", payment.amount, payment.reference),
          makeLine(systemAccounts, accountCodes.accountsReceivable, "credit", payment.amount, payment.reference),
        ]
      : [
          makeLine(systemAccounts, outboundClearingAccount, "debit", payment.amount, payment.reference),
          makeLine(systemAccounts, accountCodes.cash, "credit", payment.amount, payment.reference),
        ],
    accounts: systemAccounts,
  });
}

export function calculateErpMetrics(workspace: WorkspaceData): ErpMetrics {
  const postedSales = workspace.salesInvoices.filter((invoice) => invoice.status !== "draft" && invoice.status !== "void");
  const postedBills = workspace.purchaseBills.filter((bill) => bill.status !== "draft" && bill.status !== "void");
  const inventory = valueInventory(workspace.stockMovements);
  const asOf = workspace.period.endDate;
  const ledgerMetrics = buildDashboardMetrics(workspace.journals, workspace.period, systemAccounts);

  const revenue = ledgerMetrics.revenue || postedSales.reduce((total, invoice) => total + invoice.total, 0);
  const summarizedRevenue = workspace.dailyTransactionSummaries
    .filter((summary) => summary.status !== "rolled_back")
    .reduce((total, summary) => total + summary.netAmount, 0);
  const rawTransactionCount =
    workspace.rawTransactions.length ||
    workspace.dailyTransactionSummaries
      .filter((summary) => summary.status !== "rolled_back")
      .reduce((total, summary) => total + summary.transactionCount, 0) ||
    workspace.rawImportBatches.reduce((total, batch) => total + batch.totalRows, 0);
  const cogs = postedSales.reduce((total, invoice) => total + salesInvoiceCogs(invoice), 0);
  const purchases = postedBills.reduce((total, bill) => total + bill.total, 0);
  const accountsReceivable = postedSales.reduce((total, invoice) => total + outstandingSales(invoice), 0);
  const accountsPayable = postedBills.reduce((total, bill) => total + outstandingPurchase(bill), 0);
  const fixedAssetTotals = fixedAssetRegisterTotals({
    assets: workspace.fixedAssets ?? [],
    depreciationLines: workspace.fixedAssetDepreciationLines ?? [],
  });

  return {
    revenue,
    purchases,
    grossMargin: ledgerMetrics.grossProfit || revenue - cogs,
    cash: ledgerMetrics.cash,
    accountsReceivable,
    accountsPayable,
    inventoryValue: ledgerMetrics.inventory || inventory.reduce((total, item) => total + item.value, 0),
    payrollCost: ledgerMetrics.payrollCost,
    taxEstimate: Math.round(revenue * workspace.taxProfile.finalUmkmRate),
    overdueReceivables: postedSales
      .filter((invoice) => outstandingSales(invoice) > 0 && isOverdue(invoice.dueDate, asOf))
      .reduce((total, invoice) => total + outstandingSales(invoice), 0),
    overduePayables: postedBills
      .filter((bill) => outstandingPurchase(bill) > 0 && isOverdue(bill.dueDate, asOf))
      .reduce((total, bill) => total + outstandingPurchase(bill), 0),
    stockAlertCount: workspace.products.filter((product) => {
      const quantity = inventory
        .filter((position) => position.itemId === product.id)
        .reduce((total, position) => total + position.quantity, 0);

      return product.trackStock && quantity <= product.reorderPoint;
    }).length,
    rawTransactionCount,
    summarizedRevenue,
    fixedAssetBookValue: fixedAssetTotals.bookValue,
  };
}

export function buildErpTasks(workspace: Omit<ErpWorkspace, "tasks">): ErpTask[] {
  const firstOpenReceivable = workspace.salesInvoices.find((invoice) => outstandingSales(invoice) > 0);
  const firstOpenPayable = workspace.purchaseBills.find((bill) => outstandingPurchase(bill) > 0);
  const tasks: ErpTask[] = [];
  const taxDueDate = new Date(`${workspace.period.endDate}T00:00:00.000Z`);
  taxDueDate.setUTCDate(taxDueDate.getUTCDate() + 10);

  if (workspace.metrics.overdueReceivables > 0 && firstOpenReceivable) {
    tasks.push({
      id: "task-ar-overdue",
      module: "sales",
      severity: "warning",
      title: "Tagih invoice jatuh tempo",
      description: `${firstOpenReceivable.invoiceNo} masih memiliki piutang jatuh tempo.`,
      dueDate: firstOpenReceivable.dueDate,
    });
  }

  if (workspace.metrics.overduePayables > 0 && firstOpenPayable) {
    tasks.push({
      id: "task-ap-overdue",
      module: "purchases",
      severity: "warning",
      title: "Bayar bill supplier jatuh tempo",
      description: `${firstOpenPayable.billNo} perlu dijadwalkan pembayarannya.`,
      dueDate: firstOpenPayable.dueDate,
    });
  }

  if (workspace.metrics.stockAlertCount > 0) {
    tasks.push({
      id: "task-stock-alert",
      module: "inventory",
      severity: "critical",
      title: "Review stok minimum",
      description: `${workspace.metrics.stockAlertCount} SKU berada di bawah reorder point.`,
    });
  }

  const pendingImport = workspace.rawImportBatches.find((batch) =>
    ["uploaded", "validated", "mapped", "summarized"].includes(batch.status),
  );

  if (pendingImport) {
    tasks.push({
      id: `task-import-${pendingImport.id}`,
      module: "accounting",
      severity: pendingImport.errorRows > 0 ? "warning" : "info",
      title: "Selesaikan import transaksi",
      description: `${pendingImport.totalRows} row ${pendingImport.source} menunggu validasi/ringkasan/posting.`,
      dueDate: pendingImport.createdAt.slice(0, 10),
    });
  }

  const unpostedSummary = workspace.dailyTransactionSummaries.find((summary) => summary.status === "summarized");

  if (unpostedSummary) {
    tasks.push({
      id: `task-summary-${unpostedSummary.id}`,
      module: "accounting",
      severity: "warning",
      title: "Post ringkasan penjualan harian",
      description: `${unpostedSummary.transactionCount} transaksi ${unpostedSummary.source} ${unpostedSummary.date} belum menjadi jurnal.`,
      dueDate: unpostedSummary.date,
    });
  }

  tasks.push({
    id: "task-tax-prep",
    module: "tax",
    severity: workspace.metrics.revenue > 0 ? "info" : "warning",
    title: "Siapkan export Coretax",
    description: "Rekonsiliasi omzet posted dan lampiran sebelum input manual di Coretax.",
    dueDate: taxDueDate.toISOString().slice(0, 10),
  });

  return tasks;
}

export function refreshErpWorkspace(workspace: WorkspaceData): ErpWorkspace {
  const metrics = calculateErpMetrics(workspace);
  const locationMetrics = buildLocationMetrics(workspace);

  return {
    ...workspace,
    locationMetrics,
    metrics,
    tasks: buildErpTasks({ ...workspace, locationMetrics, metrics }),
  };
}

export function movementFromSalesInvoice(invoice: SalesInvoice): StockMovement[] {
  return invoice.lines
    .filter((line) => line.quantity > 0 && line.cogs > 0)
    .map((line) => {
      if (!line.warehouseId) {
        throw new Error(`Warehouse is required for sales invoice line ${line.id}.`);
      }

      return {
        id: `sm-sale-${invoice.id}-${line.id}`,
        businessId: invoice.businessId,
        itemId: line.productId,
        warehouseId: line.warehouseId,
        date: invoice.date,
        type: "sale",
        quantity: line.quantity,
        value: line.quantity * line.cogs,
        memo: invoice.invoiceNo,
      };
    });
}

export function movementFromPurchaseBill(bill: PurchaseBill): StockMovement[] {
  return bill.lines
    .filter((line) => line.quantity > 0)
    .map((line) => {
      if (!line.warehouseId) {
        throw new Error(`Warehouse is required for purchase bill line ${line.id}.`);
      }

      return {
        id: `sm-purchase-${bill.id}-${line.id}`,
        businessId: bill.businessId,
        itemId: line.productId,
        warehouseId: line.warehouseId,
        date: bill.date,
        type: "purchase",
        quantity: line.quantity,
        value: line.quantity * line.unitCost,
        memo: bill.billNo,
      };
    });
}
