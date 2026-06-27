import { createDemoErpWorkspace } from "@/lib/erp/demo-workspace";
import type {
  CreatePaymentInput,
  CreatePayrollRunInput,
  CreateBranchExpenseInput,
  CreatePurchaseBillInput,
  ApplyIndustryTemplateInput,
  FixedAssetDepreciationRunInput,
  FixedAssetDisposalInput,
  FixedAssetInput,
  ImportBatchActionInput,
  LocationInput,
  ReverseFixedAssetDocumentInput,
  CreateSalesInvoiceInput,
  CreateStockAdjustmentInput,
  CreateStockReceiptInput,
  CreateStockTransferInput,
  MrpRunInput,
  ProductStructureInput,
  LockPeriodInput,
  SummaryActionInput,
  UpdateFixedAssetInput,
  UploadRawImportInput,
  VoidDocumentInput,
} from "@/lib/erp/schemas";
import type {
  ActivityEvent,
  Attachment,
  Customer,
  DailyTransactionSummary,
  ErpWorkspace,
  ImportBatch,
  Location,
  Product,
  RawTransaction,
  RawTransactionLine,
  Supplier,
} from "@/lib/erp/types";
import { accountCodes, systemAccounts } from "@/lib/accounting/chart";
import { createJournalEntry, makeLine } from "@/lib/accounting/engine";
import type { ChartOfAccount, Employee, StockMovement, Warehouse } from "@/lib/domain/types";
import {
  postPayment,
  postPurchaseBill,
  postSalesInvoice,
  postStockAdjustment,
  disposeFixedAsset,
  postFixedAssetDepreciationRun,
  reverseFixedAssetDocument,
  runPayroll,
  saveFixedAsset,
} from "@/lib/erp/posting";
import { refreshErpWorkspace } from "@/lib/erp/operations";
import {
  buildSummaryJournal,
  defaultProductTypeForTemplate,
  featureFlagsForTemplate,
  markRawTransactionStatuses,
  recomputeRawImportBatch,
  summarizeRawTransactions,
  validateRawTransactions,
} from "@/lib/erp/horizontal";
import { valueInventory } from "@/lib/inventory/valuation";
import { buildMrpRecommendations, calculateProductUnitCost } from "@/lib/erp/industry-workflows";
type DemoBranchExpense = {
  id: string;
  locationId: string;
  date: string;
  amount: number;
  category: string;
  memo?: string;
  journalEntryId: string;
};


const demoGlobal = globalThis as typeof globalThis & {
  __valuintcorpDemoWorkspace?: ErpWorkspace;
  __valuintcorpDemoBranchExpenses?: DemoBranchExpense[];
};

let workspace = demoGlobal.__valuintcorpDemoWorkspace ?? createDemoErpWorkspace();
demoGlobal.__valuintcorpDemoWorkspace = workspace;
let branchExpenses = demoGlobal.__valuintcorpDemoBranchExpenses ?? [];

function currentWorkspace(): ErpWorkspace {
  workspace = demoGlobal.__valuintcorpDemoWorkspace ?? workspace;
  return workspace;
}

function setDemoWorkspace(nextWorkspace: ErpWorkspace): ErpWorkspace {
  workspace = nextWorkspace;
  demoGlobal.__valuintcorpDemoWorkspace = nextWorkspace;
  return workspace;
}

function generatedId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return `${prefix}-${random}`;
}

function nowIso() {
  return new Date().toISOString();
}

type WorkspaceData = Omit<ErpWorkspace, "metrics" | "tasks" | "locationMetrics"> &
  Partial<Pick<ErpWorkspace, "locationMetrics">>;

function refresh(nextWorkspace: WorkspaceData) {
  return setDemoWorkspace(refreshErpWorkspace(nextWorkspace));
}

function activity(module: ActivityEvent["module"], action: string, description: string): ActivityEvent {
  return {
    id: generatedId("act"),
    businessId: workspace.business.id,
    actorName: workspace.user.name,
    module,
    action,
    description,
    createdAt: nowIso(),
  };
}

function upsertById<T extends { id: string }>(items: T[], id: string | undefined, create: T, update: Partial<T>) {
  if (!id) return [create, ...items];

  return items.map((item) => (item.id === id ? { ...item, ...update } : item));
}

export function getDemoErpStore(): ErpWorkspace {
  return currentWorkspace();
}

export function resetDemoErpStore(): ErpWorkspace {
  branchExpenses = [];
  demoGlobal.__valuintcorpDemoBranchExpenses = branchExpenses;
  return setDemoWorkspace(createDemoErpWorkspace());
}
export function getDemoBranchExpenses(locationId: string, date: string): DemoBranchExpense[] {
  return branchExpenses.filter((expense) => expense.locationId === locationId && expense.date === date);
}

