import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessRole } from "@/lib/domain/types";
import type {
  AppUser,
  Attachment,
  BusinessFeatureFlag,
  Customer,
  DailyTransactionSummary,
  DemoSandboxMetadata,
  ErpWorkspace,
  FixedAsset,
  FixedAssetDepreciationLine,
  BusinessMember,
  FixedAssetDepreciationRun,
  FixedAssetDisposal,
  ImportBatch,
  IndustryTemplate,
  Location,
  MemberInvite,
  PaymentAllocation,
  Payment,
  Product,
  PurchaseBill,
  PurchaseBillLine,
  RawImportBatch,
  RawPayment,
  RawTransaction,
  RawTransactionLine,
  SalesInvoice,
  SalesInvoiceLine,
  SettlementRecord,
  StockAdjustment,
  StockTransfer,
  TransactionSource,
} from "@/lib/erp/types";
import type {
  Attendance,
  Business,
  ChartOfAccount,
  Employee,
  JournalEntry,
  JournalLine,
  PayrollRun,
  ReportPeriod,
  StockMovement,
  TaxProfile,
  Warehouse,
} from "@/lib/domain/types";
import { buildErpTasks, calculateErpMetrics } from "@/lib/erp/operations";
import { buildLocationMetrics, industryTemplates as fallbackIndustryTemplates } from "@/lib/erp/horizontal";
import { permissionsForRole, type Permission } from "@/lib/security/permissions";
import { authUserSummariesById } from "@/lib/auth/member-invites";
import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

type Row = Record<string, unknown>;

export interface WorkspaceLoadContext {
  businessId: string;
  role: BusinessRole;
  permissions?: Permission[];
  assignedLocationIds?: string[];
  accessScope?: "role" | "custom";
  userId: string;
  userEmail?: string;
  userName?: string;
}

export type WorkspaceLoadProfile =
  | "full"
  | "shell"
  | "dashboard"
  | "sales"
  | "purchases"
  | "cash"
  | "inventory"
  | "pricing"
  | "accounting"
  | "reports"
  | "tax"
  | "hr"
  | "payroll"
  | "assets"
  | "settings"
  | "onboarding"
  | "pos"
  | "document-detail";

export interface WorkspaceLoadOptions {
  profile?: WorkspaceLoadProfile;
  documentId?: string;
  documentType?: "sales_invoice" | "purchase_bill";
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRow) : [];
}

function text(row: Row, key: string, fallback = ""): string {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

function optionalText(row: Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(row: Row, key: string, fallback = 0): number {
  const value = row[key];

  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function booleanValue(row: Row, key: string, fallback = false): boolean {
  const value = row[key];
  return typeof value === "boolean" ? value : fallback;
}

function roleValue(value: string): BusinessRole {
  const roles: BusinessRole[] = [
    "owner",
    "finance_admin",
    "staff",
    "hr",
    "external_advisor",
    "system_admin",
  ];

  return roles.includes(value as BusinessRole) ? (value as BusinessRole) : "staff";
}

function businessFromRow(row: Row): Business {
  return {
    id: text(row, "id"),
    legalName: text(row, "legal_name"),
    displayName: text(row, "display_name"),
    industry: text(row, "industry", "general") as Business["industry"],
    taxId: optionalText(row, "tax_id"),
    logoUrl: optionalText(row, "logo_url"),
    baseCurrency: "IDR",
    periodStartMonth: numberValue(row, "period_start_month", 1),
    ownerName: text(row, "owner_name"),
  };
}

function defaultPeriod(): ReportPeriod {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  return {
    label: month,
    startDate: `${month}-01`,
    endDate: today,
    locked: false,
  };
}

function periodFromRow(row: Row): ReportPeriod {
  if (!row.id && !row.label) return defaultPeriod();

  return {
    label: text(row, "label", text(row, "period", "Periode aktif")),
    startDate: text(row, "start_date"),
    endDate: text(row, "end_date"),
    locked: booleanValue(row, "locked"),
  };
}

function taxProfileFromRow(row: Row, businessId: string): TaxProfile {
  return {
    id: text(row, "id", "tax-profile-fallback"),
    businessId,
    taxpayerType: text(row, "taxpayer_type", "individual_umkm") as TaxProfile["taxpayerType"],
    usesFinalUmkmRate: booleanValue(row, "uses_final_umkm_rate", true),
    finalUmkmRate: numberValue(row, "final_umkm_rate", 0.005),
    coretaxStatus: text(row, "coretax_status", "not_started") as TaxProfile["coretaxStatus"],
  };
}

function mapChartOfAccounts(rows: Row[]): ChartOfAccount[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    code: text(row, "code"),
    name: text(row, "name"),
    type: text(row, "type", "expense") as ChartOfAccount["type"],
    normalBalance: text(row, "normal_balance", "debit") as ChartOfAccount["normalBalance"],
    category: text(row, "category", "operating_expense") as ChartOfAccount["category"],
    isSystem: booleanValue(row, "is_system"),
    isActive: booleanValue(row, "is_active", true),
  }));
}

function mapCustomers(rows: Row[]): Customer[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    code: text(row, "code"),
    name: text(row, "name"),
    phone: optionalText(row, "phone"),
    email: optionalText(row, "email"),
    address: optionalText(row, "address"),
    creditLimit: numberValue(row, "credit_limit"),
    isActive: booleanValue(row, "is_active", true),
  }));
}

function mapSuppliers(rows: Row[]) {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    code: text(row, "code"),
    name: text(row, "name"),
    phone: optionalText(row, "phone"),
    email: optionalText(row, "email"),
    address: optionalText(row, "address"),
    isActive: booleanValue(row, "is_active", true),
  }));
}

