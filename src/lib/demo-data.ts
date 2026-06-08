import { accountCodes, systemAccounts } from "@/lib/accounting/chart";
import {
  buildExpenseJournal,
  buildInventoryPurchaseJournal,
  buildOpeningBalance,
  buildPayrollJournal,
  buildSalesJournal,
} from "@/lib/accounting/engine";
import type {
  Attendance,
  Business,
  Employee,
  InventoryItem,
  ReportPeriod,
  StockMovement,
  TaxProfile,
  Warehouse,
} from "@/lib/domain/types";

export const demoBusiness: Business = {
  id: "demo-business",
  legalName: "CV Rasa Rapi Nusantara",
  displayName: "Rasa Rapi Kitchen",
  industry: "food_beverage",
  taxId: "09.123.456.7-001.000",
  baseCurrency: "IDR",
  periodStartMonth: 1,
  ownerName: "Ayu Prameswari",
};

export const demoPeriod: ReportPeriod = {
  label: "Juni 2026",
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  locked: false,
};

export const demoTaxProfile: TaxProfile = {
  id: "tax-demo",
  businessId: demoBusiness.id,
  taxpayerType: "corporate_umkm",
  usesFinalUmkmRate: true,
  finalUmkmRate: 0.005,
  coretaxStatus: "account_ready",
};

export const demoWarehouses: Warehouse[] = [
  {
    id: "wh-kitchen",
    businessId: demoBusiness.id,
    code: "KITCHEN",
    name: "Dapur Utama",
    location: "Jakarta Selatan",
    isActive: true,
  },
  {
    id: "wh-booth",
    businessId: demoBusiness.id,
    code: "BOOTH",
    name: "Booth Event",
    location: "Jakarta Pusat",
    isActive: true,
  },
];

export const demoItems: InventoryItem[] = [
  {
    id: "item-rendang",
    businessId: demoBusiness.id,
    sku: "FNB-RND-250",
    name: "Rendang Bowl",
    variant: "250g",
    unit: "porsi",
    trackStock: true,
    defaultWarehouseId: "wh-kitchen",
  },
  {
    id: "item-teh",
    businessId: demoBusiness.id,
    sku: "DRK-TEH-350",
    name: "Es Teh Nusantara",
    variant: "350ml",
    unit: "botol",
    trackStock: true,
    defaultWarehouseId: "wh-booth",
  },
];

export const demoStockMovements: StockMovement[] = [
  {
    id: "sm-1",
    businessId: demoBusiness.id,
    itemId: "item-rendang",
    warehouseId: "wh-kitchen",
    date: "2026-06-02",
    type: "purchase",
    quantity: 280,
    value: 5600000,
  },
  {
    id: "sm-2",
    businessId: demoBusiness.id,
    itemId: "item-rendang",
    warehouseId: "wh-kitchen",
    date: "2026-06-05",
    type: "sale",
    quantity: 95,
    value: 1900000,
  },
  {
    id: "sm-3",
    businessId: demoBusiness.id,
    itemId: "item-teh",
    warehouseId: "wh-booth",
    date: "2026-06-03",
    type: "purchase",
    quantity: 420,
    value: 1400000,
  },
  {
    id: "sm-4",
    businessId: demoBusiness.id,
    itemId: "item-teh",
    warehouseId: "wh-booth",
    date: "2026-06-05",
    type: "sale",
    quantity: 130,
    value: 433333,
  },
];

export const demoEmployees: Employee[] = [
  {
    id: "emp-1",
    businessId: demoBusiness.id,
    employeeNo: "EMP-001",
    name: "Dimas",
    role: "Head Kitchen",
    contractType: "permanent",
    status: "active",
    baseSalary: 5200000,
    joinedAt: "2025-11-12",
  },
  {
    id: "emp-2",
    businessId: demoBusiness.id,
    employeeNo: "EMP-002",
    name: "Rani",
    role: "Event Crew",
    contractType: "daily",
    status: "contract",
    baseSalary: 0,
    dailyRate: 180000,
    joinedAt: "2026-02-04",
  },
];

export const demoAttendance: Attendance[] = [
  { id: "att-1", businessId: demoBusiness.id, employeeId: "emp-1", date: "2026-06-01", status: "present", hours: 8 },
  { id: "att-2", businessId: demoBusiness.id, employeeId: "emp-1", date: "2026-06-02", status: "present", hours: 8 },
  { id: "att-3", businessId: demoBusiness.id, employeeId: "emp-2", date: "2026-06-01", status: "present", hours: 7 },
  { id: "att-4", businessId: demoBusiness.id, employeeId: "emp-2", date: "2026-06-02", status: "leave", hours: 0 },
];

export const demoJournalEntries = [
  buildOpeningBalance({
    businessId: demoBusiness.id,
    date: "2026-06-01",
    autoOffsetAccountCode: accountCodes.ownerCapital,
    balances: [
      { accountCode: accountCodes.cash, amount: 25000000 },
      { accountCode: accountCodes.accountsReceivable, amount: 6000000 },
      { accountCode: accountCodes.inventory, amount: 18000000 },
      { accountCode: accountCodes.fixedAssets, amount: 40000000 },
      { accountCode: accountCodes.accountsPayable, amount: 7500000 },
    ],
    accounts: systemAccounts,
  }),
  buildSalesJournal({
    businessId: demoBusiness.id,
    date: "2026-06-05",
    revenueAmount: 10000000,
    cashReceived: 7500000,
    receivableAmount: 2500000,
    cogs: 4600000,
    inventoryCost: 4600000,
    accounts: systemAccounts,
  }),
  buildExpenseJournal({
    businessId: demoBusiness.id,
    date: "2026-06-08",
    amount: 2100000,
    paidAmount: 2100000,
    description: "Sewa booth dan operasional event",
    accounts: systemAccounts,
  }),
  buildInventoryPurchaseJournal({
    businessId: demoBusiness.id,
    date: "2026-06-10",
    inventoryAmount: 7000000,
    paidAmount: 4000000,
    payableAmount: 3000000,
    accounts: systemAccounts,
  }),
  buildPayrollJournal({
    businessId: demoBusiness.id,
    date: "2026-06-25",
    grossPay: 5500000,
    netCashPaid: 4800000,
    salaryPayable: 400000,
    taxWithheld: 300000,
    accounts: systemAccounts,
  }),
];