export function createDemoBranchExpense(input: CreateBranchExpenseInput & { date: string }): { expenseId: string; workspace: ErpWorkspace } {
  workspace = currentWorkspace();
  const location = workspace.locations.find((item) => item.id === input.locationId && item.isActive && ["branch", "outlet", "store"].includes(item.type));
  if (!location) throw new Error("Cabang aktif tidak ditemukan.");
  if (workspace.period.locked && workspace.period.startDate <= input.date && input.date <= workspace.period.endDate) throw new Error(`Periode ${workspace.period.label} sudah dikunci.`);
  const expenseId = generatedId("branch-expense");
  const journal = createJournalEntry({
    businessId: workspace.business.id,
    date: input.date,
    description: `Biaya cabang ${input.category}`,
    source: "manual_transaction",
    referenceId: expenseId,
    createdByRole: workspace.user.role,
    lines: [
      makeLine(systemAccounts, accountCodes.operatingExpense, "debit", input.amount, input.memo),
      makeLine(systemAccounts, accountCodes.cash, "credit", input.amount, input.memo),
    ],
  });
  const expense: DemoBranchExpense = {
    id: expenseId,
    locationId: input.locationId,
    date: input.date,
    amount: input.amount,
    category: input.category,
    memo: input.memo,
    journalEntryId: journal.id,
  };
  branchExpenses = [expense, ...branchExpenses];
  demoGlobal.__valuintcorpDemoBranchExpenses = branchExpenses;
  workspace = refresh({
    ...workspace,
    journals: [journal, ...workspace.journals],
    activities: [
      activity("accounting", "posted branch expense", `Biaya ${input.category} dicatat untuk ${location.name}.`),
      ...workspace.activities,
    ],
  });
  return { expenseId, workspace };
}


export function createDemoSalesInvoice(input: CreateSalesInvoiceInput, metadata?: { locationId?: string; source?: "manual" | "pos" }): ErpWorkspace {
  workspace = currentWorkspace();
  workspace = postSalesInvoice(workspace, input, metadata);
  return setDemoWorkspace(workspace);
}

export function createDemoPurchaseBill(input: CreatePurchaseBillInput): ErpWorkspace {
  workspace = currentWorkspace();
  workspace = postPurchaseBill(workspace, input);
  return setDemoWorkspace(workspace);
}

export function createDemoPayment(input: CreatePaymentInput): ErpWorkspace {
  workspace = currentWorkspace();
  workspace = postPayment(workspace, input);
  return setDemoWorkspace(workspace);
}

export function createDemoStockAdjustment(input: CreateStockAdjustmentInput): ErpWorkspace {
  workspace = currentWorkspace();
  workspace = postStockAdjustment(workspace, input);
  return setDemoWorkspace(workspace);
}

export function createDemoStockReceipt(input: CreateStockReceiptInput): ErpWorkspace {
  workspace = currentWorkspace();
  const product = workspace.products.find((item) => item.id === input.itemId);
  const warehouse = workspace.warehouses.find((item) => item.id === input.warehouseId);

  if (!product || product.isActive === false || !product.trackStock || !product.isPurchasable) {
    throw new Error("Produk stok tidak ditemukan atau tidak bisa dibeli.");
  }

  if (!warehouse || !warehouse.isActive) {
    throw new Error("Gudang tidak ditemukan atau tidak aktif.");
  }

  const movement: StockMovement = {
    id: generatedId("sm"),
    businessId: workspace.business.id,
    itemId: input.itemId,
    warehouseId: input.warehouseId,
    date: input.date,
    type: "purchase",
    quantity: input.quantity,
    value: input.quantity * input.unitCost,
    memo: input.memo ?? "Stok masuk manual",
  };

  return refresh({
    ...workspace,
    stockMovements: [...workspace.stockMovements, movement],
    activities: [activity("inventory", "stock receipt", `${product.sku} stok masuk ${input.quantity} ${product.unit}.`), ...workspace.activities],
  });
}