function mapProducts(rows: Row[]): Product[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    sku: text(row, "sku"),
    name: text(row, "name"),
    variant: optionalText(row, "variant"),
    productType: text(row, "product_type", booleanValue(row, "track_stock", true) ? "stock_item" : "service") as Product["productType"],
    unit: text(row, "unit", "unit"),
    trackStock: booleanValue(row, "track_stock", true),
    defaultWarehouseId: text(row, "default_warehouse_id"),
    category: text(row, "category", "Umum"),
    sellingPrice: numberValue(row, "selling_price"),
    purchasePrice: numberValue(row, "purchase_price"),
    reorderPoint: numberValue(row, "reorder_point"),
    isSellable: booleanValue(row, "is_sellable", true),
    isPurchasable: booleanValue(row, "is_purchasable", true),
    isActive: booleanValue(row, "is_active", true),
  }));
}

function mapLocations(rows: Row[]): Location[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    code: text(row, "code"),
    name: text(row, "name"),
    type: text(row, "type", "branch") as Location["type"],
    warehouseId: optionalText(row, "warehouse_id"),
    isActive: booleanValue(row, "is_active", true),
  }));
}

function mapFeatureFlags(rows: Row[]): BusinessFeatureFlag[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    module: text(row, "module", "dashboard") as BusinessFeatureFlag["module"],
    enabled: booleanValue(row, "enabled", true),
  }));
}

function mapIndustryTemplates(rows: Row[]): IndustryTemplate[] {
  if (rows.length === 0) return fallbackIndustryTemplates;

  return rows.map((row) => ({
    id: text(row, "id"),
    industry: text(row, "industry", "general"),
    name: text(row, "name"),
    description: text(row, "description"),
    enabledModules: Array.isArray(row.enabled_modules)
      ? (row.enabled_modules as IndustryTemplate["enabledModules"])
      : [],
    defaultProductType: text(row, "default_product_type", "stock_item") as IndustryTemplate["defaultProductType"],
  }));
}

function mapTransactionSources(rows: Row[]): TransactionSource[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    locationId: optionalText(row, "location_id"),
    sourceType: text(row, "source_type", "manual") as TransactionSource["sourceType"],
    name: text(row, "name"),
    isActive: booleanValue(row, "is_active", true),
  }));
}

function mapMemberInvites(rows: Row[]): MemberInvite[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    email: text(row, "email"),
    role: text(row, "role", "staff") as MemberInvite["role"],
    status: text(row, "status", "pending") as MemberInvite["status"],
    accessScope: text(row, "access_scope", "role") as MemberInvite["accessScope"],
    accessPermissions: Array.isArray(row.access_permissions) ? row.access_permissions.filter((permission): permission is Permission => typeof permission === "string") : [],
    locationIds: Array.isArray(row.location_ids) ? row.location_ids.filter((locationId): locationId is string => typeof locationId === "string") : [],
    expiresAt: text(row, "expires_at"),
    createdAt: text(row, "created_at"),
  }));
}
function mapBusinessMembers(rows: Row[]): BusinessMember[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    authUserId: text(row, "auth_user_id"),
    role: text(row, "role", "staff") as BusinessMember["role"],
    accessScope: text(row, "access_scope", "role") === "custom" ? "custom" : "role",
    accessPermissions: Array.isArray(row.access_permissions)
      ? row.access_permissions.filter((permission): permission is Permission => typeof permission === "string")
      : [],
    locationIds: Array.isArray(row.location_ids)
      ? row.location_ids.filter((locationId): locationId is string => typeof locationId === "string")
      : [],
    createdAt: text(row, "created_at"),
  }));
}

async function hydrateBusinessMemberProfiles(members: BusinessMember[]): Promise<BusinessMember[]> {
  if (members.length === 0 || !isSupabaseServiceConfigured()) return members;

  const service = createServiceSupabaseClient();
  const summaries = await authUserSummariesById(service, members.map((member) => member.authUserId));

  return members.map((member) => {
    const summary = summaries.get(member.authUserId);
    if (!summary) return member;
    return {
      ...member,
      email: summary.email,
      name: summary.name,
      emailConfirmedAt: summary.emailConfirmedAt,
      invitedAt: summary.invitedAt,
      lastSignInAt: summary.lastSignInAt,
    };
  });
}


function mapWarehouses(rows: Row[]): Warehouse[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    code: text(row, "code"),
    name: text(row, "name"),
    location: text(row, "location"),
    isActive: booleanValue(row, "is_active", true),
  }));
}

function mapSalesLine(row: Row): SalesInvoiceLine {
  return {
    id: text(row, "id"),
    productId: text(row, "product_id"),
    warehouseId: optionalText(row, "warehouse_id"),
    description: text(row, "description"),
    quantity: numberValue(row, "quantity"),
    unitPrice: numberValue(row, "unit_price"),
    cogs: numberValue(row, "cogs"),
  };
}

function mapSalesInvoices(rows: Row[]): SalesInvoice[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    invoiceNo: text(row, "invoice_no"),
    customerId: text(row, "customer_id"),
    date: text(row, "date"),
    dueDate: text(row, "due_date"),
    status: text(row, "status", "draft") as SalesInvoice["status"],
    lines: asRows(row.sales_invoice_lines).map(mapSalesLine),
    total: numberValue(row, "total"),
    paidAmount: numberValue(row, "paid_amount"),
    journalEntryId: optionalText(row, "journal_entry_id"),
    locationId: optionalText(row, "location_id"),
    source: text(row, "source", "manual") as SalesInvoice["source"],
    createdAt: text(row, "created_at"),
  }));
}

