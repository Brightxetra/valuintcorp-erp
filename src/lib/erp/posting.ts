import {
  buildPayrollJournal,
  buildStockAdjustmentJournal,
} from "@/lib/accounting/engine";
import { createJournalEntry, makeLine } from "@/lib/accounting/engine";
import { systemAccounts } from "@/lib/accounting/chart";
import type { JournalEntry, PayrollRun, StockMovement } from "@/lib/domain/types";
import { valueInventory } from "@/lib/inventory/valuation";
import type {
  FixedAssetDepreciationRunInput,
  FixedAssetDisposalInput,
  FixedAssetInput,
  CreatePaymentInput,
  CreatePayrollRunInput,
  CreatePurchaseBillInput,
  CreateSalesInvoiceInput,
  CreateStockAdjustmentInput,
  ReverseFixedAssetDocumentInput,
  UpdateFixedAssetInput,
} from "@/lib/erp/schemas";
import type {
  ActivityEvent,
  ErpWorkspace,
  FixedAsset,
  FixedAssetDepreciationLine,
  FixedAssetDepreciationRun,
  FixedAssetDisposal,
  Payment,
  PaymentAllocation,
  PurchaseBill,
  SalesInvoice,
  StockAdjustment,
} from "@/lib/erp/types";
import {
  buildPaymentJournal,
  buildPurchaseBillJournal,
  buildSalesInvoiceJournal,
  movementFromPurchaseBill,
  outstandingPurchase,
  outstandingSales,
  paymentStatus,
  purchaseBillTotal,
  refreshErpWorkspace,
  salesInvoiceTotal,
} from "@/lib/erp/operations";
import {
  accumulatedDepreciationForAsset,
  buildFixedAssetAcquisitionJournal,
  buildFixedAssetDepreciationJournal,
  buildFixedAssetDisposalJournal,
  depreciationAmountForPeriod,
  disposalGainLoss,
} from "@/lib/erp/fixed-assets";
import {
  activeStructureForProduct,
  calculateProductUnitCost,
  explodeProductStructure,
} from "@/lib/erp/industry-workflows";

type PostingOptions = {
  actorName?: string;
  nowIso?: string;
  locationId?: string;
  source?: "manual" | "pos";
};

function timestamp(options?: PostingOptions): string {
  return options?.nowIso ?? new Date().toISOString();
}

function generatedId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return `${prefix}-${random}`;
}