export function saveDemoProductStructure(input: ProductStructureInput): ErpWorkspace {
  workspace = currentWorkspace();
  const parent = workspace.products.find((item) => item.id === input.parentProductId && item.businessId === workspace.business.id);
  if (!parent) throw new Error("Produk utama resep/BOM tidak ditemukan.");

  const structureId = input.id ?? generatedId("structure");
  const lineProducts = new Map(workspace.products.map((product) => [product.id, product]));
  const lines = input.lines.map((line) => {
    const component = lineProducts.get(line.componentProductId);
    if (!component) throw new Error("Komponen resep/BOM tidak ditemukan.");
    return {
      id: generatedId("structure-line"),
      businessId: workspace.business.id,
      structureId,
      componentProductId: component.id,
      quantity: line.quantity,
      wastePercent: line.wastePercent,
      unitCostSnapshot: line.unitCostSnapshot || calculateProductUnitCost(component, workspace.products, workspace.productStructures),
      notes: line.notes,
    };
  });

  const structure = {
    id: structureId,
    businessId: workspace.business.id,
    parentProductId: parent.id,
    type: input.type,
    outputQuantity: input.outputQuantity,
    yieldPercent: input.yieldPercent,
    isActive: input.isActive,
    notes: input.notes,
    lines,
    updatedAt: nowIso(),
  };

  return refresh({
    ...workspace,
    productStructures: upsertById(workspace.productStructures, input.id, structure, structure),
    activities: [activity("inventory", input.id ? "structure updated" : "structure created", `${parent.sku} resep/BOM disimpan.`), ...workspace.activities],
  });
}

export function runDemoMrp(input: MrpRunInput): ErpWorkspace {
  workspace = currentWorkspace();
  const now = nowIso();
  const run = {
    id: generatedId("mrp"),
    businessId: workspace.business.id,
    name: input.name,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: "planned" as const,
    createdAt: now,
  };
  const createdForecasts = input.forecasts.map((forecast) => ({
    id: generatedId("forecast"),
    businessId: workspace.business.id,
    productId: forecast.productId,
    locationId: forecast.locationId,
    periodStart: forecast.periodStart,
    periodEnd: forecast.periodEnd,
    quantity: forecast.quantity,
    source: forecast.source,
    notes: forecast.notes,
    createdAt: now,
  }));
  const activeForecasts = [...workspace.demandForecasts, ...createdForecasts].filter(
    (forecast) => forecast.periodStart <= input.periodEnd && forecast.periodEnd >= input.periodStart,
  );
  const recommendations = buildMrpRecommendations({
    businessId: workspace.business.id,
    periodEnd: input.periodEnd,
    products: workspace.products,
    structures: workspace.productStructures,
    stockMovements: workspace.stockMovements,
    forecasts: activeForecasts,
    mrpRunId: run.id,
    nowIso: now,
  }).map((recommendation) => ({ ...recommendation, id: generatedId("mrp-rec") }));

  return refresh({
    ...workspace,
    demandForecasts: [...createdForecasts, ...workspace.demandForecasts],
    mrpRuns: [run, ...workspace.mrpRuns],
    mrpRecommendations: [...recommendations, ...workspace.mrpRecommendations],
    activities: [activity("inventory", "mrp run", `${run.name} menghasilkan ${recommendations.length} rekomendasi.`), ...workspace.activities],
  });
}

export function createDemoPayrollRun(input: CreatePayrollRunInput): ErpWorkspace {
  workspace = currentWorkspace();
  workspace = runPayroll(workspace, input);
  return setDemoWorkspace(workspace);
}

export function saveDemoFixedAsset(input: FixedAssetInput | UpdateFixedAssetInput): ErpWorkspace {
  workspace = currentWorkspace();
  workspace = saveFixedAsset(workspace, input);
  return setDemoWorkspace(workspace);
}

export function createDemoFixedAssetDepreciationRun(input: FixedAssetDepreciationRunInput): ErpWorkspace {
  workspace = currentWorkspace();
  workspace = postFixedAssetDepreciationRun(workspace, input);
  return setDemoWorkspace(workspace);
}

export function createDemoFixedAssetDisposal(input: FixedAssetDisposalInput): ErpWorkspace {
  workspace = currentWorkspace();
  workspace = disposeFixedAsset(workspace, input);
  return setDemoWorkspace(workspace);
}

export function reverseDemoFixedAssetDocument(input: ReverseFixedAssetDocumentInput): ErpWorkspace {
  workspace = currentWorkspace();
  workspace = reverseFixedAssetDocument(workspace, input);
  return setDemoWorkspace(workspace);
}