function mapPurchaseLine(row: Row): PurchaseBillLine {
  return {
    id: text(row, "id"),
    productId: text(row, "product_id"),
    warehouseId: optionalText(row, "warehouse_id"),
    description: text(row, "description"),
    quantity: numberValue(row, "quantity"),
    unitCost: numberValue(row, "unit_cost"),
  };
}

function mapPurchaseBills(rows: Row[]): PurchaseBill[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    billNo: text(row, "bill_no"),
    supplierId: text(row, "supplier_id"),
    date: text(row, "date"),
    dueDate: text(row, "due_date"),
    status: text(row, "status", "draft") as PurchaseBill["status"],
    lines: asRows(row.purchase_bill_lines).map(mapPurchaseLine),
    total: numberValue(row, "total"),
    paidAmount: numberValue(row, "paid_amount"),
    journalEntryId: optionalText(row, "journal_entry_id"),
    createdAt: text(row, "created_at"),
  }));
}

function mapPayments(rows: Row[]): Payment[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    direction: text(row, "direction", "inbound") as Payment["direction"],
    documentType: text(row, "document_type", "sales_invoice") as Payment["documentType"],
    documentId: text(row, "document_id"),
    date: text(row, "date"),
    amount: numberValue(row, "amount"),
    method: text(row, "method", "other") as Payment["method"],
    reference: text(row, "reference"),
    status: text(row, "status", "posted") as Payment["status"],
    journalEntryId: optionalText(row, "journal_entry_id"),
    createdAt: text(row, "created_at"),
  }));
}

function mapPaymentAllocations(rows: Row[]): PaymentAllocation[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    paymentId: text(row, "payment_id"),
    documentType: text(row, "document_type", "sales_invoice") as PaymentAllocation["documentType"],
    documentId: text(row, "document_id"),
    amount: numberValue(row, "amount"),
    createdAt: text(row, "created_at"),
  }));
}

function mapStockMovements(rows: Row[]): StockMovement[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    itemId: text(row, "item_id"),
    warehouseId: text(row, "warehouse_id"),
    date: text(row, "date"),
    type: text(row, "type", "adjustment_in") as StockMovement["type"],
    quantity: numberValue(row, "quantity"),
    value: numberValue(row, "value"),
    journalEntryId: optionalText(row, "journal_entry_id"),
    memo: optionalText(row, "memo"),
  }));
}

function mapStockTransfers(rows: Row[]): StockTransfer[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    transferNo: text(row, "transfer_no"),
    date: text(row, "date"),
    itemId: text(row, "item_id"),
    fromWarehouseId: text(row, "from_warehouse_id"),
    toWarehouseId: text(row, "to_warehouse_id"),
    quantity: numberValue(row, "quantity"),
    status: text(row, "status", "draft") as StockTransfer["status"],
    memo: optionalText(row, "memo"),
  }));
}

function mapStockAdjustments(rows: Row[]): StockAdjustment[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    adjustmentNo: text(row, "adjustment_no"),
    date: text(row, "date"),
    itemId: text(row, "item_id"),
    warehouseId: text(row, "warehouse_id"),
    quantity: numberValue(row, "quantity"),
    value: numberValue(row, "value"),
    reason: text(row, "reason"),
    status: text(row, "status", "posted") as StockAdjustment["status"],
    journalEntryId: optionalText(row, "journal_entry_id"),
  }));
}

function mapEmployees(rows: Row[]): Employee[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    employeeNo: text(row, "employee_no"),
    name: text(row, "name"),
    department: optionalText(row, "department"),
    role: text(row, "role"),
    contractType: text(row, "contract_type", "contract") as Employee["contractType"],
    status: text(row, "status", "active") as Employee["status"],
    baseSalary: numberValue(row, "base_salary"),
    dailyRate: numberValue(row, "daily_rate") || undefined,
    joinedAt: text(row, "joined_at"),
    phone: optionalText(row, "phone"),
    email: optionalText(row, "email"),
    address: optionalText(row, "address"),
    taxStatus: optionalText(row, "tax_status"),
    npwp: optionalText(row, "npwp"),
    bankName: optionalText(row, "bank_name"),
    bankAccountNo: optionalText(row, "bank_account_no"),
    bankAccountName: optionalText(row, "bank_account_name"),
    bpjsHealthNo: optionalText(row, "bpjs_health_no"),
    bpjsEmploymentNo: optionalText(row, "bpjs_employment_no"),
  }));
}

function mapAttendance(rows: Row[]): Attendance[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    employeeId: text(row, "employee_id"),
    date: text(row, "date"),
    status: text(row, "status", "present") as Attendance["status"],
    hours: numberValue(row, "hours"),
  }));
}

function mapPayrollRuns(rows: Row[]): PayrollRun[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    period: text(row, "period"),
    employeeId: text(row, "employee_id"),
    grossPay: numberValue(row, "gross_pay"),
    deductions: numberValue(row, "deductions"),
    taxWithheld: numberValue(row, "tax_withheld"),
    netPay: numberValue(row, "net_pay"),
    components: [],
    journalEntryId: optionalText(row, "journal_entry_id"),
  }));
}

function mapJournalLine(row: Row): JournalLine {
  const account = asRow(row.chart_of_accounts);

  return {
    id: text(row, "id"),
    accountId: text(row, "account_id"),
    accountCode: text(account, "code"),
    accountName: text(account, "name"),
    debit: numberValue(row, "debit"),
    credit: numberValue(row, "credit"),
    memo: optionalText(row, "memo"),
  };
}

