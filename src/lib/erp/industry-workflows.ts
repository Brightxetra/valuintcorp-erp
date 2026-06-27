import type {
  DemandForecast,
  FulfillmentMethod,
  MakeOrBuy,
  MrpRecommendation,
  Product,
  ProductStructure,
} from "@/lib/erp/types";
import type { StockMovement } from "@/lib/domain/types";
import { valueInventory } from "@/lib/inventory/valuation";

export function productIndustryDefaults(industry: string): {
  industryItemType: Product["industryItemType"];
  fulfillmentMethod: FulfillmentMethod;
  makeOrBuy: MakeOrBuy;
  productType: Product["productType"];
  unit: string;
} {
  if (industry === "food_beverage") {
    return {
      industryItemType: "menu_item",
      fulfillmentMethod: "recipe_on_sale",
      makeOrBuy: "make",
      productType: "stock_item",
      unit: "porsi",
    };
  }

  if (industry === "manufacturing") {
    return {
      industryItemType: "finished_good",
      fulfillmentMethod: "make_to_stock",
      makeOrBuy: "make",
      productType: "stock_item",
      unit: "unit",
    };
  }

  if (industry === "service") {
    return {
      industryItemType: "service_item",
      fulfillmentMethod: "non_stock",
      makeOrBuy: "buy",
      productType: "service",
      unit: "paket",
    };
  }

  return {
    industryItemType: "retail_sku",
    fulfillmentMethod: "buy_stock",
    makeOrBuy: "buy",
    productType: "stock_item",
    unit: "pcs",
  };
}

export function activeStructureForProduct(
  productId: string,
  structures: ProductStructure[],
): ProductStructure | undefined {
  return structures.find((structure) => structure.parentProductId === productId && structure.isActive);
}

export function calculateProductUnitCost(
  product: Product,
  products: Product[],
  structures: ProductStructure[],
  visited = new Set<string>(),
): number {
  const structure = activeStructureForProduct(product.id, structures);

  if (!structure) return product.trackStock ? product.purchasePrice : 0;
  if (visited.has(product.id)) return product.purchasePrice;

  const nextVisited = new Set(visited).add(product.id);
  const outputQuantity = Math.max(structure.outputQuantity, 1);
  const yieldFactor = Math.max(structure.yieldPercent, 1) / 100;
  const componentCost = structure.lines.reduce((total, line) => {
    const component = products.find((item) => item.id === line.componentProductId);
    const unitCost = component
      ? calculateProductUnitCost(component, products, structures, nextVisited)
      : line.unitCostSnapshot;
    const wasteFactor = 1 + line.wastePercent / 100;
    return total + line.quantity * wasteFactor * unitCost;
  }, 0);

  return componentCost / outputQuantity / yieldFactor;
}

export function explodeProductStructure(
  productId: string,
  quantity: number,
  products: Product[],
  structures: ProductStructure[],
  visited = new Set<string>(),
): Map<string, number> {
  const output = new Map<string, number>();
  const structure = activeStructureForProduct(productId, structures);

  if (!structure || visited.has(productId)) {
    output.set(productId, (output.get(productId) ?? 0) + quantity);
    return output;
  }

  const nextVisited = new Set(visited).add(productId);
  const multiplier = quantity / Math.max(structure.outputQuantity, 1) / (Math.max(structure.yieldPercent, 1) / 100);

  for (const line of structure.lines) {
    const component = products.find((item) => item.id === line.componentProductId);
    const requiredQuantity = line.quantity * (1 + line.wastePercent / 100) * multiplier;
    const shouldExplode =
      component &&
      ["make_to_stock", "make_to_order", "recipe_on_sale"].includes(component.fulfillmentMethod) &&
      activeStructureForProduct(component.id, structures);

    const childRequirements = shouldExplode
      ? explodeProductStructure(component.id, requiredQuantity, products, structures, nextVisited)
      : new Map([[line.componentProductId, requiredQuantity]]);

    for (const [componentId, componentQuantity] of childRequirements) {
      output.set(componentId, (output.get(componentId) ?? 0) + componentQuantity);
    }
  }

  return output;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function availableQuantity(productId: string, movements: StockMovement[]) {
  return valueInventory(movements)
    .filter((position) => position.itemId === productId)
    .reduce((total, position) => total + position.quantity, 0);
}

export function buildMrpRecommendations(input: {
  businessId: string;
  periodEnd: string;
  products: Product[];
  structures: ProductStructure[];
  stockMovements: StockMovement[];
  forecasts: Pick<DemandForecast, "productId" | "quantity" | "periodEnd">[];
  mrpRunId?: string;
  nowIso?: string;
}): MrpRecommendation[] {
  const demand = new Map<string, number>();

  for (const forecast of input.forecasts) {
    const product = input.products.find((item) => item.id === forecast.productId);
    if (!product) continue;

    if (["make_to_stock", "make_to_order", "recipe_on_sale"].includes(product.fulfillmentMethod)) {
      demand.set(product.id, (demand.get(product.id) ?? 0) + forecast.quantity);
      const exploded = explodeProductStructure(product.id, forecast.quantity, input.products, input.structures);
      for (const [componentId, quantity] of exploded) {
        demand.set(componentId, (demand.get(componentId) ?? 0) + quantity);
      }
    } else {
      demand.set(product.id, (demand.get(product.id) ?? 0) + forecast.quantity);
    }
  }

  const createdAt = input.nowIso ?? new Date().toISOString();
  const recommendations: MrpRecommendation[] = [];

  for (const [productId, grossDemand] of demand.entries()) {
    const product = input.products.find((item) => item.id === productId);
    if (!product || product.isActive === false) continue;

    const onHand = availableQuantity(product.id, input.stockMovements);
    const target = grossDemand + product.safetyStock;
    const shortfall = Math.max(target - onHand, 0);
    const quantity = Math.max(shortfall, product.minimumOrderQty || shortfall);

    if (quantity <= 0) continue;

    const leadDays =
      product.makeOrBuy === "make" || product.fulfillmentMethod.startsWith("make")
        ? product.productionLeadTimeDays
        : product.leadTimeDays;

    recommendations.push({
      id: `mrp-rec-${product.id}-${createdAt}`,
      businessId: input.businessId,
      mrpRunId: input.mrpRunId,
      productId: product.id,
      type: product.makeOrBuy === "make" || product.fulfillmentMethod.startsWith("make") ? "production" : "purchase",
      quantity,
      dueDate: addDays(input.periodEnd, -leadDays),
      sourceDemand: `Demand ${grossDemand}`,
      status: "planned",
      createdAt,
    });
  }

  return recommendations;
}