export function saveDemoMasterData(
  resource: "customer" | "supplier" | "product" | "warehouse" | "employee" | "business" | "tax_profile",
  id: string | undefined,
  values: Record<string, unknown>,
): ErpWorkspace {
  workspace = currentWorkspace();
  if (resource === "business") {
    return refresh({
      ...workspace,
      business: {
        ...workspace.business,
        legalName: String(values.legalName ?? workspace.business.legalName),
        displayName: String(values.displayName ?? workspace.business.displayName),
        ownerName: String(values.ownerName ?? workspace.business.ownerName),
        industry: String(values.industry ?? workspace.business.industry) as typeof workspace.business.industry,
        taxId: typeof values.taxId === "string" ? values.taxId : undefined,
        logoUrl: typeof values.logoUrl === "string" && values.logoUrl.length > 0 ? values.logoUrl : workspace.business.logoUrl,
        periodStartMonth: Number(values.periodStartMonth ?? workspace.business.periodStartMonth),
      },
      activities: [activity("accounting", "business updated", "Profil bisnis demo diperbarui."), ...workspace.activities],
    });
  }

  if (resource === "tax_profile") {
    return refresh({
      ...workspace,
      taxProfile: {
        ...workspace.taxProfile,
        taxpayerType: String(values.taxpayerType ?? workspace.taxProfile.taxpayerType) as typeof workspace.taxProfile.taxpayerType,
        usesFinalUmkmRate: Boolean(values.usesFinalUmkmRate ?? workspace.taxProfile.usesFinalUmkmRate),
        finalUmkmRate: Number(values.finalUmkmRate ?? workspace.taxProfile.finalUmkmRate),
        coretaxStatus: String(values.coretaxStatus ?? workspace.taxProfile.coretaxStatus) as typeof workspace.taxProfile.coretaxStatus,
      },
      activities: [activity("tax", "tax profile updated", "Profil pajak demo diperbarui."), ...workspace.activities],
    });
  }

  if (resource === "customer") {
    const customer: Customer = {
      id: id ?? generatedId("cust"),
      businessId: workspace.business.id,
      code: String(values.code),
      name: String(values.name),
      phone: typeof values.phone === "string" ? values.phone : undefined,
      email: typeof values.email === "string" ? values.email : undefined,
      address: typeof values.address === "string" ? values.address : undefined,
      creditLimit: Number(values.creditLimit ?? 0),
      isActive: Boolean(values.isActive ?? true),
    };
    return refresh({
      ...workspace,
      customers: upsertById(workspace.customers, id, customer, customer),
      activities: [activity("sales", id ? "customer updated" : "customer created", `${customer.name} disimpan.`), ...workspace.activities],
    });
  }

  if (resource === "supplier") {
    const supplier: Supplier = {
      id: id ?? generatedId("sup"),
      businessId: workspace.business.id,
      code: String(values.code),
      name: String(values.name),
      phone: typeof values.phone === "string" ? values.phone : undefined,
      email: typeof values.email === "string" ? values.email : undefined,
      address: typeof values.address === "string" ? values.address : undefined,
      isActive: Boolean(values.isActive ?? true),
    };
    return refresh({
      ...workspace,
      suppliers: upsertById(workspace.suppliers, id, supplier, supplier),
      activities: [activity("purchases", id ? "supplier updated" : "supplier created", `${supplier.name} disimpan.`), ...workspace.activities],
    });
  }

  if (resource === "product") {
    const product: Product = {
      id: id ?? generatedId("item"),
      businessId: workspace.business.id,
      sku: String(values.sku),
      name: String(values.name),
      variant: typeof values.variant === "string" ? values.variant : undefined,
      productType: String(values.productType ?? (Boolean(values.trackStock ?? true) ? "stock_item" : "service")) as Product["productType"],
      industryItemType: String(values.industryItemType ?? "retail_sku") as Product["industryItemType"],
      fulfillmentMethod: String(values.fulfillmentMethod ?? (Boolean(values.trackStock ?? true) ? "buy_stock" : "non_stock")) as Product["fulfillmentMethod"],
      category: String(values.category ?? "Umum"),
      unit: String(values.unit ?? "unit"),
      trackStock: Boolean(values.trackStock ?? values.productType === "stock_item"),
      defaultWarehouseId: String(values.defaultWarehouseId ?? workspace.warehouses[0]?.id ?? ""),
      sellingPrice: Number(values.sellingPrice ?? 0),
      purchasePrice: Number(values.purchasePrice ?? 0),
      reorderPoint: Number(values.reorderPoint ?? 0),
      safetyStock: Number(values.safetyStock ?? 0),
      minimumOrderQty: Number(values.minimumOrderQty ?? 0),
      leadTimeDays: Number(values.leadTimeDays ?? 0),
      productionLeadTimeDays: Number(values.productionLeadTimeDays ?? 0),
      makeOrBuy: String(values.makeOrBuy ?? "buy") as Product["makeOrBuy"],
      isSellable: Boolean(values.isSellable ?? true),
      isPurchasable: Boolean(values.isPurchasable ?? true),
      isActive: Boolean(values.isActive ?? true),
    };
    return refresh({
      ...workspace,
      products: upsertById(workspace.products, id, product, product),
      activities: [activity("inventory", id ? "product updated" : "product created", `${product.sku} disimpan.`), ...workspace.activities],
    });
  }

  if (resource === "warehouse") {
    const warehouse: Warehouse = {
      id: id ?? generatedId("wh"),
      businessId: workspace.business.id,
      code: String(values.code),
      name: String(values.name),
      location: String(values.location ?? ""),
      isActive: Boolean(values.isActive ?? true),
    };
    return refresh({
      ...workspace,
      warehouses: upsertById(workspace.warehouses, id, warehouse, warehouse),
      activities: [activity("inventory", id ? "warehouse updated" : "warehouse created", `${warehouse.name} disimpan.`), ...workspace.activities],
    });
  }

  const employee: Employee = {
    id: id ?? generatedId("emp"),
    businessId: workspace.business.id,
    employeeNo: String(values.employeeNo),
    name: String(values.name),
    department: typeof values.department === "string" ? values.department : undefined,
    role: String(values.role),
    contractType: String(values.contractType ?? "contract") as Employee["contractType"],
    status: String(values.status ?? "active") as Employee["status"],
    baseSalary: Number(values.baseSalary ?? 0),
    dailyRate: Number(values.dailyRate ?? 0) || undefined,
    joinedAt: String(values.joinedAt),
    phone: typeof values.phone === "string" ? values.phone : undefined,
    email: typeof values.email === "string" ? values.email : undefined,
    address: typeof values.address === "string" ? values.address : undefined,
    taxStatus: typeof values.taxStatus === "string" ? values.taxStatus : undefined,
    npwp: typeof values.npwp === "string" ? values.npwp : undefined,
    bankName: typeof values.bankName === "string" ? values.bankName : undefined,
    bankAccountNo: typeof values.bankAccountNo === "string" ? values.bankAccountNo : undefined,
    bankAccountName: typeof values.bankAccountName === "string" ? values.bankAccountName : undefined,
    bpjsHealthNo: typeof values.bpjsHealthNo === "string" ? values.bpjsHealthNo : undefined,
    bpjsEmploymentNo: typeof values.bpjsEmploymentNo === "string" ? values.bpjsEmploymentNo : undefined,
  };

  return refresh({
    ...workspace,
    employees: upsertById(workspace.employees, id, employee, employee),
    activities: [activity("hr", id ? "employee updated" : "employee created", `${employee.name} disimpan.`), ...workspace.activities],
  });
}

