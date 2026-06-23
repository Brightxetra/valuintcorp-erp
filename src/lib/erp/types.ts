import type {
  Attendance,
  Business,
  BusinessRole,
  ChartOfAccount,
  Employee,
  InventoryItem,
  JournalEntry,
  Money,
  PayrollRun,
  ReportPeriod,
  StockMovement,
  TaxProfile,
  Warehouse,
} from "@/lib/domain/types";
import type { Permission } from "@/lib/security/permissions";

export type ErpDocumentStatus = "draft" | "posted" | "partially_paid" | "paid" | "void";
export type PaymentDirection = "inbound" | "outbound";
export type PaymentMethod = "cash" | "bank_transfer" | "qris" | "marketplace" | "other";
export type TaskSeverity = "info" | "warning" | "critical";
export type ProductType = "stock_item" | "non_stock_item" | "service" | "bundle";
export type ErpModule =
  | "dashboard"
  | "sales"
  | "purchases"
  | "inventory"
  | "accounting"
  | "reports"
  | "hr"
  | "payroll"
  | "tax"
  | "imports"
  | "locations";
export type LocationType = "branch" | "outlet" | "store" | "warehouse" | "workshop" | "office";
export type TransactionSourceType = "manual" | "pos" | "marketplace" | "bank_csv" | "pos_csv" | "marketplace_csv";
export type RawTransactionStatus =
  | "uploaded"
  | "validated"
  | "mapped"
  | "summarized"
  | "posted"
  | "rolled_back"
  | "failed"
  | "duplicate";
export type SummaryStatus = "draft" | "summarized" | "posted" | "rolled_back";
export type FixedAssetStatus = "active" | "fully_depreciated" | "disposed";
export type FixedAssetAcquisitionType = "opening_balance" | "cash" | "credit";
export type FixedAssetDepreciationMethod = "straight_line";
export type FixedAssetRunStatus = "posted" | "reversed";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: BusinessRole;
}

export interface Customer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  creditLimit: Money;
  isActive: boolean;
}

export interface Supplier {
  id: string;
  businessId: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive: boolean;
}

export interface Product extends InventoryItem {
  productType: ProductType;
  category: string;
  sellingPrice: Money;
  purchasePrice: Money;
  reorderPoint: number;
  isSellable: boolean;
  isPurchasable: boolean;
  isActive?: boolean;
}

export interface Location {
  id: string;
  businessId: string;
  code: string;
  name: string;
  type: LocationType;
  warehouseId?: string;
  isActive: boolean;
}

export interface BusinessFeatureFlag {
  id: string;
  businessId: string;
  module: ErpModule;
  enabled: boolean;
}

export interface IndustryTemplate {
  id: string;
  industry: string;
  name: string;
  description: string;
  enabledModules: ErpModule[];
  defaultProductType: ProductType;
}

export interface TransactionSource {
  id: string;
  businessId: string;
  locationId?: string;
  sourceType: TransactionSourceType;
  name: string;
  isActive: boolean;
}

export type MemberAccessScope = "role" | "custom";

export interface BusinessMember {
  id: string;
  businessId: string;
  authUserId: string;
  email?: string;
  name?: string;
  emailConfirmedAt?: string;
  invitedAt?: string;
  lastSignInAt?: string;
  role: BusinessRole;
  accessScope: MemberAccessScope;
  accessPermissions: Permission[];
  locationIds: string[];
  createdAt: string;
}

export interface MemberInvite {
  id: string;
  businessId: string;
  email: string;
  role: BusinessRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  accessScope?: MemberAccessScope;
  accessPermissions?: Permission[];
  locationIds?: string[];
  expiresAt: string;
  createdAt: string;
}

export interface SalesInvoiceLine {
  id: string;
  productId: string;
  warehouseId?: string;
  description: string;
  quantity: number;
  unitPrice: Money;
  cogs: Money;
}

export interface SalesInvoice {
  id: string;
  businessId: string;
  invoiceNo: string;
  customerId: string;
  date: string;
  dueDate: string;
  status: ErpDocumentStatus;
  lines: SalesInvoiceLine[];
  total: Money;
  paidAmount: Money;
  journalEntryId?: string;
  createdAt: string;
  locationId?: string;
  source?: "manual" | "pos";
}

