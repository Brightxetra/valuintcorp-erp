import { afterEach, describe, expect, it } from "vitest";
import {
  createDemoBranchExpense,
  createIdempotentDemoStockReceipt,
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

  it("replays the same demo stock receipt key without adding another movement", () => {
    const input = {
      itemId: "item-beef",
      warehouseId: "wh-kitchen",
      quantity: 2,
      unitCost: 125_000,
      date: "2026-07-19",
      memo: "Restock demo",
    };
    const created = createIdempotentDemoStockReceipt(input, "operation-a");
    const replayed = createIdempotentDemoStockReceipt(input, "operation-a");

    expect(created.created).toBe(true);
    expect(replayed.replayed).toBe(true);
    expect(replayed.conflict).toBe(false);
    expect(replayed.workspace.stockMovements).toHaveLength(
      created.workspace.stockMovements.length,
    );
  });

  it("rejects reuse of a demo operation key for another receipt", () => {
    const input = {
      itemId: "item-beef",
      warehouseId: "wh-kitchen",
      quantity: 2,
      unitCost: 125_000,
      date: "2026-07-19",
      memo: "Restock demo",
    };

    createIdempotentDemoStockReceipt(input, "operation-a");
    const conflict = createIdempotentDemoStockReceipt(
      { ...input, quantity: 3 },
      "operation-a",
    );

    expect(conflict.created).toBe(false);
    expect(conflict.replayed).toBe(false);
    expect(conflict.conflict).toBe(true);
  });

  it("uses the same canonical quantity and default memo as production replay", () => {
    const input = {
      itemId: "item-beef",
      warehouseId: "wh-kitchen",
      quantity: 2.00001,
      unitCost: 125_000,
      date: "2026-07-19",
    };

    const created = createIdempotentDemoStockReceipt(input, "operation-a");
    const replayed = createIdempotentDemoStockReceipt(
      {
        ...input,
        quantity: 2,
        memo: "Stok masuk manual",
      },
      "operation-a",
    );
    const movement = created.workspace.stockMovements.at(-1);

    expect(movement).toMatchObject({
      quantity: 2,
      value: 250_000,
      memo: "Stok masuk manual",
    });
    expect(replayed.replayed).toBe(true);
    expect(replayed.conflict).toBe(false);
    expect(replayed.workspace.stockMovements).toHaveLength(
      created.workspace.stockMovements.length,
    );
  });

  it("matches PostgreSQL rounding on an exact half-step quantity", () => {
    const created = createIdempotentDemoStockReceipt(
      {
        itemId: "item-beef",
        warehouseId: "wh-kitchen",
        quantity: 2.00085,
        unitCost: 125_000,
        date: "2026-07-19",
      },
      "operation-half-step",
    );
    const movement = created.workspace.stockMovements.at(-1);

    expect(movement).toMatchObject({
      quantity: 2.0009,
      value: 250_112.5,
    });
  });
});