export function saveDemoChartOfAccount(id: string | undefined, values: Record<string, unknown>): ErpWorkspace {
  workspace = currentWorkspace();
  const account: ChartOfAccount = {
    id: id ?? generatedId("coa"),
    businessId: workspace.business.id,
    code: String(values.code),
    name: String(values.name),
    type: String(values.type) as ChartOfAccount["type"],
    normalBalance: String(values.normalBalance) as ChartOfAccount["normalBalance"],
    category: String(values.category) as ChartOfAccount["category"],
    isSystem: false,
    isActive: Boolean(values.isActive ?? true),
  };

  return refresh({
    ...workspace,
    accounts: upsertById(workspace.accounts, id, account, account),
    activities: [activity("accounting", id ? "account updated" : "account created", `${account.code} - ${account.name} disimpan.`), ...workspace.activities],
  });
}

export function archiveDemoChartOfAccount(id: string): ErpWorkspace {
  workspace = currentWorkspace();
  return refresh({
    ...workspace,
    accounts: workspace.accounts.map((item) => (item.id === id ? { ...item, isActive: false } : item)),
    activities: [activity("accounting", "account archived", `Akun ${id} dinonaktifkan.`), ...workspace.activities],
  });
}
export function saveDemoLocation(input: LocationInput, id?: string): ErpWorkspace {
  workspace = currentWorkspace();
  const location: Location = {
    id: id ?? generatedId("loc"),
    businessId: workspace.business.id,
    code: input.code,
    name: input.name,
    type: input.type,
    warehouseId: input.warehouseId,
    isActive: input.isActive,
  };

  return refresh({
    ...workspace,
    locations: upsertById(workspace.locations, id, location, location),
    activities: [activity("accounting", id ? "location updated" : "location created", `${location.name} disimpan.`), ...workspace.activities],
  });
}

export function applyDemoIndustryTemplate(input: ApplyIndustryTemplateInput): ErpWorkspace {
  workspace = currentWorkspace();
  const modules = input.modules ?? featureFlagsForTemplate(workspace.business.id, input.templateId).map((flag) => flag.module);
  const featureFlags = modules.map((module) => ({
    id: `flag-${workspace.business.id}-${module}`,
    businessId: workspace.business.id,
    module,
    enabled: true,
  }));
  const defaultProductType = defaultProductTypeForTemplate(input.templateId);

  return refresh({
    ...workspace,
    business: {
      ...workspace.business,
      industry: input.templateId === "distributor" ? "retail" : (input.templateId as typeof workspace.business.industry),
    },
    featureFlags,
    products: workspace.products.map((product) => ({
      ...product,
      productType: product.productType ?? defaultProductType,
      trackStock: product.productType === "service" ? false : product.trackStock,
    })),
    activities: [
      activity("accounting", "template applied", `Template ${input.templateId} diterapkan ke workspace demo.`),
      ...workspace.activities,
    ],
  });
}