export interface PurchaseBillLine {
  id: string;
  productId: string;
  warehouseId?: string;
  description: string;
  quantity: number;
  unitCost: Money;
}

export interface PurchaseBill {
  id: string;
  businessId: string;
  billNo: string;
  supplierId: string;
  date: string;
  dueDate: string;
  status: ErpDocumentStatus;
  lines: PurchaseBillLine[];
  total: Money;
  paidAmount: Money;
  journalEntryId?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  businessId: string;
  direction: PaymentDirection;
  documentType: "sales_invoice" | "purchase_bill" | "payroll_run";
  documentId: string;
  date: string;
  amount: Money;
  method: PaymentMethod;
  reference: string;
  status: "posted" | "void";
  journalEntryId?: string;
  createdAt: string;
}

export interface PaymentAllocation {
  id: string;
  businessId: string;
  paymentId: string;
  documentType: Payment["documentType"];
  documentId: string;
  amount: Money;
  createdAt: string;
}

export interface StockTransfer {
  id: string;
  businessId: string;
  transferNo: string;
  date: string;
  itemId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  status: "draft" | "posted" | "void";
  memo?: string;
}

export interface StockAdjustment {
  id: string;
  businessId: string;
  adjustmentNo: string;
  date: string;
  itemId: string;
  warehouseId: string;
  quantity: number;
  value: Money;
  reason: string;
  status: "posted" | "void";
  journalEntryId?: string;
}

export interface ImportBatch {
  id: string;
  businessId: string;
  source: "bank_csv" | "pos_csv" | "marketplace_csv";
  status: "preview" | "committed" | "rolled_back";
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  createdAt: string;
}

export interface RawImportBatch {
  id: string;
  businessId: string;
  locationId?: string;
  source: TransactionSourceType;
  status: RawTransactionStatus;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  createdAt: string;
}

export interface RawTransaction {
  id: string;
  businessId: string;
  locationId: string;
  batchId?: string;
  source: TransactionSourceType;
  externalId: string;
  transactionDate: string;
  status: RawTransactionStatus;
  grossAmount: Money;
  discountAmount: Money;
  netAmount: Money;
  taxAmount: Money;
  paymentMethod: PaymentMethod;
  customerName?: string;
  createdAt: string;
}

export interface RawTransactionLine {
  id: string;
  businessId: string;
  rawTransactionId: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: Money;
  total: Money;
}

export interface RawPayment {
  id: string;
  businessId: string;
  rawTransactionId: string;
  method: PaymentMethod;
  amount: Money;
}

export interface SettlementRecord {
  id: string;
  businessId: string;
  locationId?: string;
  source: TransactionSourceType;
  settlementDate: string;
  method: PaymentMethod;
  grossAmount: Money;
  feeAmount: Money;
  netAmount: Money;
  status: "pending" | "matched" | "exception";
}

export interface DailyTransactionSummary {
  id: string;
  businessId: string;
  locationId: string;
  source: TransactionSourceType;
  date: string;
  status: SummaryStatus;
  transactionCount: number;
  grossAmount: Money;
  discountAmount: Money;
  netAmount: Money;
  taxAmount: Money;
  paymentBreakdown: Partial<Record<PaymentMethod, Money>>;
  postedJournalEntryId?: string;
  createdAt: string;
}

export interface FixedAsset {
  id: string;
  businessId: string;
  assetNo: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: Money;
  residualValue: Money;
  usefulLifeMonths: number;
  depreciationMethod: FixedAssetDepreciationMethod;
  acquisitionType: FixedAssetAcquisitionType;
  status: FixedAssetStatus;
  locationId?: string;
  supplierId?: string;
  journalEntryId?: string;
  notes?: string;
  createdAt: string;
}

export interface FixedAssetDepreciationRun {
  id: string;
  businessId: string;
  period: string;
  date: string;
  status: FixedAssetRunStatus;
  totalDepreciation: Money;
  journalEntryId?: string;
  createdAt: string;
}

export interface FixedAssetDepreciationLine {
  id: string;
  businessId: string;
  runId: string;
  assetId: string;
  period: string;
  amount: Money;
  accumulatedDepreciation: Money;
  bookValue: Money;
  createdAt: string;
}

