import { afterEach, describe, expect, it } from "vitest";
import {
  createDemoBranchExpense,
  getDemoBranchExpenses,
  resetDemoErpStore,
} from "@/lib/erp/demo-store";

describe("demo branch POS store", () => {
  afterEach(() => {
    resetDemoErpStore();
  });

  it("posts a branch expense to the operating-expense and cash ledgers", () => {
    const result = createDemoBranchExpense({
      locationId: "loc-kitchen",
      date: "2026-06-22",
      amount: 25_000,
      paymentMethod: "cash",
      category: "Transport",
      memo: "Antar pesanan",
    });

    expect(getDemoBranchExpenses("loc-kitchen", "2026-06-22")).toHaveLength(1);
    expect(result.workspace.journals[0].lines.map((line) => line.accountCode)).toEqual(["5100", "1000"]);
  });
});