export function uploadDemoRawTransactions(input: UploadRawImportInput): ErpWorkspace {
  workspace = currentWorkspace();
  const batchId = generatedId("raw-batch");
  const createdAt = nowIso();
  const rawTransactions: RawTransaction[] = input.transactions.map((transaction) => ({
    id: generatedId("raw-tx"),
    businessId: workspace.business.id,
    locationId: input.locationId,
    batchId,
    source: input.source,
    externalId: transaction.externalId,
    transactionDate: transaction.transactionDate,
    status: "uploaded",
    grossAmount: transaction.grossAmount,
    discountAmount: transaction.discountAmount,
    netAmount: transaction.netAmount,
    taxAmount: transaction.taxAmount,
    paymentMethod: transaction.paymentMethod,
    customerName: transaction.customerName,
    createdAt,
  }));
  const withDuplicates = markRawTransactionStatuses(workspace.rawTransactions, rawTransactions);
  const rawTransactionLines: RawTransactionLine[] = input.transactions.flatMap((transaction, transactionIndex) =>
    transaction.lines.map((line) => ({
      id: generatedId("raw-line"),
      businessId: workspace.business.id,
      rawTransactionId: withDuplicates[transactionIndex].id,
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.total,
    })),
  );
  const batch = recomputeRawImportBatch(
    {
      id: batchId,
      businessId: workspace.business.id,
      locationId: input.locationId,
      source: input.source,
      status: "uploaded",
      totalRows: withDuplicates.length,
      validRows: 0,
      duplicateRows: 0,
      errorRows: 0,
      createdAt,
    },
    withDuplicates,
  );

  return refresh({
    ...workspace,
    rawImportBatches: [batch, ...workspace.rawImportBatches],
    rawTransactions: [...withDuplicates, ...workspace.rawTransactions],
    rawTransactionLines: [...rawTransactionLines, ...workspace.rawTransactionLines],
    rawPayments: [
      ...withDuplicates.map((transaction) => ({
        id: generatedId("raw-pay"),
        businessId: workspace.business.id,
        rawTransactionId: transaction.id,
        method: transaction.paymentMethod,
        amount: transaction.netAmount,
      })),
      ...workspace.rawPayments,
    ],
    activities: [activity("accounting", "raw import uploaded", `${withDuplicates.length} transaksi raw diterima.`), ...workspace.activities],
  });
}

export function validateDemoRawImportBatch(input: ImportBatchActionInput): ErpWorkspace {
  workspace = currentWorkspace();
  const validated = validateRawTransactions(workspace.rawTransactions);
  const batch = workspace.rawImportBatches.find((item) => item.id === input.batchId);

  if (!batch) throw new Error("Batch import tidak ditemukan.");

  return refresh({
    ...workspace,
    rawTransactions: validated,
    rawImportBatches: workspace.rawImportBatches.map((item) =>
      item.id === input.batchId ? recomputeRawImportBatch(item, validated) : item,
    ),
    activities: [activity("accounting", "raw import validated", `Batch ${input.batchId} divalidasi.`), ...workspace.activities],
  });
}

export function summarizeDemoRawImportBatch(input: ImportBatchActionInput): ErpWorkspace {
  workspace = currentWorkspace();
  const batch = workspace.rawImportBatches.find((item) => item.id === input.batchId);

  if (!batch) throw new Error("Batch import tidak ditemukan.");

  const scoped = workspace.rawTransactions.filter((transaction) => transaction.batchId === input.batchId);
  const summarizedTransactions = workspace.rawTransactions.map((transaction) =>
    transaction.batchId === input.batchId && ["validated", "mapped"].includes(transaction.status)
      ? { ...transaction, status: "summarized" as const }
      : transaction,
  );
  const newSummaries = summarizeRawTransactions(
    summarizedTransactions.filter((transaction) => transaction.batchId === input.batchId),
  );
  const existingSummaryKeys = new Set(
    workspace.dailyTransactionSummaries.map(
      (summary) => `${summary.businessId}|${summary.locationId}|${summary.source}|${summary.date}`,
    ),
  );
  const summaries = [
    ...newSummaries.filter(
      (summary) => !existingSummaryKeys.has(`${summary.businessId}|${summary.locationId}|${summary.source}|${summary.date}`),
    ),
    ...workspace.dailyTransactionSummaries,
  ];

  if (scoped.length === 0) throw new Error("Batch tidak memiliki transaksi raw.");

  return refresh({
    ...workspace,
    rawTransactions: summarizedTransactions,
    rawImportBatches: workspace.rawImportBatches.map((item) =>
      item.id === input.batchId ? recomputeRawImportBatch(item, summarizedTransactions) : item,
    ),
    dailyTransactionSummaries: summaries,
    activities: [activity("accounting", "raw import summarized", `Batch ${input.batchId} diringkas harian.`), ...workspace.activities],
  });
}

