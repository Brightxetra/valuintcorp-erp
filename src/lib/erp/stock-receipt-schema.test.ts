import { describe, expect, it } from "vitest";
import { createStockReceiptSchema } from "@/lib/erp/schemas";

const validReceipt = {
  itemId: "item-rendang",
  warehouseId: "warehouse-main",
  quantity: 2,
  unitCost: 12_500,
  date: "2026-07-19",
  memo: "  Penerimaan manual  ",
};

describe("stock receipt input schema", () => {
  it("normalizes an optional memo without breaking non-UUID demo identifiers", () => {
    expect(createStockReceiptSchema.parse(validReceipt)).toEqual({
      ...validReceipt,
      memo: "Penerimaan manual",
    });

    expect(
      createStockReceiptSchema.parse({ ...validReceipt, memo: "" }).memo,
    ).toBeUndefined();
  });

  it("rejects calendar-invalid dates and overlong memos", () => {
    expect(
      createStockReceiptSchema.safeParse({ ...validReceipt, date: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      createStockReceiptSchema.safeParse({ ...validReceipt, memo: "x".repeat(501) }).success,
    ).toBe(false);
  });

  it.each([
    { quantity: 0 },
    { quantity: 0.00004 },
    { quantity: -1 },
    { quantity: 100_000_000_000_000 },
    { quantity: 900_719_925_474.0993 },
    { quantity: 900_719_925_474.0987 },
    { quantity: 549_755_813_888 },
    { unitCost: -1 },
    { unitCost: 1.5 },
    { unitCost: Number.MAX_SAFE_INTEGER + 1 },
    { quantity: 2, unitCost: 5_000_000_000_000_000 },
  ])("rejects unsafe numeric input %o", (override) => {
    expect(
      createStockReceiptSchema.safeParse({ ...validReceipt, ...override }).success,
    ).toBe(false);
  });

  it.each([
    { quantity: null },
    { quantity: true },
    { quantity: "2" },
    { quantity: [2] },
    { unitCost: null },
    { unitCost: false },
    { unitCost: "12500" },
    { unitCost: [12500] },
  ])("rejects non-numeric JSON values instead of coercing them %o", (override) => {
    expect(
      createStockReceiptSchema.safeParse({ ...validReceipt, ...override }).success,
    ).toBe(false);
  });

  it("keeps zero-cost receipts compatible with the legacy accounting semantics", () => {
    expect(
      createStockReceiptSchema.safeParse({ ...validReceipt, unitCost: 0 }).success,
    ).toBe(true);
  });
});
