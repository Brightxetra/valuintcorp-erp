import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD.");
const positiveMoney = z.coerce.number().int().positive();
const positiveQuantity = z.coerce.number().positive();
const nonNegativeMoney = z.coerce.number().int().nonnegative();
const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);
const booleanFlag = z.preprocess((value) => {
  if (value === "true" || value === "on" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
}, z.boolean());

const salesInvoiceLineInputSchema = z.object({
  productId: z.string().min(1),
  warehouseId: optionalText,
  quantity: positiveQuantity,
  unitPrice: positiveMoney,
});

const purchaseBillLineInputSchema = z.object({
  productId: z.string().min(1),
  warehouseId: optionalText,
  quantity: positiveQuantity,
  unitCost: positiveMoney,
});

export const createSalesInvoiceSchema = z
  .object({
    customerId: z.string().min(1),
    productId: optionalText,
    warehouseId: optionalText,
    quantity: positiveQuantity.optional(),
    unitPrice: positiveMoney.optional(),
    items: z.array(salesInvoiceLineInputSchema).min(1).optional(),
    date: isoDate,
    dueDate: isoDate,
  })
  .superRefine((value, context) => {
    if (value.items?.length) return;
    if (!value.productId || value.quantity === undefined || value.unitPrice === undefined) {
      context.addIssue({
        code: "custom",
        message: "Minimal satu item invoice wajib diisi.",
        path: ["items"],
      });
    }
  })
  .refine((value) => value.dueDate >= value.date, {
    message: "Jatuh tempo tidak boleh lebih awal dari tanggal invoice.",
    path: ["dueDate"],
  });

export const createPurchaseBillSchema = z
  .object({
    supplierId: z.string().min(1),
    productId: optionalText,
    warehouseId: optionalText,
    quantity: positiveQuantity.optional(),
    unitCost: positiveMoney.optional(),
    items: z.array(purchaseBillLineInputSchema).min(1).optional(),
    date: isoDate,
    dueDate: isoDate,
  })
  .superRefine((value, context) => {
    if (value.items?.length) return;
    if (!value.productId || value.quantity === undefined || value.unitCost === undefined) {
      context.addIssue({
        code: "custom",
        message: "Minimal satu item tagihan wajib diisi.",
        path: ["items"],
      });
    }
  })
  .refine((value) => value.dueDate >= value.date, {
    message: "Jatuh tempo tidak boleh lebih awal dari tanggal bill.",
    path: ["dueDate"],
  });

export const createPaymentSchema = z.object({
  direction: z.enum(["inbound", "outbound"]),
  documentType: z.enum(["sales_invoice", "purchase_bill", "payroll_run"]),
  documentId: z.string().min(1),
  amount: positiveMoney,
  method: z.enum(["cash", "bank_transfer", "qris", "marketplace", "other"]),
  date: isoDate,
});

const posLineSchema = z.object({
  productId: z.string().min(1),
  quantity: positiveQuantity,
  unitPrice: nonNegativeMoney,
});

export const postPosSaleSchema = z.object({
  locationId: z.string().min(1),
  date: isoDate.optional(),
  paymentMethod: z.enum(["cash", "bank_transfer", "qris", "marketplace", "other"]).default("cash"),
  items: z.array(posLineSchema).min(1, "Minimal satu produk harus diisi."),
});

export const createBranchExpenseSchema = z.object({
  locationId: z.string().min(1),
  date: isoDate.optional(),
  amount: positiveMoney,
  paymentMethod: z.enum(["cash", "bank_transfer", "qris", "marketplace", "other"]).default("cash"),
  category: z.string().trim().min(2),
  memo: z.string().trim().max(500).optional(),
});

export const createStockAdjustmentSchema = z.object({
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().refine((value) => value !== 0, "Qty tidak boleh 0."),
  value: positiveMoney,
  reason: z.string().min(3),
  date: isoDate,
});

export const createStockReceiptSchema = z.object({
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: positiveQuantity,
  unitCost: nonNegativeMoney,
  date: isoDate,
  memo: optionalText,
});

export const createPayrollRunSchema = z
  .object({
    employeeId: z.string().min(1),
    grossPay: positiveMoney,
    netCashPaid: z.coerce.number().int().nonnegative(),
    taxWithheld: z.coerce.number().int().nonnegative(),
    date: isoDate,
  })
  .refine((value) => value.netCashPaid + value.taxWithheld <= value.grossPay, {
    message: "Net cash paid dan pajak tidak boleh melebihi gross pay.",
    path: ["netCashPaid"],
  });

export const masterResourceSchema = z.enum([
  "customer",
  "supplier",
  "product",
  "warehouse",
  "employee",
  "business",
  "tax_profile",
]);

export const masterDataMutationSchema = z.object({
  resource: masterResourceSchema,
  id: z.string().optional(),
  values: z.record(z.string(), z.unknown()),
});

export const customerSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  creditLimit: nonNegativeMoney.default(0),
  isActive: booleanFlag.default(true),
});

