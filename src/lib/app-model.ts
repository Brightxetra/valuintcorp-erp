import { systemAccounts } from "@/lib/accounting/chart";
import {
  demoBusiness,
  demoEmployees,
  demoItems,
  demoJournalEntries,
  demoPeriod,
  demoStockMovements,
  demoTaxProfile,
  demoWarehouses,
} from "@/lib/demo-data";
import { valueInventory } from "@/lib/inventory/valuation";
import {
  buildBalanceSheet,
  buildCalkNotes,
  buildDashboardMetrics,
  buildIncomeStatement,
} from "@/lib/reports/reports";
import { prepareCoretaxPackage } from "@/lib/tax/coretax";

export function getDemoWorkspace() {
  const metrics = buildDashboardMetrics(demoJournalEntries, demoPeriod, systemAccounts);
  const income = buildIncomeStatement(demoJournalEntries, demoPeriod, systemAccounts);
  const balance = buildBalanceSheet(demoJournalEntries, demoPeriod, systemAccounts);
  const notes = buildCalkNotes({
    business: demoBusiness,
    taxProfile: demoTaxProfile,
    period: demoPeriod,
  });
  const coretax = prepareCoretaxPackage({
    business: demoBusiness,
    taxProfile: demoTaxProfile,
    entries: demoJournalEntries,
    accounts: systemAccounts,
    period: demoPeriod,
  });
  const inventory = valueInventory(demoStockMovements);
  const newestEntries = [...demoJournalEntries].sort((a, b) => b.date.localeCompare(a.date));

  return {
    accounts: systemAccounts,
    business: demoBusiness,
    employees: demoEmployees,
    items: demoItems,
    warehouses: demoWarehouses,
    stockMovements: demoStockMovements,
    taxProfile: demoTaxProfile,
    period: demoPeriod,
    entries: demoJournalEntries,
    metrics,
    income,
    balance,
    notes,
    coretax,
    inventory,
    newestEntries,
  };
}
