import { describe, expect, it } from "vitest";
import { accountCodes, systemAccounts } from "@/lib/accounting/chart";
import { buildExpenseJournal, buildSalesJournal } from "@/lib/accounting/engine";
import { demoJournalEntries, demoPeriod } from "@/lib/demo-data";
import { createDemoErpWorkspace } from "@/lib/erp/demo-workspace";
import { buildBalanceSheet, buildDashboardMetrics, buildIncomeStatement } from "@/lib/reports/reports";

describe("report builders", () => {
  it("reconciles income statement to dashboard metrics", () => {
    const income = buildIncomeStatement(demoJournalEntries, demoPeriod, systemAccounts);
    const dashboard = buildDashboardMetrics(demoJournalEntries, demoPeriod, systemAccounts);

    expect(dashboard.revenue).toBe(income.totalRevenue);
    expect(dashboard.netIncome).toBe(income.netIncome);
    expect(income.grossProfit).toBe(5400000);
  });

  it("keeps balance sheet equation intact after current earnings", () => {
    const balance = buildBalanceSheet(demoJournalEntries, demoPeriod, systemAccounts);

    expect(balance.totalAssets).toBe(balance.totalLiabilities + balance.totalEquity);
  });

  it("includes prior period earnings in current balance sheet equity", () => {
    const entries = [
      buildSalesJournal({
        date: "2026-05-15",
        revenueAmount: 1000000,
        cashReceived: 1000000,
      }),
      buildExpenseJournal({
        date: "2026-05-20",
        amount: 250000,
        paidAmount: 250000,
      }),
      buildSalesJournal({
        date: "2026-06-15",
        revenueAmount: 500000,
        cashReceived: 500000,
      }),
    ];
    const balance = buildBalanceSheet(entries, demoPeriod, systemAccounts);

    expect(balance.equity.find((line) => line.code === "3999")?.amount).toBe(1250000);
    expect(balance.assets.find((line) => line.code === accountCodes.cash)?.amount).toBe(1250000);
  });

  it("keeps ERP report cards and exports on the same posted journal source", () => {
    const workspace = createDemoErpWorkspace();
    const dashboard = buildDashboardMetrics(workspace.journals, workspace.period, systemAccounts);

    expect(workspace.metrics.revenue).toBe(dashboard.revenue);
    expect(workspace.metrics.cash).toBe(dashboard.cash);
    expect(workspace.metrics.payrollCost).toBe(dashboard.payrollCost);
  });
});
