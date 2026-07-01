import type { StockMovement } from "@/lib/domain/types";

export interface InventoryPosition {
  itemId: string;
  warehouseId: string;
  quantity: number;
  value: number;
  averageCost: number;
}

type InventoryAccumulator = InventoryPosition & {
  rawValue: number;
};

type InventoryValuationOptions = {
  allowNegativeStock?: boolean;
  validateStockValue?: boolean;
  clampNegativeValue?: boolean;
};

function movementKey(movement: StockMovement): string {
  return `${movement.itemId}:${movement.warehouseId}`;
}

export function valueInventory(
  movements: StockMovement[],
  options: InventoryValuationOptions = {},
): InventoryPosition[] {
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  const positions = new Map<string, InventoryAccumulator>();
  const clampNegativeValue = options.clampNegativeValue ?? true;

  for (const movement of sorted) {
    const key = movementKey(movement);
    const current =
      positions.get(key) ??
      ({
        itemId: movement.itemId,
        warehouseId: movement.warehouseId,
        quantity: 0,
        value: 0,
        rawValue: 0,
        averageCost: 0,
      } satisfies InventoryAccumulator);

    const isIncoming =
      movement.type === "purchase" ||
      movement.type === "transfer_in" ||
      movement.type === "adjustment_in";

    if (isIncoming) {
      current.quantity += movement.quantity;
      current.rawValue += movement.value;
      current.averageCost = current.quantity > 0 ? Math.max(current.rawValue, 0) / current.quantity : 0;
    } else {
      const outgoingValue = movement.value > 0 ? movement.value : current.averageCost * movement.quantity;
      current.quantity -= movement.quantity;
      current.rawValue -= outgoingValue;
      current.averageCost = current.quantity > 0 ? Math.max(current.rawValue, 0) / current.quantity : 0;
    }

    if (!options.allowNegativeStock && current.quantity < -0.0001) {
      throw new Error(
        `Negative stock for item ${movement.itemId} in warehouse ${movement.warehouseId} after movement ${movement.id}.`,
      );
    }

    if (options.validateStockValue && current.rawValue < -0.5) {
      throw new Error(
        `Negative stock value for item ${movement.itemId} in warehouse ${movement.warehouseId} after movement ${movement.id}.`,
      );
    }

    const roundedValue = Math.round(current.rawValue);
    const displayValue = clampNegativeValue ? Math.max(roundedValue, 0) : roundedValue;
    const displayAverageCost = current.quantity > 0 ? displayValue / current.quantity : 0;

    positions.set(key, {
      itemId: current.itemId,
      warehouseId: current.warehouseId,
      quantity: Number(current.quantity.toFixed(4)),
      value: displayValue,
      rawValue: current.rawValue,
      averageCost: displayAverageCost,
    });
  }

  return [...positions.values()].map((position) => ({
    itemId: position.itemId,
    warehouseId: position.warehouseId,
    quantity: position.quantity,
    value: position.value,
    averageCost: position.averageCost,
  }));
}
