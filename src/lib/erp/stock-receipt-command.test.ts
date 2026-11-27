import { describe, expect, it } from "vitest";
import { createDemoErpWorkspace } from "@/lib/erp/demo-workspace";
import {
  stockReceiptApiResponseSchema,
  stockReceiptCommandResultSchema,
  upsertStockReceiptMovement,
} from "@/lib/erp/stock-receipt-command";

const movement = {
  id: "60000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  itemId: "30000000-0000-4000-8000-000000000001",
  warehouseId: "40000000-0000-4000-8000-000000000001",
  date: "2026-07-19",
  type: "purchase" as const,
  quantity: 2,
  value: 25_000,
  memo: "Penerimaan manual",
};

const createdResult = {
  movementId: movement.id,
  created: true,
  replayed: false,
  movement,
};

describe("stock receipt command response", () => {
  it("accepts one authoritative created or replayed movement", () => {
    expect(stockReceiptCommandResultSchema.parse(createdResult)).toEqual(
      createdResult,
    );
    expect(
      stockReceiptCommandResultSchema.parse({
        ...createdResult,
        created: false,
        replayed: true,
      }),
    ).toEqual({ ...createdResult, created: false, replayed: true });
  });

  it.each([
    null,
    {},
    { ...createdResult, movement: undefined },
    { ...createdResult, created: true, replayed: true },
    { ...createdResult, created: false, replayed: false },
    {
      ...createdResult,
      movementId: "70000000-0000-4000-8000-000000000001",
    },
    {
      ...createdResult,
      movement: { ...movement, type: "adjustment_in" },
    },
  ])("rejects a null, malformed, or internally inconsistent response %#", (value) => {
    expect(stockReceiptApiResponseSchema.safeParse(value).success).toBe(false);
  });

  it("accepts the existing demo workspace envelope", () => {
    expect(
      stockReceiptApiResponseSchema.safeParse({
        workspace: createDemoErpWorkspace(),
      }).success,
    ).toBe(true);
  });

  it("upserts an authoritative replay instead of duplicating it", () => {
    const appended = upsertStockReceiptMovement([], movement);
    const replaced = upsertStockReceiptMovement(appended, {
      ...movement,
      memo: "Canonical replay",
    });

    expect(appended).toEqual([movement]);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.memo).toBe("Canonical replay");
  });
});