export function postDemoDailySummary(input: SummaryActionInput): ErpWorkspace {
  workspace = currentWorkspace();
  const summary = workspace.dailyTransactionSummaries.find((item) => item.id === input.summaryId);

  if (!summary) throw new Error("Ringkasan transaksi tidak ditemukan.");
  if (summary.status === "posted") return workspace;

  const journal = buildSummaryJournal(summary);
  const postedSummary: DailyTransactionSummary = {
    ...summary,
    status: "posted",
    postedJournalEntryId: journal.id,
  };

  return refresh({
    ...workspace,
    dailyTransactionSummaries: workspace.dailyTransactionSummaries.map((item) =>
      item.id === summary.id ? postedSummary : item,
    ),
    rawTransactions: workspace.rawTransactions.map((transaction) =>
      transaction.businessId === summary.businessId &&
      transaction.locationId === summary.locationId &&
      transaction.source === summary.source &&
      transaction.transactionDate === summary.date &&
      transaction.status === "summarized"
        ? { ...transaction, status: "posted" }
        : transaction,
    ),
    journals: [journal, ...workspace.journals],
    activities: [activity("accounting", "summary posted", `Ringkasan ${summary.source} ${summary.date} dipost ke jurnal.`), ...workspace.activities],
  });
}

export function rollbackDemoDailySummary(input: SummaryActionInput): ErpWorkspace {
  workspace = currentWorkspace();
  const summary = workspace.dailyTransactionSummaries.find((item) => item.id === input.summaryId);

  if (!summary) throw new Error("Ringkasan transaksi tidak ditemukan.");

  return refresh({
    ...workspace,
    dailyTransactionSummaries: workspace.dailyTransactionSummaries.map((item) =>
      item.id === input.summaryId ? { ...item, status: "rolled_back", postedJournalEntryId: undefined } : item,
    ),
    rawTransactions: workspace.rawTransactions.map((transaction) =>
      transaction.businessId === summary.businessId &&
      transaction.locationId === summary.locationId &&
      transaction.source === summary.source &&
      transaction.transactionDate === summary.date
        ? { ...transaction, status: "rolled_back" }
        : transaction,
    ),
    journals: workspace.journals.map((journal) =>
      journal.id === summary.postedJournalEntryId ? { ...journal, status: "reversed" } : journal,
    ),
    activities: [activity("accounting", "summary rollback", `Ringkasan ${summary.source} ${summary.date} di-rollback.`), ...workspace.activities],
  });
}

export function archiveDemoMasterData(
  resource: "customer" | "supplier" | "product" | "warehouse" | "employee",
  id: string,
): ErpWorkspace {
  workspace = currentWorkspace();
  return refresh({
    ...workspace,
    customers:
      resource === "customer"
        ? workspace.customers.map((item) => (item.id === id ? { ...item, isActive: false } : item))
        : workspace.customers,
    suppliers:
      resource === "supplier"
        ? workspace.suppliers.map((item) => (item.id === id ? { ...item, isActive: false } : item))
        : workspace.suppliers,
    products:
      resource === "product"
        ? workspace.products.map((item) => (item.id === id ? { ...item, isActive: false } : item))
        : workspace.products,
    warehouses:
      resource === "warehouse"
        ? workspace.warehouses.map((item) => (item.id === id ? { ...item, isActive: false } : item))
        : workspace.warehouses,
    employees:
      resource === "employee"
        ? workspace.employees.map((item) => (item.id === id ? { ...item, status: "inactive" } : item))
        : workspace.employees,
    activities: [activity("accounting", "master archived", `${resource} ${id} dinonaktifkan.`), ...workspace.activities],
  });
}