export const supplierSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  isActive: booleanFlag.default(true),
});

export const productSchema = z.object({
  sku: z.string().min(2),
  name: z.string().min(2),
  variant: optionalText,
  productType: z.enum(["stock_item", "non_stock_item", "service", "bundle"]).default("stock_item"),
  industryItemType: z
    .enum(["raw_material", "semi_finished", "finished_good", "menu_item", "retail_sku", "service_item", "package", "other"])
    .default("retail_sku"),
  fulfillmentMethod: z.enum(["buy_stock", "make_to_stock", "make_to_order", "recipe_on_sale", "non_stock"]).default("buy_stock"),
  category: z.string().min(1).default("Umum"),
  unit: z.string().min(1).default("unit"),
  trackStock: booleanFlag.default(true),
  defaultWarehouseId: optionalText,
  sellingPrice: nonNegativeMoney.default(0),
  purchasePrice: nonNegativeMoney.default(0),
  reorderPoint: z.coerce.number().nonnegative().default(0),
  safetyStock: z.coerce.number().nonnegative().default(0),
  minimumOrderQty: z.coerce.number().nonnegative().default(0),
  leadTimeDays: z.coerce.number().int().nonnegative().default(0),
  productionLeadTimeDays: z.coerce.number().int().nonnegative().default(0),
  makeOrBuy: z.enum(["buy", "make", "both"]).default("buy"),
  isSellable: booleanFlag.default(true),
  isPurchasable: booleanFlag.default(true),
  isActive: booleanFlag.default(true),
});

export const productStructureLineSchema = z.object({
  componentProductId: z.string().min(1),
  quantity: positiveQuantity,
  wastePercent: z.coerce.number().min(0).max(100).default(0),
  unitCostSnapshot: nonNegativeMoney.default(0),
  notes: optionalText,
});

export const productStructureSchema = z.object({
  id: optionalText,
  parentProductId: z.string().min(1),
  type: z.enum(["recipe", "bom", "bundle"]).default("recipe"),
  outputQuantity: positiveQuantity.default(1),
  yieldPercent: z.coerce.number().positive().max(100).default(100),
  isActive: booleanFlag.default(true),
  notes: optionalText,
  lines: z.array(productStructureLineSchema).min(1, "Minimal satu bahan/komponen wajib diisi."),
});

export const demandForecastSchema = z.object({
  productId: z.string().min(1),
  locationId: optionalText,
  periodStart: isoDate,
  periodEnd: isoDate,
  quantity: positiveQuantity,
  source: z.enum(["manual", "sales_history", "import"]).default("manual"),
  notes: optionalText,
}).refine((value) => value.periodStart <= value.periodEnd, {
  message: "Tanggal akhir forecast harus setelah tanggal awal.",
  path: ["periodEnd"],
});

export const mrpRunSchema = z.object({
  name: z.string().min(2).default("MRP"),
  periodStart: isoDate,
  periodEnd: isoDate,
  forecasts: z.array(demandForecastSchema).default([]),
}).refine((value) => value.periodStart <= value.periodEnd, {
  message: "Tanggal akhir MRP harus setelah tanggal awal.",
  path: ["periodEnd"],
});

export const warehouseSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  location: optionalText,
  isActive: booleanFlag.default(true),
});

export const locationSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  type: z.enum(["branch", "outlet", "store", "warehouse", "workshop", "office"]).default("branch"),
  warehouseId: optionalText,
  isActive: booleanFlag.default(true),
});

export const employeeSchema = z.object({
  employeeNo: z.string().min(2),
  name: z.string().min(2),
  department: optionalText,
  role: z.string().min(2),
  contractType: z.enum(["permanent", "contract", "daily"]),
  status: z.enum(["active", "inactive", "contract"]).default("active"),
  baseSalary: nonNegativeMoney.default(0),
  dailyRate: nonNegativeMoney.optional(),
  joinedAt: isoDate,
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  taxStatus: optionalText,
  npwp: optionalText,
  bankName: optionalText,
  bankAccountNo: optionalText,
  bankAccountName: optionalText,
  bpjsHealthNo: optionalText,
  bpjsEmploymentNo: optionalText,
});