function mapJournals(rows: Row[]): JournalEntry[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    date: text(row, "date"),
    period: text(row, "period"),
    description: text(row, "description"),
    source: text(row, "source", "manual_transaction") as JournalEntry["source"],
    status: text(row, "status", "posted") as JournalEntry["status"],
    referenceId: optionalText(row, "reference_id"),
    reversedEntryId: optionalText(row, "reversed_entry_id"),
    createdByRole: roleValue(text(row, "created_by_role", "finance_admin")),
    createdAt: text(row, "created_at"),
    lines: asRows(row.journal_lines).map(mapJournalLine),
  }));
}

function mapImportBatches(rows: Row[]): ImportBatch[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    source: text(row, "source", "bank_csv") as ImportBatch["source"],
    status: text(row, "status", "preview") as ImportBatch["status"],
    totalRows: numberValue(row, "total_rows"),
    validRows: numberValue(row, "valid_rows"),
    duplicateRows: numberValue(row, "duplicate_rows"),
    errorRows: numberValue(row, "error_rows"),
    createdAt: text(row, "created_at"),
  }));
}

function mapRawImportBatches(rows: Row[]): RawImportBatch[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    locationId: optionalText(row, "location_id"),
    source: text(row, "source", "manual") as RawImportBatch["source"],
    status: text(row, "status", "uploaded") as RawImportBatch["status"],
    totalRows: numberValue(row, "total_rows"),
    validRows: numberValue(row, "valid_rows"),
    duplicateRows: numberValue(row, "duplicate_rows"),
    errorRows: numberValue(row, "error_rows"),
    createdAt: text(row, "created_at"),
  }));
}

function mapRawTransactions(rows: Row[]): RawTransaction[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    locationId: text(row, "location_id"),
    batchId: optionalText(row, "batch_id"),
    source: text(row, "source", "manual") as RawTransaction["source"],
    externalId: text(row, "external_id"),
    transactionDate: text(row, "transaction_date"),
    status: text(row, "status", "uploaded") as RawTransaction["status"],
    grossAmount: numberValue(row, "gross_amount"),
    discountAmount: numberValue(row, "discount_amount"),
    netAmount: numberValue(row, "net_amount"),
    taxAmount: numberValue(row, "tax_amount"),
    paymentMethod: text(row, "payment_method", "cash") as RawTransaction["paymentMethod"],
    customerName: optionalText(row, "customer_name"),
    createdAt: text(row, "created_at"),
  }));
}

function mapRawTransactionLines(rows: Row[]): RawTransactionLine[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    rawTransactionId: text(row, "raw_transaction_id"),
    productId: optionalText(row, "product_id"),
    description: text(row, "description"),
    quantity: numberValue(row, "quantity"),
    unitPrice: numberValue(row, "unit_price"),
    total: numberValue(row, "total"),
  }));
}

function mapRawPayments(rows: Row[]): RawPayment[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    rawTransactionId: text(row, "raw_transaction_id"),
    method: text(row, "method", "cash") as RawPayment["method"],
    amount: numberValue(row, "amount"),
  }));
}

function mapSettlementRecords(rows: Row[]): SettlementRecord[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    locationId: optionalText(row, "location_id"),
    source: text(row, "source", "manual") as SettlementRecord["source"],
    settlementDate: text(row, "settlement_date"),
    method: text(row, "method", "cash") as SettlementRecord["method"],
    grossAmount: numberValue(row, "gross_amount"),
    feeAmount: numberValue(row, "fee_amount"),
    netAmount: numberValue(row, "net_amount"),
    status: text(row, "status", "pending") as SettlementRecord["status"],
  }));
}

function mapDailyTransactionSummaries(rows: Row[]): DailyTransactionSummary[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    locationId: text(row, "location_id"),
    source: text(row, "source", "manual") as DailyTransactionSummary["source"],
    date: text(row, "date"),
    status: text(row, "status", "draft") as DailyTransactionSummary["status"],
    transactionCount: numberValue(row, "transaction_count"),
    grossAmount: numberValue(row, "gross_amount"),
    discountAmount: numberValue(row, "discount_amount"),
    netAmount: numberValue(row, "net_amount"),
    taxAmount: numberValue(row, "tax_amount"),
    paymentBreakdown: asRow(row.payment_breakdown) as DailyTransactionSummary["paymentBreakdown"],
    postedJournalEntryId: optionalText(row, "posted_journal_entry_id"),
    createdAt: text(row, "created_at"),
  }));
}

function mapFixedAssets(rows: Row[]): FixedAsset[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    assetNo: text(row, "asset_no"),
    name: text(row, "name"),
    category: text(row, "category", "Umum"),
    acquisitionDate: text(row, "acquisition_date"),
    acquisitionCost: numberValue(row, "acquisition_cost"),
    residualValue: numberValue(row, "residual_value"),
    usefulLifeMonths: numberValue(row, "useful_life_months"),
    depreciationMethod: text(row, "depreciation_method", "straight_line") as FixedAsset["depreciationMethod"],
    acquisitionType: text(row, "acquisition_type", "opening_balance") as FixedAsset["acquisitionType"],
    status: text(row, "status", "active") as FixedAsset["status"],
    locationId: optionalText(row, "location_id"),
    supplierId: optionalText(row, "supplier_id"),
    journalEntryId: optionalText(row, "journal_entry_id"),
    notes: optionalText(row, "notes"),
    createdAt: text(row, "created_at"),
  }));
}

