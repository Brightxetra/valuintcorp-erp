import { describe, expect, it } from "vitest";
import { assertBalanced } from "@/lib/accounting/engine";
import {
  buildSummaryJournal,
  enabledModulesForTemplate,
  markRawTransactionStatuses,
  reconcileSummary,
  summarizeRawTransactions,
  validateRawTransactions,
} from "@/lib/erp/horizontal";
import type { RawTransaction } from "@/lib/erp/types";

function raw(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    id: overrides.id ?? "raw-1",
    businessId: overrides.businessId ?? "biz-1",
    locationId: overrides.locationId ?? "loc-1",
    batchId: overrides.batchId ?? "batch-1",
    source: overrides.source ?? "pos_csv",
    externalId: overrides.externalId ?? "POS-1",
    transactionDate: overrides.transactionDate ?? "2026-06-14",
    status: overrides.status ?? "uploaded",
    grossAmount: overrides.grossAmount ?? 100_000,
    discountAmount: overrides.discountAmount ?? 0,
    netAmount: overrides.netAmount ?? 100_000,
    taxAmount: overrides.taxAmount ?? 0,
    paymentMethod: overrides.paymentMethod ?? "qris",
    customerName: overrides.customerName,
    createdAt: overrides.createdAt ?? "2026-06-14T10:00:00.000Z",
  };
}

describe("horizontal ERP scale layer", () => {
  it("applies industry templates as module flags", () => {
    expect(enabledModulesForTemplate("food_beverage")).toEqual(
      expect.arrayContaining(["dashboard", "sales", "inventory", "imports", "locations", "tax"]),
    );
    expect(enabledModulesForTemplate("service")).not.toContain("inventory");
  });

  it("marks duplicate raw transactions by idempotency key", () => {
    const existing = [raw()];
    const incoming = [raw({ id: "raw-2" }), raw({ id: "raw-3", externalId: "POS-2" })];
    const result = markRawTransactionStatuses(existing, incoming);

    expect(result[0].status).toBe("duplicate");
    expect(result[1].status).toBe("uploaded");
  });

  it("validates and summarizes raw transactions per business, location, source, and date", () => {
    const transactions = validateRawTransactions([
      raw({ id: "raw-1", externalId: "POS-1", grossAmount: 100_000, netAmount: 100_000 }),
      raw({ id: "raw-2", externalId: "POS-2", grossAmount: 70_000, discountAmount: 5_000, netAmount: 65_000, paymentMethod: "cash" }),
      raw({ id: "raw-3", externalId: "POS-3", grossAmount: 50_000, netAmount: 55_000 }),
    ]);
    const summaries = summarizeRawTransactions(transactions);

    expect(transactions.map((transaction) => transaction.status)).toEqual(["validated", "validated", "failed"]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].transactionCount).toBe(2);
    expect(summaries[0].netAmount).toBe(165_000);
    expect(summaries[0].paymentBreakdown).toMatchObject({ qris: 100_000, cash: 65_000 });
  });

  it("builds balanced summary journals and reconciles raw totals", () => {
    const transactions = validateRawTransactions([
      raw({ id: "raw-1", externalId: "POS-1", grossAmount: 100_000, netAmount: 100_000 }),
      raw({ id: "raw-2", externalId: "POS-2", grossAmount: 70_000, discountAmount: 5_000, netAmount: 65_000 }),
    ]);
    const [summary] = summarizeRawTransactions(transactions);
    const journal = buildSummaryJournal(summary);
    const reconciliation = reconcileSummary({ summary, rawTransactions: transactions });

    expect(() => assertBalanced(journal.lines)).not.toThrow();
    expect(journal.source).toBe("csv_import");
    expect(reconciliation.rawMatchesSummary).toBe(true);
  });
});