export const chartOfAccountSchema = z.object({
  code: z.string().trim().min(2),
  name: z.string().trim().min(2),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  normalBalance: z.enum(["debit", "credit"]),
  category: z.string().trim().min(2),
  isActive: booleanFlag.default(true),
});

export const bpjsPolicySchema = z.object({
  effectiveDate: isoDate,
  grossSalaryMultiplier: z.coerce.number().min(0).max(5).default(1),
  healthEmployeeRate: z.coerce.number().min(0).max(1),
  healthEmployerRate: z.coerce.number().min(0).max(1),
  healthSalaryCap: nonNegativeMoney,
  jhtEmployeeRate: z.coerce.number().min(0).max(1),
  jhtEmployerRate: z.coerce.number().min(0).max(1),
  jhtSalaryCap: nonNegativeMoney,
  jpnEmployeeRate: z.coerce.number().min(0).max(1),
  jpnEmployerRate: z.coerce.number().min(0).max(1),
  jpnSalaryCap: nonNegativeMoney,
  jkkEmployerRate: z.coerce.number().min(0).max(1),
  jkmEmployerRate: z.coerce.number().min(0).max(1),
});

export const businessUpdateSchema = z.object({
  legalName: z.string().min(2),
  displayName: z.string().min(2),
  ownerName: z.string().min(2),
  industry: z.enum(["service", "retail", "food_beverage", "online_seller", "manufacturing", "general"]),
  taxId: optionalText,
  logoUrl: optionalText,
  periodStartMonth: z.coerce.number().int().min(1).max(12).default(1),
});

export const taxProfileUpdateSchema = z.object({
  taxpayerType: z.enum(["individual_umkm", "corporate_umkm"]),
  usesFinalUmkmRate: booleanFlag.default(true),
  finalUmkmRate: z.coerce.number().min(0).max(1),
  coretaxStatus: z.enum(["not_started", "account_ready", "certificate_ready"]),
});

export const createStockTransferSchema = z.object({
  itemId: z.string().min(1),
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  quantity: positiveQuantity,
  date: isoDate,
  memo: optionalText,
}).refine((value) => value.fromWarehouseId !== value.toWarehouseId, {
  message: "Gudang asal dan tujuan harus berbeda.",
  path: ["toWarehouseId"],
});

export const voidDocumentSchema = z.object({
  documentType: z.enum(["sales_invoice", "purchase_bill", "payment", "stock_adjustment", "stock_transfer", "payroll_run"]),
  documentId: z.string().min(1),
  reason: z.string().min(3),
  date: isoDate,
});

export const lockPeriodSchema = z.object({
  label: z.string().min(4),
  startDate: isoDate,
  endDate: isoDate,
  locked: booleanFlag,
}).refine((value) => value.startDate <= value.endDate, {
  message: "Tanggal akhir periode harus setelah tanggal awal.",
  path: ["endDate"],
});

export const importBatchSchema = z.object({
  source: z.enum(["bank_csv", "pos_csv", "marketplace_csv"]),
  totalRows: z.coerce.number().int().nonnegative(),
  validRows: z.coerce.number().int().nonnegative(),
  duplicateRows: z.coerce.number().int().nonnegative(),
  errorRows: z.coerce.number().int().nonnegative(),
});

export const applyIndustryTemplateSchema = z.object({
  templateId: z.string().min(2),
  modules: z
    .array(z.enum(["dashboard", "sales", "purchases", "inventory", "accounting", "reports", "hr", "payroll", "tax", "imports", "locations"]))
    .optional(),
});

export const rawTransactionInputSchema = z
  .object({
    locationId: z.string().min(1),
    source: z.enum(["manual", "pos", "marketplace", "bank_csv", "pos_csv", "marketplace_csv"]),
    externalId: z.string().min(1),
    transactionDate: isoDate,
    grossAmount: nonNegativeMoney,
    discountAmount: nonNegativeMoney.default(0),
    netAmount: nonNegativeMoney,
    taxAmount: nonNegativeMoney.default(0),
    paymentMethod: z.enum(["cash", "bank_transfer", "qris", "marketplace", "other"]).default("cash"),
    customerName: optionalText,
    lines: z
      .array(
        z.object({
          productId: optionalText,
          description: z.string().min(1),
          quantity: positiveQuantity,
          unitPrice: nonNegativeMoney,
          total: nonNegativeMoney,
        }),
      )
      .default([]),
  })
  .refine((value) => value.grossAmount - value.discountAmount + value.taxAmount === value.netAmount, {
    message: "Gross - diskon + pajak harus sama dengan net amount.",
    path: ["netAmount"],
  });