function mapFixedAssetDepreciationRuns(rows: Row[]): FixedAssetDepreciationRun[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    period: text(row, "period"),
    date: text(row, "date"),
    status: text(row, "status", "posted") as FixedAssetDepreciationRun["status"],
    totalDepreciation: numberValue(row, "total_depreciation"),
    journalEntryId: optionalText(row, "journal_entry_id"),
    createdAt: text(row, "created_at"),
  }));
}

function mapFixedAssetDepreciationLines(rows: Row[]): FixedAssetDepreciationLine[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    runId: text(row, "run_id"),
    assetId: text(row, "asset_id"),
    period: text(row, "period"),
    amount: numberValue(row, "amount"),
    accumulatedDepreciation: numberValue(row, "accumulated_depreciation"),
    bookValue: numberValue(row, "book_value"),
    createdAt: text(row, "created_at"),
  }));
}

function mapFixedAssetDisposals(rows: Row[]): FixedAssetDisposal[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    assetId: text(row, "asset_id"),
    date: text(row, "date"),
    proceeds: numberValue(row, "proceeds"),
    bookValue: numberValue(row, "book_value"),
    gainLoss: numberValue(row, "gain_loss"),
    reason: text(row, "reason"),
    status: text(row, "status", "posted") as FixedAssetDisposal["status"],
    journalEntryId: optionalText(row, "journal_entry_id"),
    createdAt: text(row, "created_at"),
  }));
}

function mapAttachments(rows: Row[]): Attachment[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    ownerType: text(row, "owner_type", "sales_invoice") as Attachment["ownerType"],
    ownerId: text(row, "owner_id"),
    fileName: text(row, "file_name"),
    storagePath: text(row, "storage_path"),
    mimeType: text(row, "mime_type"),
    sizeBytes: numberValue(row, "size_bytes"),
    createdAt: text(row, "created_at"),
  }));
}

function demoSandboxFromRow(row: Row): DemoSandboxMetadata | undefined {
  const id = text(row, "id");
  const businessId = text(row, "business_id");
  const authUserId = text(row, "auth_user_id");

  if (!id || !businessId || !authUserId) return undefined;

  return {
    id,
    businessId,
    authUserId,
    templateId: text(row, "template_id", "food_beverage"),
    resetPolicy: text(row, "reset_policy", "daily") as DemoSandboxMetadata["resetPolicy"],
    seedVersion: numberValue(row, "seed_version", 1),
    lastResetAt: optionalText(row, "last_reset_at"),
    nextResetAt: optionalText(row, "next_reset_at"),
  };
}

function mapActivities(rows: Row[]): ErpWorkspace["activities"] {
  return rows.map((row) => ({
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    actorName: text(row, "actor_name"),
    module: text(row, "module", "accounting") as ErpWorkspace["activities"][number]["module"],
    action: text(row, "action"),
    description: text(row, "description"),
    createdAt: text(row, "created_at"),
  }));
}

type QueryError = { message: string; code?: string } | null;
type QueryResult = { error: QueryError };