export function createDemoStockTransfer(input: CreateStockTransferInput): ErpWorkspace {
  workspace = currentWorkspace();
  const product = workspace.products.find((item) => item.id === input.itemId);

  if (!product || product.isActive === false || !product.trackStock) {
    throw new Error("Produk stok tidak ditemukan atau tidak aktif.");
  }

  const transferId = generatedId("transfer");
  const value = product.purchasePrice * input.quantity;
  const movements: StockMovement[] = [
    {
      id: generatedId("sm"),
      businessId: workspace.business.id,
      itemId: input.itemId,
      warehouseId: input.fromWarehouseId,
      date: input.date,
      type: "transfer_out",
      quantity: input.quantity,
      value,
      memo: input.memo,
    },
    {
      id: generatedId("sm"),
      businessId: workspace.business.id,
      itemId: input.itemId,
      warehouseId: input.toWarehouseId,
      date: input.date,
      type: "transfer_in",
      quantity: input.quantity,
      value,
      memo: input.memo,
    },
  ];

  valueInventory([...workspace.stockMovements, ...movements]);

  return refresh({
    ...workspace,
    stockTransfers: [
      {
        id: transferId,
        businessId: workspace.business.id,
        transferNo: `TRF-2026-${String(workspace.stockTransfers.length + 1).padStart(4, "0")}`,
        date: input.date,
        itemId: input.itemId,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        quantity: input.quantity,
        status: "posted",
        memo: input.memo,
      },
      ...workspace.stockTransfers,
    ],
    stockMovements: [...workspace.stockMovements, ...movements],
    activities: [activity("inventory", "stock transfer", `${product.sku} dipindahkan antar gudang.`), ...workspace.activities],
  });
}

export function voidDemoDocument(input: VoidDocumentInput): ErpWorkspace {
  workspace = currentWorkspace();
  return refresh({
    ...workspace,
    salesInvoices: workspace.salesInvoices.map((item) =>
      input.documentType === "sales_invoice" && item.id === input.documentId ? { ...item, status: "void" } : item,
    ),
    purchaseBills: workspace.purchaseBills.map((item) =>
      input.documentType === "purchase_bill" && item.id === input.documentId ? { ...item, status: "void" } : item,
    ),
    payments: workspace.payments.map((item) =>
      input.documentType === "payment" && item.id === input.documentId ? { ...item, status: "void" } : item,
    ),
    stockAdjustments: workspace.stockAdjustments.map((item) =>
      input.documentType === "stock_adjustment" && item.id === input.documentId ? { ...item, status: "void" } : item,
    ),
    stockTransfers: workspace.stockTransfers.map((item) =>
      input.documentType === "stock_transfer" && item.id === input.documentId ? { ...item, status: "void" } : item,
    ),
    journals: workspace.journals.map((item) =>
      item.referenceId === input.documentId ? { ...item, status: "reversed" } : item,
    ),
    activities: [
      activity("accounting", "document voided", `${input.documentType} ${input.documentId} divoid: ${input.reason}.`),
      ...workspace.activities,
    ],
  });
}

export function lockDemoPeriod(input: LockPeriodInput): ErpWorkspace {
  workspace = currentWorkspace();
  return refresh({
    ...workspace,
    period: {
      label: input.label,
      startDate: input.startDate,
      endDate: input.endDate,
      locked: input.locked,
    },
    activities: [
      activity("accounting", input.locked ? "period locked" : "period reopened", `Periode ${input.label} diperbarui.`),
      ...workspace.activities,
    ],
  });
}

export function createDemoImportBatch(values: Omit<ImportBatch, "id" | "businessId" | "createdAt" | "status">): ErpWorkspace {
  workspace = currentWorkspace();
  return refresh({
    ...workspace,
    importBatches: [
      {
        id: generatedId("imp"),
        businessId: workspace.business.id,
        status: "preview",
        createdAt: nowIso(),
        ...values,
      },
      ...workspace.importBatches,
    ],
    activities: [activity("accounting", "import preview", `${values.totalRows} row import dipreview.`), ...workspace.activities],
  });
}

export function updateDemoImportBatch(id: string, status: ImportBatch["status"]): ErpWorkspace {
  workspace = currentWorkspace();
  return refresh({
    ...workspace,
    importBatches: workspace.importBatches.map((batch) => (batch.id === id ? { ...batch, status } : batch)),
    activities: [activity("accounting", "import status", `Import batch ${id} menjadi ${status}.`), ...workspace.activities],
  });
}

export function createDemoAttachment(values: Omit<Attachment, "id" | "businessId" | "createdAt">): ErpWorkspace {
  workspace = currentWorkspace();
  return refresh({
    ...workspace,
    attachments: [
      {
        id: generatedId("att"),
        businessId: workspace.business.id,
        createdAt: nowIso(),
        ...values,
      },
      ...workspace.attachments,
    ],
    activities: [activity("accounting", "attachment added", `${values.fileName} dicatat sebagai lampiran.`), ...workspace.activities],
  });
}