export const uploadRawImportSchema = z.object({
  locationId: z.string().min(1),
  source: z.enum(["manual", "pos", "marketplace", "bank_csv", "pos_csv", "marketplace_csv"]),
  transactions: z.array(rawTransactionInputSchema).min(1).max(5_000),
});

export const csvImportSchema = z.object({
  locationId: z.string().min(1),
  source: z.enum(["manual", "pos", "marketplace", "bank_csv", "pos_csv", "marketplace_csv"]),
  csvText: z.string().min(10).max(2_000_000),
});

export const importBatchActionSchema = z.object({
  batchId: z.string().min(1),
});

export const summaryActionSchema = z.object({
  summaryId: z.string().min(1),
});

export const attachmentSchema = z.object({
  ownerType: z.enum(["sales_invoice", "purchase_bill", "payment", "payroll_run", "fixed_asset"]),
  ownerId: z.string().min(1),
  fileName: z.string().min(1),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().nonnegative(),
});

export const signedAttachmentUploadSchema = z.object({
  ownerType: z.enum(["sales_invoice", "purchase_bill", "payment", "payroll_run", "fixed_asset"]),
  ownerId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().positive().max(20_000_000),
});

export const fixedAssetSchema = z
  .object({
    assetNo: optionalText,
    name: z.string().min(2),
    category: z.string().min(2).default("Umum"),
    acquisitionDate: isoDate,
    acquisitionCost: positiveMoney,
    residualValue: nonNegativeMoney.default(0),
    usefulLifeMonths: z.coerce.number().int().positive(),
    depreciationMethod: z.enum(["straight_line"]).default("straight_line"),
    acquisitionType: z.enum(["opening_balance", "cash", "credit"]).default("opening_balance"),
    locationId: optionalText,
    supplierId: optionalText,
    notes: optionalText,
  })
  .refine((value) => value.residualValue < value.acquisitionCost, {
    message: "Nilai residu harus lebih kecil dari harga perolehan.",
    path: ["residualValue"],
  });

export const updateFixedAssetSchema = fixedAssetSchema.extend({
  id: z.string().min(1),
});

export const fixedAssetDepreciationRunSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Periode harus YYYY-MM."),
  date: isoDate,
});

export const fixedAssetDisposalSchema = z.object({
  assetId: z.string().min(1),
  date: isoDate,
  proceeds: nonNegativeMoney.default(0),
  reason: z.string().min(3),
});

export const reverseFixedAssetDocumentSchema = z.object({
  targetType: z.enum(["depreciation_run", "disposal"]),
  targetId: z.string().min(1),
  date: isoDate,
  reason: z.string().min(3),
});

export type CreateSalesInvoiceInput = z.infer<typeof createSalesInvoiceSchema>;
export type CreatePurchaseBillInput = z.infer<typeof createPurchaseBillSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type PostPosSaleInput = z.infer<typeof postPosSaleSchema>;
export type CreateBranchExpenseInput = z.infer<typeof createBranchExpenseSchema>;
export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;
export type CreateStockReceiptInput = z.infer<typeof createStockReceiptSchema>;
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
export type ProductStructureInput = z.infer<typeof productStructureSchema>;
export type DemandForecastInput = z.infer<typeof demandForecastSchema>;
export type MrpRunInput = z.infer<typeof mrpRunSchema>;
export type VoidDocumentInput = z.infer<typeof voidDocumentSchema>;
export type LockPeriodInput = z.infer<typeof lockPeriodSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type ApplyIndustryTemplateInput = z.infer<typeof applyIndustryTemplateSchema>;
export type UploadRawImportInput = z.infer<typeof uploadRawImportSchema>;
export type CsvImportInput = z.infer<typeof csvImportSchema>;
export type ImportBatchActionInput = z.infer<typeof importBatchActionSchema>;
export type SummaryActionInput = z.infer<typeof summaryActionSchema>;
export type FixedAssetInput = z.infer<typeof fixedAssetSchema>;
export type UpdateFixedAssetInput = z.infer<typeof updateFixedAssetSchema>;
export type FixedAssetDepreciationRunInput = z.infer<typeof fixedAssetDepreciationRunSchema>;
export type FixedAssetDisposalInput = z.infer<typeof fixedAssetDisposalSchema>;
export type ReverseFixedAssetDocumentInput = z.infer<typeof reverseFixedAssetDocumentSchema>;