function isMissingOptionalTableError(error: NonNullable<QueryError>) {
  const message = error.message.toLowerCase();

  return (
    error.code === "PGRST205" ||
    (message.includes("schema cache") && message.includes("could not find")) ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function tableError(requiredResults: QueryResult[], optionalResults: QueryResult[] = []) {
  const requiredError = requiredResults.find((result) => result.error)?.error;

  if (requiredError) return requiredError;

  return optionalResults.find((result) => result.error && !isMissingOptionalTableError(result.error))?.error ?? null;
}

function skipRows() {
  return Promise.resolve({ data: [], error: null });
}

function skipSingle() {
  return Promise.resolve({ data: null, error: null });
}

function needs(profile: WorkspaceLoadProfile, ...profiles: WorkspaceLoadProfile[]) {
  return profile === "full" || profiles.includes(profile);
}

function listLimit(profile: WorkspaceLoadProfile, regularLimit = 200, shellLimit = 8) {
  if (profile === "full" || profile === "settings") return null;
  if (profile === "shell") return shellLimit;
  return regularLimit;
}

export async function loadSupabaseWorkspace(
  supabase: SupabaseClient,
  context: WorkspaceLoadContext,
  options: WorkspaceLoadOptions = {},
): Promise<ErpWorkspace> {
  const profile = options.profile ?? "full";
  const canManageMembers = (context.permissions ?? permissionsForRole(context.role)).includes("admin:manage_users");
  const salesLimit = listLimit(profile);
  const purchaseLimit = listLimit(profile);
  const paymentsLimit = listLimit(profile, 250, 10);
  const journalLimit = listLimit(profile, 250, 10);
  const operationalLimit = listLimit(profile, 500, 10);
  const masterLimit = profile === "full" || profile === "settings" ? null : 1_000;
  const salesInvoiceQuery = () => {
    let query = supabase
      .from("sales_invoices")
      .select("*, sales_invoice_lines(*)")
      .eq("business_id", context.businessId)
      .order("date", { ascending: false });

    if (profile === "document-detail" && options.documentType === "sales_invoice" && options.documentId) {
      query = query.eq("id", options.documentId);
    } else if (salesLimit) {
      query = query.limit(salesLimit);
    }

    return query;
  };

  const purchaseBillQuery = () => {
    let query = supabase
      .from("purchase_bills")
      .select("*, purchase_bill_lines(*)")
      .eq("business_id", context.businessId)
      .order("date", { ascending: false });

    if (profile === "document-detail" && options.documentType === "purchase_bill" && options.documentId) {
      query = query.eq("id", options.documentId);
    } else if (purchaseLimit) {
      query = query.limit(purchaseLimit);
    }

    return query;
  };

  const paymentsQuery = () => {
    let query = supabase
      .from("payments")
      .select("*")
      .eq("business_id", context.businessId)
      .order("date", { ascending: false });

    if (profile === "document-detail" && options.documentType && options.documentId) {
      query = query.eq("document_type", options.documentType).eq("document_id", options.documentId);
    } else if (paymentsLimit) {
      query = query.limit(paymentsLimit);
    }

    return query;
  };

  const paymentAllocationsQuery = () => {
    let query = supabase
      .from("payment_allocations")
      .select("*")
      .eq("business_id", context.businessId)
      .order("created_at", { ascending: false });

    if (profile === "document-detail" && options.documentType && options.documentId) {
      query = query.eq("document_type", options.documentType).eq("document_id", options.documentId);
    } else if (paymentsLimit) {
      query = query.limit(paymentsLimit);
    }

    return query;
  };

  const attachmentsQuery = () => {
    let query = supabase
      .from("attachments")
      .select("*")
      .eq("business_id", context.businessId)
      .order("created_at", { ascending: false });

    if (profile === "document-detail" && options.documentType && options.documentId) {
      query = query.eq("owner_type", options.documentType).eq("owner_id", options.documentId);
    } else if (operationalLimit) {
      query = query.limit(operationalLimit);
    }

    return query;
  };

  const [
    business,
    periods,
    taxProfiles,
    accounts,
    locations,
    featureFlags,
    templates,
    transactionSources,
    memberInvites,
    members,
    customers,
    suppliers,
    products,
    warehouses,
    salesInvoices,
    purchaseBills,
    payments,
    paymentAllocations,
    stockMovements,
    stockTransfers,
    stockAdjustments,
    employees,
    attendance,
    payrollRuns,
    journals,
    importBatches,
    rawImportBatches,
    rawTransactions,
    rawTransactionLines,
    rawPayments,
    settlementRecords,
    dailyTransactionSummaries,
    fixedAssets,
    fixedAssetDepreciationRuns,
    fixedAssetDepreciationLines,
    fixedAssetDisposals,
    attachments,
    demoSandbox,
    activities,
  ] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", context.businessId).single(),
    supabase
      .from("report_periods")
      .select("*")
      .eq("business_id", context.businessId)
      .order("start_date", { ascending: false })
      .limit(1),
    supabase.from("tax_profiles").select("*").eq("business_id", context.businessId).maybeSingle(),
    needs(profile, "dashboard", "accounting", "reports", "tax", "document-detail")
      ? supabase.from("chart_of_accounts").select("*").eq("business_id", context.businessId).order("code")
      : skipRows(),
    supabase.from("locations").select("*").eq("business_id", context.businessId).order("code"),
    needs(profile, "shell", "settings", "onboarding")
      ? supabase.from("business_feature_flags").select("*").eq("business_id", context.businessId).order("module")
      : skipRows(),
    needs(profile, "settings", "onboarding") ? supabase.from("industry_templates").select("*").order("name") : skipRows(),
    needs(profile, "settings", "reports", "dashboard")
      ? supabase.from("transaction_sources").select("*").eq("business_id", context.businessId).order("name")
      : skipRows(),
    needs(profile, "settings") && canManageMembers
      ? supabase
          .from("member_invites")
          .select("*")
          .eq("business_id", context.businessId)
          .order("created_at", { ascending: false })
          .limit(25)
      : skipRows(),
    needs(profile, "settings") && canManageMembers
      ? supabase
          .from("business_members")
          .select("id, business_id, auth_user_id, role, access_scope, access_permissions, location_ids, created_at")
          .eq("business_id", context.businessId)
          .order("created_at", { ascending: true })
      : skipRows(),
    needs(profile, "dashboard", "sales", "cash", "settings", "document-detail")
      ? (masterLimit
          ? supabase.from("customers").select("*").eq("business_id", context.businessId).order("name").limit(masterLimit)
          : supabase.from("customers").select("*").eq("business_id", context.businessId).order("name"))
      : skipRows(),
    needs(profile, "purchases", "cash", "settings", "assets", "document-detail")
      ? (masterLimit
          ? supabase.from("suppliers").select("*").eq("business_id", context.businessId).order("name").limit(masterLimit)
          : supabase.from("suppliers").select("*").eq("business_id", context.businessId).order("name"))
      : skipRows(),
    needs(profile, "dashboard", "sales", "purchases", "inventory", "pricing", "settings", "document-detail")
      ? (masterLimit
          ? supabase.from("products").select("*").eq("business_id", context.businessId).order("sku").limit(masterLimit)
          : supabase.from("products").select("*").eq("business_id", context.businessId).order("sku"))
      : skipRows(),
    needs(profile, "sales", "purchases", "inventory", "settings", "document-detail")
      ? (masterLimit
          ? supabase.from("warehouses").select("*").eq("business_id", context.businessId).order("code").limit(masterLimit)
          : supabase.from("warehouses").select("*").eq("business_id", context.businessId).order("code"))
      : skipRows(),
    needs(profile, "shell", "dashboard", "sales", "cash", "accounting", "reports", "tax", "document-detail") ? salesInvoiceQuery() : skipRows(),
    needs(profile, "shell", "dashboard", "purchases", "cash", "accounting", "reports", "tax", "document-detail") ? purchaseBillQuery() : skipRows(),
    needs(profile, "cash", "accounting", "reports", "tax", "document-detail") ? paymentsQuery() : skipRows(),
    needs(profile, "cash", "accounting", "reports", "document-detail") ? paymentAllocationsQuery() : skipRows(),
    needs(profile, "dashboard", "inventory", "accounting", "reports")
      ? (operationalLimit
          ? supabase
              .from("stock_movements")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: true })
              .limit(operationalLimit)
          : supabase
              .from("stock_movements")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: true }))
      : skipRows(),
    needs(profile, "inventory", "accounting")
      ? (operationalLimit
          ? supabase
              .from("stock_transfers")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false })
              .limit(operationalLimit)
          : supabase
              .from("stock_transfers")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false }))
      : skipRows(),
    needs(profile, "inventory", "accounting")
      ? (operationalLimit
          ? supabase
              .from("stock_adjustments")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false })
              .limit(operationalLimit)
          : supabase
              .from("stock_adjustments")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false }))
      : skipRows(),
    needs(profile, "dashboard", "hr", "payroll", "tax", "settings")
      ? (masterLimit
          ? supabase.from("employees").select("*").eq("business_id", context.businessId).order("employee_no").limit(masterLimit)
          : supabase.from("employees").select("*").eq("business_id", context.businessId).order("employee_no"))
      : skipRows(),
    needs(profile, "hr")
      ? (operationalLimit
          ? supabase.from("attendance").select("*").eq("business_id", context.businessId).order("date", { ascending: false }).limit(operationalLimit)
          : supabase.from("attendance").select("*").eq("business_id", context.businessId).order("date", { ascending: false }))
      : skipRows(),
    needs(profile, "hr", "payroll", "dashboard", "reports")
      ? (operationalLimit
          ? supabase
              .from("payroll_runs")
              .select("*")
              .eq("business_id", context.businessId)
              .order("created_at", { ascending: false })
              .limit(operationalLimit)
          : supabase
              .from("payroll_runs")
              .select("*")
              .eq("business_id", context.businessId)
              .order("created_at", { ascending: false }))
      : skipRows(),
    needs(profile, "shell", "dashboard", "accounting", "reports", "tax", "document-detail")
      ? (journalLimit
          ? supabase
              .from("journal_entries")
              .select("*, journal_lines(*, chart_of_accounts(code, name))")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false })
              .limit(journalLimit)
          : supabase
              .from("journal_entries")
              .select("*, journal_lines(*, chart_of_accounts(code, name))")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false }))
      : skipRows(),
    needs(profile, "accounting", "reports")
      ? (operationalLimit
          ? supabase
              .from("import_batches")
              .select("*")
              .eq("business_id", context.businessId)
              .order("created_at", { ascending: false })
              .limit(operationalLimit)
          : supabase
              .from("import_batches")
              .select("*")
              .eq("business_id", context.businessId)
              .order("created_at", { ascending: false }))
      : skipRows(),
    needs(profile, "shell", "dashboard", "accounting", "reports")
      ? supabase
          .from("raw_import_batches")
          .select("*")
          .eq("business_id", context.businessId)
          .order("created_at", { ascending: false })
          .limit(profile === "shell" ? 5 : 25)
      : skipRows(),
    needs(profile, "full")
      ? supabase
          .from("raw_transactions")
          .select("*")
          .eq("business_id", context.businessId)
          .order("transaction_date", { ascending: false })
          .limit(0)
      : skipRows(),
    needs(profile, "full")
      ? supabase
          .from("raw_transaction_lines")
          .select("*")
          .eq("business_id", context.businessId)
          .order("id", { ascending: false })
          .limit(0)
      : skipRows(),
    needs(profile, "full")
      ? supabase
          .from("raw_payments")
          .select("*")
          .eq("business_id", context.businessId)
          .order("id", { ascending: false })
          .limit(0)
      : skipRows(),
    needs(profile, "dashboard", "accounting", "reports")
      ? supabase
          .from("settlement_records")
          .select("*")
          .eq("business_id", context.businessId)
          .order("settlement_date", { ascending: false })
          .limit(operationalLimit ?? 500)
      : skipRows(),
    needs(profile, "shell", "dashboard", "accounting", "reports", "tax")
      ? supabase
          .from("daily_transaction_summaries")
          .select("*")
          .eq("business_id", context.businessId)
          .order("date", { ascending: false })
          .limit(profile === "shell" ? 10 : 500)
      : skipRows(),
    needs(profile, "dashboard", "assets", "reports")
      ? (masterLimit
          ? supabase
              .from("fixed_assets")
              .select("*")
              .eq("business_id", context.businessId)
              .order("asset_no")
              .limit(masterLimit)
          : supabase
              .from("fixed_assets")
              .select("*")
              .eq("business_id", context.businessId)
              .order("asset_no"))
      : skipRows(),
    needs(profile, "assets", "reports")
      ? (operationalLimit
          ? supabase
              .from("fixed_asset_depreciation_runs")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false })
              .limit(operationalLimit)
          : supabase
              .from("fixed_asset_depreciation_runs")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false }))
      : skipRows(),
    needs(profile, "dashboard", "assets", "reports")
      ? (operationalLimit
          ? supabase
              .from("fixed_asset_depreciation_lines")
              .select("*")
              .eq("business_id", context.businessId)
              .order("period", { ascending: false })
              .limit(operationalLimit)
          : supabase
              .from("fixed_asset_depreciation_lines")
              .select("*")
              .eq("business_id", context.businessId)
              .order("period", { ascending: false }))
      : skipRows(),
    needs(profile, "assets", "reports")
      ? (operationalLimit
          ? supabase
              .from("fixed_asset_disposals")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false })
              .limit(operationalLimit)
          : supabase
              .from("fixed_asset_disposals")
              .select("*")
              .eq("business_id", context.businessId)
              .order("date", { ascending: false }))
      : skipRows(),
    needs(profile, "tax", "settings", "document-detail") ? attachmentsQuery() : skipRows(),
    needs(profile, "shell", "settings")
      ? supabase
          .from("demo_sandboxes")
          .select("*")
          .eq("business_id", context.businessId)
          .maybeSingle()
      : skipSingle(),
    needs(profile, "shell", "dashboard")
      ? supabase
          .from("activity_events")
          .select("*")
          .eq("business_id", context.businessId)
          .order("created_at", { ascending: false })
          .limit(profile === "shell" ? 8 : 40)
      : skipRows(),
  ]);

  const error = tableError(
    [
      business,
      periods,
      taxProfiles,
      accounts,
      customers,
      suppliers,
      products,
      warehouses,
      salesInvoices,
      purchaseBills,
      payments,
      paymentAllocations,
      stockMovements,
      stockTransfers,
      stockAdjustments,
      employees,
      attendance,
      payrollRuns,
      journals,
      importBatches,
      attachments,
      activities,
    ],
    [
      locations,
      featureFlags,
      templates,
      transactionSources,
      members,
      memberInvites,
      rawImportBatches,
      rawTransactions,
      rawTransactionLines,
      rawPayments,
      settlementRecords,
      dailyTransactionSummaries,
      fixedAssets,
      fixedAssetDepreciationRuns,
      fixedAssetDepreciationLines,
      fixedAssetDisposals,
      demoSandbox,
    ],
  );

  if (error) {
    throw new Error(error.message);
  }

  const businessData = businessFromRow(asRow(business.data));
  const period = periodFromRow(asRows(periods.data)[0] ?? {});
  const user: AppUser = {
    id: context.userId,
    name: context.userName ?? context.userEmail ?? "Supabase user",
    email: context.userEmail ?? "",
    role: context.role,
  };
  const mappedMembers = mapBusinessMembers(asRows(members.data));
  const hydratedMembers = needs(profile, "settings") && canManageMembers
    ? await hydrateBusinessMemberProfiles(mappedMembers)
    : mappedMembers;

  const baseWorkspace = {
    user,
    permissions: context.permissions ?? permissionsForRole(context.role),
    business: businessData,
    assignedLocationIds: context.assignedLocationIds ?? [],
    period,
    taxProfile: taxProfileFromRow(asRow(taxProfiles.data), context.businessId),
    accounts: mapChartOfAccounts(asRows(accounts.data)),
    locations: mapLocations(asRows(locations.data)).filter((location) => context.role === "owner" || context.role === "system_admin" || context.accessScope !== "custom" || (context.assignedLocationIds ?? []).includes(location.id)),
    featureFlags: mapFeatureFlags(asRows(featureFlags.data)),
    industryTemplates: mapIndustryTemplates(asRows(templates.data)),
    transactionSources: mapTransactionSources(asRows(transactionSources.data)),
    members: hydratedMembers,
    memberInvites: mapMemberInvites(asRows(memberInvites.data)),
    customers: mapCustomers(asRows(customers.data)),
    suppliers: mapSuppliers(asRows(suppliers.data)),
    products: mapProducts(asRows(products.data)),
    warehouses: mapWarehouses(asRows(warehouses.data)),
    salesInvoices: mapSalesInvoices(asRows(salesInvoices.data)),
    purchaseBills: mapPurchaseBills(asRows(purchaseBills.data)),
    payments: mapPayments(asRows(payments.data)),
    paymentAllocations: mapPaymentAllocations(asRows(paymentAllocations.data)),
    stockMovements: mapStockMovements(asRows(stockMovements.data)),
    stockTransfers: mapStockTransfers(asRows(stockTransfers.data)),
    stockAdjustments: mapStockAdjustments(asRows(stockAdjustments.data)),
    employees: mapEmployees(asRows(employees.data)),
    attendance: mapAttendance(asRows(attendance.data)),
    payrollRuns: mapPayrollRuns(asRows(payrollRuns.data)),
    journals: mapJournals(asRows(journals.data)),
    importBatches: mapImportBatches(asRows(importBatches.data)),
    rawImportBatches: mapRawImportBatches(asRows(rawImportBatches.data)),
    rawTransactions: mapRawTransactions(asRows(rawTransactions.data)),
    rawTransactionLines: mapRawTransactionLines(asRows(rawTransactionLines.data)),
    rawPayments: mapRawPayments(asRows(rawPayments.data)),
    settlementRecords: mapSettlementRecords(asRows(settlementRecords.data)),
    dailyTransactionSummaries: mapDailyTransactionSummaries(asRows(dailyTransactionSummaries.data)),
    fixedAssets: mapFixedAssets(asRows(fixedAssets.data)),
    fixedAssetDepreciationRuns: mapFixedAssetDepreciationRuns(asRows(fixedAssetDepreciationRuns.data)),
    fixedAssetDepreciationLines: mapFixedAssetDepreciationLines(asRows(fixedAssetDepreciationLines.data)),
    fixedAssetDisposals: mapFixedAssetDisposals(asRows(fixedAssetDisposals.data)),
    locationMetrics: [],
    attachments: mapAttachments(asRows(attachments.data)),
    activities: mapActivities(asRows(activities.data)),
    demoSandbox: demoSandboxFromRow(asRow(demoSandbox.data)),
  };
  const metrics = calculateErpMetrics(baseWorkspace);
  const locationMetrics = buildLocationMetrics(baseWorkspace);

  return {
    ...baseWorkspace,
    locationMetrics,
    metrics,
    tasks: buildErpTasks({ ...baseWorkspace, locationMetrics, metrics }),
  };
}
