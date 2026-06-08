import { describe, expect, it } from "vitest";
import { transactionInputSchema } from "@/lib/validation/transaction-input";

describe("transaction input validation", () => {
  it("accepts a balanced sale preview payload", () => {
    const parsed = transactionInputSchema.safeParse({
      type: "sale",
      date: "2026-06-05",
      revenueAmount: 1000000,
      cashReceived: 600000,
      receivableAmount: 400000,
      cogs: 300000,
      inventoryCost: 300000,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects invalid dates and negative amounts", () => {
    const parsed = transactionInputSchema.safeParse({
      type: "expense",
      date: "01-06-2026",
      amount: -1000,
      paidAmount: 0,
    });

    expect(parsed.success).toBe(false);
  });
});
