import { describe, expect, it } from "vitest";
import { accountCodes, systemAccounts } from "@/lib/accounting/chart";
import {
  assertBalanced,
  buildExpenseJournal,
  buildOpeningBalance,
  buildPayrollJournal,
  buildSalesJournal,
  makeLine,
  postJournalEntry,
  reverseJournalEntry,
  sumCredits,
  sumDebits,
} from "@/lib/accounting/engine";

describe("accounting engine", () => {
  it("creates balanced opening balance entries with owner capital offset", () => {
    const entry = buildOpeningBalance({
      date: "2026-06-01",
      autoOffsetAccountCode: accountCodes.ownerCapital,
      balances: [
        { accountCode: accountCodes.cash, amount: 1000000 },
        { accountCode: accountCodes.inventory, amount: 500000 },
        { accountCode: accountCodes.accountsPayable, amount: 250000 },
      ],
    });

    expect(sumDebits(entry.lines)).toBe(sumCredits(entry.lines));
    expect(entry.lines.some((line) => line.accountCode === accountCodes.ownerCapital)).toBe(true);
  });

  it("requires explicit approval before offsetting unbalanced opening balances", () => {
    expect(() =>
      buildOpeningBalance({
        date: "2026-06-01",
        balances: [{ accountCode: accountCodes.cash, amount: 1000000 }],
      }),
    ).toThrow("Opening balance is not balanced");
  });

  it("rejects unbalanced manual journals", () => {
    const lines = [
      makeLine(systemAccounts, accountCodes.cash, "debit", 100000),
      makeLine(systemAccounts, accountCodes.salesRevenue, "credit", 90000),
    ];

    expect(() => assertBalanced(lines)).toThrow("Journal is not balanced");
  });

  it("journalizes sales with revenue, receivable, cogs, and inventory relief", () => {
    const entry = buildSalesJournal({
      date: "2026-06-05",
      revenueAmount: 1000000,
      cashReceived: 600000,
      receivableAmount: 400000,
      cogs: 350000,
      inventoryCost: 350000,
    });

    expect(sumDebits(entry.lines)).toBe(sumCredits(entry.lines));
    expect(entry.lines.find((line) => line.accountCode === accountCodes.cogs)?.debit).toBe(350000);
    expect(entry.lines.find((line) => line.accountCode === accountCodes.inventory)?.credit).toBe(350000);
  });

  it("keeps payroll credits equal to gross payroll cost", () => {
    const entry = buildPayrollJournal({
      date: "2026-06-25",
      grossPay: 5000000,
      netCashPaid: 4400000,
      salaryPayable: 300000,
      taxWithheld: 300000,
    });

    expect(sumDebits(entry.lines)).toBe(5000000);
    expect(sumCredits(entry.lines)).toBe(5000000);
  });

  it("reverses entries by swapping debit and credit", () => {
    const expense = buildExpenseJournal({
      date: "2026-06-08",
      amount: 100000,
      paidAmount: 100000,
    });
    const reversal = reverseJournalEntry(expense, "2026-06-09");

    expect(reversal.source).toBe("reversal");
    expect(reversal.lines[0].credit).toBe(expense.lines[0].debit);
    expect(sumDebits(reversal.lines)).toBe(sumCredits(reversal.lines));
  });

  it("blocks direct posting into locked periods", () => {
    const expense = buildExpenseJournal({
      date: "2026-06-08",
      amount: 100000,
      paidAmount: 100000,
    });

    expect(() =>
      postJournalEntry(expense, {
        lockedPeriods: [
          {
            label: "Juni 2026",
            startDate: "2026-06-01",
            endDate: "2026-06-30",
            locked: true,
          },
        ],
      }),
    ).toThrow("locked");
  });
});