export interface FixedAssetDisposal {
  id: string;
  businessId: string;
  assetId: string;
  date: string;
  proceeds: Money;
  bookValue: Money;
  gainLoss: Money;
  reason: string;
  status: FixedAssetRunStatus;
  journalEntryId?: string;
  createdAt: string;
}

export interface LocationMetric {
  locationId: string;
  revenue: Money;
  transactionCount: number;
  averageTicket: Money;
}

export interface Attachment {
  id: string;
  businessId: string;
  ownerType: "sales_invoice" | "purchase_bill" | "payment" | "payroll_run" | "fixed_asset";
  ownerId: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ErpTask {
  id: string;
  title: string;
  description: string;
  module: "sales" | "purchases" | "inventory" | "hr" | "tax" | "accounting";
  severity: TaskSeverity;
  dueDate?: string;
}

export interface ActivityEvent {
  id: string;
  businessId: string;
  actorName: string;
  module: ErpTask["module"];
  action: string;
  description: string;
  createdAt: string;
}

export interface ErpMetrics {
  revenue: Money;
  purchases: Money;
  grossMargin: Money;
  cash: Money;
  accountsReceivable: Money;
  accountsPayable: Money;
  inventoryValue: Money;
  payrollCost: Money;
  taxEstimate: Money;
  overdueReceivables: Money;
  overduePayables: Money;
  stockAlertCount: number;
  rawTransactionCount: number;
  summarizedRevenue: Money;
  fixedAssetBookValue: Money;
}

export interface DemoSandboxMetadata {
  id: string;
  businessId: string;
  authUserId: string;
  templateId: string;
  resetPolicy: "daily" | "manual" | "none";
  seedVersion: number;
  lastResetAt?: string;
  nextResetAt?: string;
}

export interface BpjsPolicy {
  id: string;
  businessId: string;
  effectiveDate: string;
  grossSalaryMultiplier: number;
  healthEmployeeRate: number;
  healthEmployerRate: number;
  healthSalaryCap: number;
  jhtEmployeeRate: number;
  jhtEmployerRate: number;
  jhtSalaryCap: number;
  jpnEmployeeRate: number;
  jpnEmployerRate: number;
  jpnSalaryCap: number;
  jkkEmployerRate: number;
  jkmEmployerRate: number;
  updatedAt?: string;
}
export interface ErpWorkspace {
  user: AppUser;
  permissions: Permission[];
  business: Business;
  assignedLocationIds?: string[];
  members?: BusinessMember[];
  period: ReportPeriod;
  taxProfile: TaxProfile;
  bpjsPolicy?: BpjsPolicy;
  accounts: ChartOfAccount[];
  locations: Location[];
  featureFlags: BusinessFeatureFlag[];
  industryTemplates: IndustryTemplate[];
  transactionSources: TransactionSource[];
  memberInvites: MemberInvite[];
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  warehouses: Warehouse[];
  salesInvoices: SalesInvoice[];
  purchaseBills: PurchaseBill[];
  payments: Payment[];
  paymentAllocations: PaymentAllocation[];
  stockMovements: StockMovement[];
  stockTransfers: StockTransfer[];
  stockAdjustments: StockAdjustment[];
  employees: Employee[];
  attendance: Attendance[];
  payrollRuns: PayrollRun[];
  journals: JournalEntry[];
  importBatches: ImportBatch[];
  rawImportBatches: RawImportBatch[];
  rawTransactions: RawTransaction[];
  rawTransactionLines: RawTransactionLine[];
  rawPayments: RawPayment[];
  settlementRecords: SettlementRecord[];
  dailyTransactionSummaries: DailyTransactionSummary[];
  fixedAssets: FixedAsset[];
  fixedAssetDepreciationRuns: FixedAssetDepreciationRun[];
  fixedAssetDepreciationLines: FixedAssetDepreciationLine[];
  fixedAssetDisposals: FixedAssetDisposal[];
  locationMetrics: LocationMetric[];
  attachments: Attachment[];
  tasks: ErpTask[];
  activities: ActivityEvent[];
  metrics: ErpMetrics;
  demoSandbox?: DemoSandboxMetadata;
}
