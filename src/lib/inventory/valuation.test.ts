import { describe, expect, it } from "vitest";
import { valueInventory } from "@/lib/inventory/valuation";
import type { StockMovement } from "@/lib/domain/types";

describe("inventory valuation", () => {
  it("uses moving average value for outgoing stock when value is omitted", () => {
    const movements: StockMovement[] = [
      {
        id: "m1",
        businessId: "b1",
        itemId: "i1",
        warehouseId: "w1",
        date: "2026-06-01",
        type: "purchase",
        quantity: 10,
        value: 100000,
      },
      {
        id: "m2",
        businessId: "b1",
        itemId: "i1",
        warehouseId: "w1",
        date: "2026-06-02",
        type: "sale",
        quantity: 4,
        value: 0,
      },
    ];

    const [position] = valueInventory(movements);

    expect(position.quantity).toBe(6);
    expect(position.value).toBe(60000);
    expect(position.averageCost).toBe(10000);
  });

  it("rejects stock movements that would hide negative stock", () => {
    expect(() =>
      valueInventory([
        {
          id: "m1",
          businessId: "b1",
          itemId: "i1",
          warehouseId: "w1",
          date: "2026-06-02",
          type: "sale",
          quantity: 4,
          value: 0,
        },
      ]),
    ).toThrow("Negative stock");
  });

  it("can reject stock movements that would create negative stock value", () => {
    const movements: StockMovement[] = [
      {
        id: "m1",
        businessId: "b1",
        itemId: "i1",
        warehouseId: "w1",
        date: "2026-06-01",
        type: "purchase",
        quantity: 5,
        value: 25000,
      },
      {
        id: "m2",
        businessId: "b1",
        itemId: "i1",
        warehouseId: "w1",
        date: "2026-06-02",
        type: "sale",
        quantity: 1,
        value: 45000,
      },
    ];

    expect(() => valueInventory(movements, { validateStockValue: true })).toThrow("Negative stock value");
    expect(valueInventory(movements)[0]).toMatchObject({ quantity: 4, value: 0 });
  });
});
