export type Money = number;

export const businessRoles = [
  "owner",
  "finance_admin",
  "staff",
  "hr",
  "external_advisor",
  "system_admin",
] as const;

export type BusinessRole = (typeof businessRoles)[number];

export type BusinessIndustry =
  | "service"
  | "retail"
  | "food_beverage"
  | "online_seller"
  | "manufacturing"
  | "general";

export interface Business {
  id: string;
  legalName: string;
  displayName: string;
  industry: BusinessIndustry;
  taxId?: string;
  logoUrl?: string;
  baseCurrency: "IDR";
  periodStartMonth: number;
  ownerName: string;
}

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type NormalBalance = "debit" | "credit";

export interface ChartOfAccount {
  id: string;
  businessId: string | null;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  category:
    | "cash"
    | "receivable"
    | "inventory"
    | "fixed_asset"
    | "payable"
    | "tax"
    | "capital"
    | "sales"
    | "other_income"
    | "cogs"
    | "operating_expense"
    | "payroll"
    | "adjustment";
  isSystem: boolean;
  isActive: boolean;
}

export type JournalSource =
  | "opening_balance"
  | "manual_transaction"
  | "csv_import"
  | "inventory"
  | "fixed_asset"
  | "payroll"
  | "tax"
  | "reversal";

export type JournalStatus = "draft" | "posted" | "reversed";

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: Money;
  credit: Money;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  businessId: string;
  date: string;
  period: string;
  description: string;
  source: JournalSource;
  status: JournalStatus;
  referenceId?: string;
  reversedEntryId?: string;
  createdByRole: BusinessRole;
  createdAt: string;
  lines: JournalLine[];
}

export interface OpeningBalance {
  accountCode: string;
  amount: Money;
}

export type TransactionType =
  | "sale"
  | "expense"
  | "inventory_purchase"
  | "payroll"
  | "adjustment";

export interface Transaction {
  id: string;
  businessId: string;
  type: TransactionType;
  date: string;
  counterparty?: string;
  grossAmount: Money;
  attachmentUrls: string[];
  journalEntryId?: string;
  importedFrom?: "manual" | "csv" | "adapter";
}

export interface Warehouse {
  id: string;
  businessId: string;
  code: string;
  name: string;
  location: string;
  isActive: boolean;
}

export interface InventoryItem {
  id: string;
  businessId: string;
  sku: string;
  name: string;
  variant?: string;
  unit: string;
  trackStock: boolean;
  defaultWarehouseId: string;
}

export type StockMovementType =
  | "purchase"
  | "sale"
  | "transfer_in"
  | "transfer_out"
  | "adjustment_in"
  | "adjustment_out";

export interface StockMovement {
  id: string;
  businessId: string;
  itemId: string;
  warehouseId: string;
  date: string;
  type: StockMovementType;
  quantity: number;
  value: Money;
  journalEntryId?: string;
  memo?: string;
}

export type EmployeeStatus = "active" | "inactive" | "contract";
export type ContractType = "permanent" | "contract" | "daily";

export interface Employee {
  id: string;
  businessId: string;
  employeeNo: string;
  name: string;
  role: string;
  contractType: ContractType;
  status: EmployeeStatus;
  baseSalary: Money;
  dailyRate?: Money;
  joinedAt: string;
}

export interface Attendance {
  id: string;
  businessId: string;
  employeeId: string;
  date: string;
  status: "present" | "absent" | "leave" | "sick";
  hours: number;
}

export interface LeaveRequest {
  id: string;
  businessId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
}

export interface PayrollComponent {
  name: string;
  amount: Money;
  type: "earning" | "deduction";
}

export interface PayrollRun {
  id: string;
  businessId: string;
  period: string;
  employeeId: string;
  grossPay: Money;
  deductions: Money;
  taxWithheld: Money;
  netPay: Money;
  components: PayrollComponent[];
  journalEntryId?: string;
}

export interface TaxProfile {
  id: string;
  businessId: string;
  taxpayerType: "individual_umkm" | "corporate_umkm";
  usesFinalUmkmRate: boolean;
  finalUmkmRate: number;
  coretaxStatus: "not_started" | "account_ready" | "certificate_ready";
}

export interface ReportPeriod {
  label: string;
  startDate: string;
  endDate: string;
  locked: boolean;
}

export function normalBalanceForType(type: AccountType): NormalBalance {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}