function nextNumber(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function assertPeriodOpen(workspace: ErpWorkspace, date: string) {
  const period = workspace.period;

  if (period.locked && period.startDate <= date && date <= period.endDate) {
    throw new Error(`Periode ${period.label} sudah dikunci. Gunakan reversal atau koreksi.`);
  }
}

function assertDueDate(date: string, dueDate: string) {
  if (dueDate < date) {
    throw new Error("Tanggal jatuh tempo tidak boleh lebih awal dari tanggal dokumen.");
  }
}

function assertBusinessId(businessId: string, expectedBusinessId: string, label: string) {
  if (businessId !== expectedBusinessId) {
    throw new Error(`${label} tidak berada di bisnis aktif.`);
  }
}

function activity(
  workspace: ErpWorkspace,
  module: ActivityEvent["module"],
  action: string,
  description: string,
  options?: PostingOptions,
): ActivityEvent {
  return {
    id: generatedId("act"),
    businessId: workspace.business.id,
    actorName: options?.actorName ?? workspace.user.name,
    module,
    action,
    description,
    createdAt: timestamp(options),
  };
}

function defaultWarehouseId(workspace: ErpWorkspace, productId: string): string {
  const product = workspace.products.find((item) => item.id === productId);

  if (!product) {
    throw new Error("Produk tidak ditemukan.");
  }

  if (!product.defaultWarehouseId) {
    throw new Error(`Produk ${product.sku} belum punya gudang default.`);
  }

  return product.defaultWarehouseId;
}

function salesInputLines(input: CreateSalesInvoiceInput) {
  return input.items?.length
    ? input.items
    : [
        {
          productId: input.productId ?? "",
          warehouseId: input.warehouseId,
          quantity: input.quantity ?? 0,
          unitPrice: input.unitPrice ?? 0,
        },
      ];
}

function purchaseInputLines(input: CreatePurchaseBillInput) {
  return input.items?.length
    ? input.items
    : [
        {
          productId: input.productId ?? "",
          warehouseId: input.warehouseId,
          quantity: input.quantity ?? 0,
          unitCost: input.unitCost ?? 0,
        },
      ];
}

function assertStockWillNotGoNegative(workspace: ErpWorkspace, movements: StockMovement[]) {
  valueInventory([...workspace.stockMovements, ...movements]);
}

function refresh(workspace: Omit<ErpWorkspace, "metrics" | "tasks">): ErpWorkspace {
  return refreshErpWorkspace(workspace);
}

function movementFromWorkspaceSalesInvoice(workspace: ErpWorkspace, invoice: SalesInvoice): StockMovement[] {
  return invoice.lines.flatMap((line) => {
    const product = workspace.products.find((item) => item.id === line.productId);
    const warehouseId = line.warehouseId;
    if (!product || !warehouseId || line.quantity <= 0 || line.cogs <= 0) return [];

    const structure = activeStructureForProduct(product.id, workspace.productStructures);
    if (structure && product.fulfillmentMethod === "recipe_on_sale") {
      return Array.from(
        explodeProductStructure(product.id, line.quantity, workspace.products, workspace.productStructures),
      ).flatMap(([componentId, quantity]) => {
        const component = workspace.products.find((item) => item.id === componentId);
        if (!component?.trackStock || quantity <= 0) return [];
        const componentCost = calculateProductUnitCost(component, workspace.products, workspace.productStructures);
        return [{
          id: generatedId("sm-sale-recipe"),
          businessId: invoice.businessId,
          itemId: component.id,
          warehouseId,
          date: invoice.date,
          type: "sale" as const,
          quantity,
          value: quantity * componentCost,
          memo: invoice.invoiceNo,
        }];
      });
    }

    if (!product.trackStock) return [];

    return [{
      id: `sm-sale-${invoice.id}-${line.id}`,
      businessId: invoice.businessId,
      itemId: product.id,
      warehouseId,
      date: invoice.date,
      type: "sale" as const,
      quantity: line.quantity,
      value: line.quantity * line.cogs,
      memo: invoice.invoiceNo,
    }];
  });
}

export function postSalesInvoice(
  workspace: ErpWorkspace,
  input: CreateSalesInvoiceInput,
  options?: PostingOptions,
): ErpWorkspace {
  assertPeriodOpen(workspace, input.date);
  assertDueDate(input.date, input.dueDate);

  const customer = workspace.customers.find((item) => item.id === input.customerId);
  const inputLines = salesInputLines(input);

  if (!customer || !customer.isActive) {
    throw new Error("Customer tidak ditemukan atau tidak aktif.");
  }

  assertBusinessId(customer.businessId, workspace.business.id, "Customer");

  const invoice: SalesInvoice = {
    id: generatedId("sinv"),
    businessId: workspace.business.id,
    invoiceNo: nextNumber("INV-2026", workspace.salesInvoices.length),
    customerId: customer.id,
    date: input.date,
    dueDate: input.dueDate,
    status: "posted",
    lines: inputLines.map((line) => {
      const product = workspace.products.find((item) => item.id === line.productId);

      if (!product || product.isActive === false || !product.isSellable) {
        throw new Error("Produk tidak ditemukan atau tidak bisa dijual.");
      }

      assertBusinessId(product.businessId, workspace.business.id, "Produk");
      const warehouseId = line.warehouseId ?? product.defaultWarehouseId;
      const warehouse = workspace.warehouses.find((item) => item.id === warehouseId);

      if (!warehouse || !warehouse.isActive) {
        throw new Error("Gudang penjualan tidak ditemukan atau tidak aktif.");
      }

      assertBusinessId(warehouse.businessId, workspace.business.id, "Gudang");
      const hasStructure = Boolean(activeStructureForProduct(product.id, workspace.productStructures));
      const cogs = product.trackStock || hasStructure
        ? calculateProductUnitCost(product, workspace.products, workspace.productStructures)
        : 0;

      return {
        id: generatedId("sinv-line"),
        productId: product.id,
        warehouseId,
        description: product.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        cogs,
      };
    }),
    total: 0,
    paidAmount: 0,
    createdAt: timestamp(options),
    locationId: options?.locationId,
    source: options?.source,
  };
  invoice.total = salesInvoiceTotal(invoice);

  if (customer.creditLimit === 0) {
    throw new Error("Customer ini tidak memiliki credit limit. Terima pembayaran tunai sebelum posting invoice kredit.");
  }

  const customerOutstanding = workspace.salesInvoices
    .filter((item) => item.customerId === customer.id && item.status !== "void")
    .reduce((total, item) => total + outstandingSales(item), 0);

  if (customer.creditLimit > 0 && customerOutstanding + invoice.total > customer.creditLimit) {
    throw new Error("Credit limit customer akan terlampaui oleh invoice ini.");
  }

  const stockMovements = movementFromWorkspaceSalesInvoice(workspace, invoice);
  assertStockWillNotGoNegative(workspace, stockMovements);

  const journal = buildSalesInvoiceJournal(invoice);
  invoice.journalEntryId = journal.id;

  return refresh({
    ...workspace,
    salesInvoices: [invoice, ...workspace.salesInvoices],
    stockMovements: [...workspace.stockMovements, ...stockMovements],
    journals: [journal, ...workspace.journals],
    activities: [
      activity(
        workspace,
        "sales",
        "posted invoice",
        `${invoice.invoiceNo} dibuat, jurnal AR/revenue dipost, dan stok diperbarui.`,
        options,
      ),
      ...workspace.activities,
    ],
  });
}

export function postPurchaseBill(
  workspace: ErpWorkspace,
  input: CreatePurchaseBillInput,
  options?: PostingOptions,
): ErpWorkspace {
  assertPeriodOpen(workspace, input.date);
  assertDueDate(input.date, input.dueDate);

  const supplier = workspace.suppliers.find((item) => item.id === input.supplierId);
  const inputLines = purchaseInputLines(input);

  if (!supplier || !supplier.isActive) {
    throw new Error("Supplier tidak ditemukan atau tidak aktif.");
  }

  assertBusinessId(supplier.businessId, workspace.business.id, "Supplier");

  const bill: PurchaseBill = {
    id: generatedId("pbill"),
    businessId: workspace.business.id,
    billNo: nextNumber("BILL-2026", workspace.purchaseBills.length),
    supplierId: supplier.id,
    date: input.date,
    dueDate: input.dueDate,
    status: "posted",
    lines: inputLines.map((line) => {
      const product = workspace.products.find((item) => item.id === line.productId);

      if (!product || product.isActive === false || !product.isPurchasable) {
        throw new Error("Produk tidak ditemukan atau tidak bisa dibeli.");
      }

      assertBusinessId(product.businessId, workspace.business.id, "Produk");
      const warehouseId = line.warehouseId ?? defaultWarehouseId(workspace, product.id);
      const warehouse = workspace.warehouses.find((item) => item.id === warehouseId);

      if (!warehouse || !warehouse.isActive) {
        throw new Error("Gudang pembelian tidak ditemukan atau tidak aktif.");
      }

      assertBusinessId(warehouse.businessId, workspace.business.id, "Gudang");

      return {
        id: generatedId("pbill-line"),
        productId: product.id,
        warehouseId,
        description: product.name,
        quantity: line.quantity,
        unitCost: line.unitCost,
      };
    }),
    total: 0,
    paidAmount: 0,
    createdAt: timestamp(options),
  };
  bill.total = purchaseBillTotal(bill);
  const stockMovements = movementFromPurchaseBill(bill);
  const journal = buildPurchaseBillJournal(bill);
  bill.journalEntryId = journal.id;

  return refresh({
    ...workspace,
    purchaseBills: [bill, ...workspace.purchaseBills],
    stockMovements: [...workspace.stockMovements, ...stockMovements],
    journals: [journal, ...workspace.journals],
    activities: [
      activity(
        workspace,
        "purchases",
        "posted bill",
        `${bill.billNo} dibuat, jurnal AP/persediaan dipost, dan stok masuk diperbarui.`,
        options,
      ),
      ...workspace.activities,
    ],
  });
}

export function postPayment(
  workspace: ErpWorkspace,
  input: CreatePaymentInput,
  options?: PostingOptions,
): ErpWorkspace {
  assertPeriodOpen(workspace, input.date);

  if (input.documentType === "sales_invoice" && input.direction !== "inbound") {
    throw new Error("Invoice penjualan hanya boleh menerima payment inbound.");
  }

  if (input.documentType === "purchase_bill" && input.direction !== "outbound") {
    throw new Error("Purchase bill hanya boleh menerima payment outbound.");
  }

  if (input.documentType === "payroll_run" && input.direction !== "outbound") {
    throw new Error("Payroll run hanya boleh dibayar sebagai payment outbound.");
  }

  const payment: Payment = {
    id: generatedId("pay"),
    businessId: workspace.business.id,
    direction: input.direction,
    documentType: input.documentType,
    documentId: input.documentId,
    date: input.date,
    amount: input.amount,
    method: input.method,
    reference: nextNumber(input.direction === "inbound" ? "RCV" : "PAY", workspace.payments.length),
    status: "posted",
    createdAt: timestamp(options),
  };

  const salesInvoices = workspace.salesInvoices.map((invoice) => {
    if (input.documentType !== "sales_invoice" || invoice.id !== input.documentId) return invoice;
    if (invoice.status === "void" || invoice.status === "draft") {
      throw new Error("Invoice belum posted atau sudah void.");
    }
    if (input.amount > outstandingSales(invoice)) {
      throw new Error("Nominal payment melebihi piutang terbuka.");
    }

    const paidAmount = invoice.paidAmount + input.amount;

    return { ...invoice, paidAmount, status: paymentStatus(invoice.total, paidAmount) };
  });

  const purchaseBills = workspace.purchaseBills.map((bill) => {
    if (input.documentType !== "purchase_bill" || bill.id !== input.documentId) return bill;
    if (bill.status === "void" || bill.status === "draft") {
      throw new Error("Bill belum posted atau sudah void.");
    }
    if (input.amount > outstandingPurchase(bill)) {
      throw new Error("Nominal payment melebihi utang terbuka.");
    }

    const paidAmount = bill.paidAmount + input.amount;

    return { ...bill, paidAmount, status: paymentStatus(bill.total, paidAmount) };
  });

  if (
    input.documentType === "sales_invoice" &&
    !workspace.salesInvoices.some((invoice) => invoice.id === input.documentId)
  ) {
    throw new Error("Invoice tidak ditemukan.");
  }

  if (
    input.documentType === "purchase_bill" &&
    !workspace.purchaseBills.some((bill) => bill.id === input.documentId)
  ) {
    throw new Error("Bill tidak ditemukan.");
  }

  if (
    input.documentType === "payroll_run" &&
    !workspace.payrollRuns.some((payroll) => payroll.id === input.documentId)
  ) {
    throw new Error("Payroll run tidak ditemukan.");
  }

  const journal = buildPaymentJournal(payment);
  payment.journalEntryId = journal.id;
  const allocation: PaymentAllocation = {
    id: generatedId("alloc"),
    businessId: workspace.business.id,
    paymentId: payment.id,
    documentType: input.documentType,
    documentId: input.documentId,
    amount: input.amount,
    createdAt: timestamp(options),
  };

  return refresh({
    ...workspace,
    salesInvoices,
    purchaseBills,
    payments: [payment, ...workspace.payments],
    paymentAllocations: [allocation, ...workspace.paymentAllocations],
    journals: [journal, ...workspace.journals],
    activities: [
      activity(
        workspace,
        input.documentType === "payroll_run" ? "hr" : input.direction === "inbound" ? "sales" : "purchases",
        "posted payment",
        `${payment.reference} sebesar ${payment.amount} dipost dan dialokasikan ke dokumen sumber.`,
        options,
      ),
      ...workspace.activities,
    ],
  });
}

export function postStockAdjustment(
  workspace: ErpWorkspace,
  input: CreateStockAdjustmentInput,
  options?: PostingOptions,
): ErpWorkspace {
  assertPeriodOpen(workspace, input.date);

  const product = workspace.products.find((item) => item.id === input.itemId);
  const warehouse = workspace.warehouses.find((item) => item.id === input.warehouseId);

  if (!product || product.isActive === false || !product.trackStock) {
    throw new Error("Produk stok tidak ditemukan atau tidak aktif.");
  }

  if (!warehouse || !warehouse.isActive) {
    throw new Error("Gudang tidak ditemukan atau tidak aktif.");
  }

  assertBusinessId(product.businessId, workspace.business.id, "Produk");
  assertBusinessId(warehouse.businessId, workspace.business.id, "Gudang");

  const adjustment: StockAdjustment = {
    id: generatedId("adj"),
    businessId: workspace.business.id,
    adjustmentNo: nextNumber("ADJ-2026", workspace.stockAdjustments.length),
    itemId: input.itemId,
    warehouseId: input.warehouseId,
    quantity: input.quantity,
    value: input.value,
    reason: input.reason,
    date: input.date,
    status: "posted",
  };
  const movement: StockMovement = {
    id: generatedId("sm"),
    businessId: workspace.business.id,
    itemId: input.itemId,
    warehouseId: input.warehouseId,
    date: input.date,
    type: input.quantity >= 0 ? "adjustment_in" : "adjustment_out",
    quantity: Math.abs(input.quantity),
    value: input.value,
    memo: input.reason,
  };
  assertStockWillNotGoNegative(workspace, [movement]);

  const journal = buildStockAdjustmentJournal({
    businessId: workspace.business.id,
    date: input.date,
    inventoryDeltaValue: input.value,
    direction: input.quantity >= 0 ? "increase" : "decrease",
  });
  adjustment.journalEntryId = journal.id;
  movement.journalEntryId = journal.id;

  return refresh({
    ...workspace,
    stockAdjustments: [adjustment, ...workspace.stockAdjustments],
    stockMovements: [...workspace.stockMovements, movement],
    journals: [journal, ...workspace.journals],
    activities: [
      activity(
        workspace,
        "inventory",
        "stock adjustment",
        `${adjustment.adjustmentNo} dipost untuk ${input.reason}.`,
        options,
      ),
      ...workspace.activities,
    ],
  });
}

export function runPayroll(
  workspace: ErpWorkspace,
  input: CreatePayrollRunInput,
  options?: PostingOptions,
): ErpWorkspace {
  assertPeriodOpen(workspace, input.date);

  const employee = workspace.employees.find((item) => item.id === input.employeeId);

  if (!employee || employee.status === "inactive") {
    throw new Error("Karyawan tidak ditemukan atau tidak aktif.");
  }

  assertBusinessId(employee.businessId, workspace.business.id, "Karyawan");

  const salaryPayable = input.grossPay - input.netCashPaid - input.taxWithheld;

  if (salaryPayable < 0) {
    throw new Error("Net cash paid dan pajak tidak boleh melebihi gross pay.");
  }

  const journal = buildPayrollJournal({
    businessId: workspace.business.id,
    date: input.date,
    grossPay: input.grossPay,
    netCashPaid: input.netCashPaid,
    taxWithheld: input.taxWithheld,
    salaryPayable,
  });
  const payroll: PayrollRun = {
    id: generatedId("payroll"),
    businessId: workspace.business.id,
    period: input.date.slice(0, 7),
    employeeId: employee.id,
    grossPay: input.grossPay,
    deductions: 0,
    taxWithheld: input.taxWithheld,
    netPay: input.netCashPaid,
    components: [{ name: "Gaji pokok", amount: input.grossPay, type: "earning" }],
    journalEntryId: journal.id,
  };

  return refresh({
    ...workspace,
    payrollRuns: [payroll, ...workspace.payrollRuns],
    journals: [journal, ...workspace.journals],
    activities: [
      activity(
        workspace,
        "hr",
        "payroll run",
        `Payroll ${employee.name} dipost, jurnal gaji dibuat, dan saldo utang gaji diperbarui.`,
        options,
      ),
      ...workspace.activities,
    ],
  });
}

function activeFixedAssetDepreciationLines(workspace: ErpWorkspace) {
  const postedRunIds = new Set(
    workspace.fixedAssetDepreciationRuns
      .filter((run) => run.status === "posted")
      .map((run) => run.id),
  );

  return workspace.fixedAssetDepreciationLines.filter((line) => postedRunIds.has(line.runId));
}

function reverseJournalEntry(workspace: ErpWorkspace, journal: JournalEntry, date: string, reason: string): JournalEntry {
  return createJournalEntry({
    businessId: workspace.business.id,
    date,
    description: `Reversal - ${journal.description}: ${reason}`,
    source: "reversal",
    referenceId: journal.id,
    lines: journal.lines.map((line) =>
      line.debit > 0
        ? makeLine(systemAccounts, line.accountCode, "credit", line.debit, reason)
        : makeLine(systemAccounts, line.accountCode, "debit", line.credit, reason),
    ),
    accounts: systemAccounts,
  });
}

export function saveFixedAsset(
  workspace: ErpWorkspace,
  input: FixedAssetInput | UpdateFixedAssetInput,
  options?: PostingOptions,
): ErpWorkspace {
  assertPeriodOpen(workspace, input.acquisitionDate);

  if (input.locationId) {
    const location = workspace.locations.find((item) => item.id === input.locationId);
    if (!location || location.businessId !== workspace.business.id) {
      throw new Error("Lokasi aset tidak ditemukan.");
    }
  }

  if (input.supplierId) {
    const supplier = workspace.suppliers.find((item) => item.id === input.supplierId);
    if (!supplier || supplier.businessId !== workspace.business.id) {
      throw new Error("Supplier aset tidak ditemukan.");
    }
  }

  const existingId = "id" in input ? input.id : undefined;
  const existing = existingId ? workspace.fixedAssets.find((asset) => asset.id === existingId) : undefined;

  if (existingId && !existing) {
    throw new Error("Aset tetap tidak ditemukan.");
  }

  if (existing?.status === "disposed") {
    throw new Error("Aset yang sudah dilepas tidak bisa diedit.");
  }

  const asset: FixedAsset = {
    id: existing?.id ?? generatedId("asset"),
    businessId: workspace.business.id,
    assetNo: input.assetNo ?? existing?.assetNo ?? nextNumber("FA-2026", workspace.fixedAssets.length),
    name: input.name,
    category: input.category,
    acquisitionDate: input.acquisitionDate,
    acquisitionCost: input.acquisitionCost,
    residualValue: input.residualValue,
    usefulLifeMonths: input.usefulLifeMonths,
    depreciationMethod: input.depreciationMethod,
    acquisitionType: input.acquisitionType,
    status: existing?.status ?? "active",
    locationId: input.locationId,
    supplierId: input.supplierId,
    journalEntryId: existing?.journalEntryId,
    notes: input.notes,
    createdAt: existing?.createdAt ?? timestamp(options),
  };

  const hasDepreciation = workspace.fixedAssetDepreciationLines.some((line) => line.assetId === asset.id);

  if (existing && hasDepreciation) {
    asset.acquisitionDate = existing.acquisitionDate;
    asset.acquisitionCost = existing.acquisitionCost;
    asset.residualValue = existing.residualValue;
    asset.usefulLifeMonths = existing.usefulLifeMonths;
    asset.depreciationMethod = existing.depreciationMethod;
    asset.acquisitionType = existing.acquisitionType;
  }

  const journal =
    !existing && asset.acquisitionType !== "opening_balance"
      ? buildFixedAssetAcquisitionJournal({
          businessId: workspace.business.id,
          assetId: asset.id,
          assetNo: asset.assetNo,
          date: asset.acquisitionDate,
          amount: asset.acquisitionCost,
          acquisitionType: asset.acquisitionType,
        })
      : undefined;

  if (journal) {
    asset.journalEntryId = journal.id;
  }

  return refresh({
    ...workspace,
    fixedAssets: existing
      ? workspace.fixedAssets.map((item) => (item.id === asset.id ? asset : item))
      : [asset, ...workspace.fixedAssets],
    journals: journal ? [journal, ...workspace.journals] : workspace.journals,
    activities: [
      activity(
        workspace,
        "accounting",
        existing ? "fixed asset updated" : "fixed asset created",
        `${asset.assetNo} ${existing ? "diperbarui" : "dicatat"}.`,
        options,
      ),
      ...workspace.activities,
    ],
  });
}

export function postFixedAssetDepreciationRun(
  workspace: ErpWorkspace,
  input: FixedAssetDepreciationRunInput,
  options?: PostingOptions,
): ErpWorkspace {
  assertPeriodOpen(workspace, input.date);

  if (workspace.fixedAssetDepreciationRuns.some((run) => run.period === input.period && run.status === "posted")) {
    throw new Error(`Penyusutan periode ${input.period} sudah dipost.`);
  }

  const activeLines = activeFixedAssetDepreciationLines(workspace);
  const eligibleAssets = workspace.fixedAssets.filter(
    (asset) => asset.status === "active" && asset.acquisitionDate <= input.date,
  );
  const lineDrafts = eligibleAssets
    .map((asset) => {
      const amount = depreciationAmountForPeriod(asset, activeLines);
      const accumulatedBefore = accumulatedDepreciationForAsset(asset.id, activeLines);
      const accumulatedDepreciation = accumulatedBefore + amount;
      const bookValue = Math.max(asset.acquisitionCost - accumulatedDepreciation, 0);

      return { asset, amount, accumulatedDepreciation, bookValue };
    })
    .filter((line) => line.amount > 0);

  if (lineDrafts.length === 0) {
    throw new Error("Tidak ada aset yang dapat disusutkan pada periode ini.");
  }

  const run: FixedAssetDepreciationRun = {
    id: generatedId("dep-run"),
    businessId: workspace.business.id,
    period: input.period,
    date: input.date,
    status: "posted",
    totalDepreciation: lineDrafts.reduce((total, line) => total + line.amount, 0),
    createdAt: timestamp(options),
  };
  const journal = buildFixedAssetDepreciationJournal({
    businessId: workspace.business.id,
    runId: run.id,
    period: run.period,
    date: run.date,
    amount: run.totalDepreciation,
  });
  run.journalEntryId = journal.id;
  const createdAt = timestamp(options);
  const lines: FixedAssetDepreciationLine[] = lineDrafts.map((line) => ({
    id: generatedId("dep-line"),
    businessId: workspace.business.id,
    runId: run.id,
    assetId: line.asset.id,
    period: run.period,
    amount: line.amount,
    accumulatedDepreciation: line.accumulatedDepreciation,
    bookValue: line.bookValue,
    createdAt,
  }));
  const fullyDepreciatedAssetIds = new Set(
    lineDrafts
      .filter((line) => line.bookValue <= line.asset.residualValue)
      .map((line) => line.asset.id),
  );

  return refresh({
    ...workspace,
    fixedAssets: workspace.fixedAssets.map((asset) =>
      fullyDepreciatedAssetIds.has(asset.id) ? { ...asset, status: "fully_depreciated" } : asset,
    ),
    fixedAssetDepreciationRuns: [run, ...workspace.fixedAssetDepreciationRuns],
    fixedAssetDepreciationLines: [...lines, ...workspace.fixedAssetDepreciationLines],
    journals: [journal, ...workspace.journals],
    activities: [
      activity(
        workspace,
        "accounting",
        "fixed asset depreciation",
        `Penyusutan ${run.period} sebesar ${run.totalDepreciation} dipost.`,
        options,
      ),
      ...workspace.activities,
    ],
  });
}

export function disposeFixedAsset(
  workspace: ErpWorkspace,
  input: FixedAssetDisposalInput,
  options?: PostingOptions,
): ErpWorkspace {
  assertPeriodOpen(workspace, input.date);

  const asset = workspace.fixedAssets.find((item) => item.id === input.assetId);

  if (!asset || asset.businessId !== workspace.business.id) {
    throw new Error("Aset tetap tidak ditemukan.");
  }

  if (asset.status === "disposed") {
    throw new Error("Aset tetap sudah dilepas.");
  }

  const activeLines = activeFixedAssetDepreciationLines(workspace);
  const accumulatedDepreciation = accumulatedDepreciationForAsset(asset.id, activeLines);
  const { bookValue, gainLoss } = disposalGainLoss({
    acquisitionCost: asset.acquisitionCost,
    accumulatedDepreciation,
    proceeds: input.proceeds,
  });
  const disposal: FixedAssetDisposal = {
    id: generatedId("asset-disposal"),
    businessId: workspace.business.id,
    assetId: asset.id,
    date: input.date,
    proceeds: input.proceeds,
    bookValue,
    gainLoss,
    reason: input.reason,
    status: "posted",
    createdAt: timestamp(options),
  };
  const journal = buildFixedAssetDisposalJournal({
    businessId: workspace.business.id,
    disposal,
    asset,
    accumulatedDepreciation,
  });
  disposal.journalEntryId = journal.id;

  return refresh({
    ...workspace,
    fixedAssets: workspace.fixedAssets.map((item) =>
      item.id === asset.id ? { ...item, status: "disposed" } : item,
    ),
    fixedAssetDisposals: [disposal, ...workspace.fixedAssetDisposals],
    journals: [journal, ...workspace.journals],
    activities: [
      activity(
        workspace,
        "accounting",
        "fixed asset disposed",
        `${asset.assetNo} dilepas dengan nilai buku ${bookValue}.`,
        options,
      ),
      ...workspace.activities,
    ],
  });
}

export function reverseFixedAssetDocument(
  workspace: ErpWorkspace,
  input: ReverseFixedAssetDocumentInput,
  options?: PostingOptions,
): ErpWorkspace {
  assertPeriodOpen(workspace, input.date);

  if (input.targetType === "depreciation_run") {
    const run = workspace.fixedAssetDepreciationRuns.find((item) => item.id === input.targetId);
    if (!run || run.status !== "posted" || !run.journalEntryId) {
      throw new Error("Run penyusutan tidak ditemukan atau sudah dibalik.");
    }

    const journal = workspace.journals.find((item) => item.id === run.journalEntryId);
    if (!journal) throw new Error("Jurnal penyusutan tidak ditemukan.");
    const reversal = reverseJournalEntry(workspace, journal, input.date, input.reason);
    const affectedAssetIds = new Set(
      workspace.fixedAssetDepreciationLines
        .filter((line) => line.runId === run.id)
        .map((line) => line.assetId),
    );

    return refresh({
      ...workspace,
      fixedAssets: workspace.fixedAssets.map((asset) =>
        affectedAssetIds.has(asset.id) && asset.status === "fully_depreciated"
          ? { ...asset, status: "active" }
          : asset,
      ),
      fixedAssetDepreciationRuns: workspace.fixedAssetDepreciationRuns.map((item) =>
        item.id === run.id ? { ...item, status: "reversed" } : item,
      ),
      journals: [
        reversal,
        ...workspace.journals.map((item) =>
          item.id === journal.id ? { ...item, status: "reversed" as const, reversedEntryId: reversal.id } : item,
        ),
      ],
      activities: [
        activity(workspace, "accounting", "fixed asset depreciation reversed", `${run.period} dibalik.`, options),
        ...workspace.activities,
      ],
    });
  }

  const disposal = workspace.fixedAssetDisposals.find((item) => item.id === input.targetId);
  if (!disposal || disposal.status !== "posted" || !disposal.journalEntryId) {
    throw new Error("Disposal aset tidak ditemukan atau sudah dibalik.");
  }

  const journal = workspace.journals.find((item) => item.id === disposal.journalEntryId);
  if (!journal) throw new Error("Jurnal disposal tidak ditemukan.");
  const reversal = reverseJournalEntry(workspace, journal, input.date, input.reason);

  return refresh({
    ...workspace,
    fixedAssets: workspace.fixedAssets.map((asset) =>
      asset.id === disposal.assetId ? { ...asset, status: "active" } : asset,
    ),
    fixedAssetDisposals: workspace.fixedAssetDisposals.map((item) =>
      item.id === disposal.id ? { ...item, status: "reversed" } : item,
    ),
    journals: [
      reversal,
      ...workspace.journals.map((item) =>
        item.id === journal.id ? { ...item, status: "reversed" as const, reversedEntryId: reversal.id } : item,
      ),
    ],
    activities: [
      activity(workspace, "accounting", "fixed asset disposal reversed", `${disposal.id} dibalik.`, options),
      ...workspace.activities,
    ],
  });
}
