import { describe, expect, it } from "vitest";
import type { Product, ProductStructure } from "@/lib/erp/types";
import type { StockMovement } from "@/lib/domain/types";
import { buildMrpRecommendations, calculateProductUnitCost, explodeProductStructure } from "@/lib/erp/industry-workflows";

function product(overrides: Partial<Product> & Pick<Product, "id" | "sku" | "name" | "purchasePrice">): Product {
  return {
    businessId: "biz",
    unit: "unit",
    trackStock: true,
    defaultWarehouseId: "wh",
    productType: "stock_item",
    industryItemType: "retail_sku",
    fulfillmentMethod: "buy_stock",
    category: "Umum",
    sellingPrice: 0,
    reorderPoint: 0,
    safetyStock: 0,
    minimumOrderQty: 0,
    leadTimeDays: 0,
    productionLeadTimeDays: 0,
    makeOrBuy: "buy",
    isSellable: true,
    isPurchasable: true,
    isActive: true,
    ...overrides,
  };
}

describe("industry workflows", () => {
  it("calculates recipe unit cost with yield and waste", () => {
    const products = [
      product({ id: "menu", sku: "M-1", name: "Menu", purchasePrice: 0, fulfillmentMethod: "recipe_on_sale", makeOrBuy: "make" }),
      product({ id: "beef", sku: "BEEF", name: "Beef", purchasePrice: 100_000 }),
      product({ id: "rice", sku: "RICE", name: "Rice", purchasePrice: 10_000 }),
    ];
    const structures: ProductStructure[] = [{
      id: "recipe",
      businessId: "biz",
      parentProductId: "menu",
      type: "recipe",
      outputQuantity: 1,
      yieldPercent: 95,
      isActive: true,
      lines: [
        { id: "l1", businessId: "biz", structureId: "recipe", componentProductId: "beef", quantity: 0.1, wastePercent: 5, unitCostSnapshot: 100_000 },
        { id: "l2", businessId: "biz", structureId: "recipe", componentProductId: "rice", quantity: 0.2, wastePercent: 0, unitCostSnapshot: 10_000 },
      ],
    }];

    expect(Math.round(calculateProductUnitCost(products[0], products, structures))).toBe(13_158);
  });

  it("explodes product demand into component requirements", () => {
    const products = [
      product({ id: "menu", sku: "M-1", name: "Menu", purchasePrice: 0, fulfillmentMethod: "recipe_on_sale", makeOrBuy: "make" }),
      product({ id: "beef", sku: "BEEF", name: "Beef", purchasePrice: 100_000 }),
    ];
    const structures: ProductStructure[] = [{
      id: "recipe",
      businessId: "biz",
      parentProductId: "menu",
      type: "recipe",
      outputQuantity: 1,
      yieldPercent: 100,
      isActive: true,
      lines: [{ id: "l1", businessId: "biz", structureId: "recipe", componentProductId: "beef", quantity: 0.12, wastePercent: 5, unitCostSnapshot: 100_000 }],
    }];

    expect(explodeProductStructure("menu", 10, products, structures).get("beef")).toBeCloseTo(1.26);
  });

  it("builds purchase and production MRP recommendations from forecast and stock", () => {
    const products = [
      product({ id: "menu", sku: "M-1", name: "Menu", purchasePrice: 0, fulfillmentMethod: "make_to_stock", makeOrBuy: "make", productionLeadTimeDays: 2 }),
      product({ id: "beef", sku: "BEEF", name: "Beef", purchasePrice: 100_000, safetyStock: 1, minimumOrderQty: 5, leadTimeDays: 3 }),
    ];
    const structures: ProductStructure[] = [{
      id: "bom",
      businessId: "biz",
      parentProductId: "menu",
      type: "bom",
      outputQuantity: 1,
      yieldPercent: 100,
      isActive: true,
      lines: [{ id: "l1", businessId: "biz", structureId: "bom", componentProductId: "beef", quantity: 0.5, wastePercent: 0, unitCostSnapshot: 100_000 }],
    }];
    const stockMovements: StockMovement[] = [{
      id: "sm",
      businessId: "biz",
      itemId: "beef",
      warehouseId: "wh",
      date: "2026-06-01",
      type: "purchase",
      quantity: 2,
      value: 200_000,
    }];

    const recommendations = buildMrpRecommendations({
      businessId: "biz",
      periodEnd: "2026-07-31",
      products,
      structures,
      stockMovements,
      forecasts: [{ productId: "menu", quantity: 10, periodEnd: "2026-07-31" }],
      nowIso: "2026-06-27T00:00:00.000Z",
    });

    expect(recommendations.some((item) => item.productId === "menu" && item.type === "production" && item.quantity === 10)).toBe(true);
    expect(recommendations.some((item) => item.productId === "beef" && item.type === "purchase" && item.quantity === 5)).toBe(true);
  });
});
