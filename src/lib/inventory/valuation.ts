import type { StockMovement } from "@/lib/domain/types";

export interface InventoryPosition {
  itemId: string;
  warehouseId: string;
  quantity: number;
  value: number;
  averageCost: number;
}

function movementKey(movement: StockMovement): string {
  return `${movement.itemId}:${movement.warehouseId}`;
}

export function valueInventory(
  movements: StockMovement[],
  options: { allowNegativeStock?: boolean } = {},
): InventoryPosition[] {
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  const positions = new Map<string, InventoryPosition>();

  for (const movement of sorted) {
    const key = movementKey(movement);
    const current =
      positions.get(key) ??
      ({
        itemId: movement.itemId,
        warehouseId: movement.warehouseId,
        quantity: 0,
        value: 0,
        averageCost: 0,
      } satisfies InventoryPosition);

    const isIncoming =
      movement.type === "purchase" ||
      movement.type === "transfer_in" ||
      movement.type === "adjustment_in";

    if (isIncoming) {
      current.quantity += movement.quantity;
      current.value += movement.value;
      current.averageCost = current.quantity > 0 ? current.value / current.quantity : 0;
    } else {
      const outgoingValue = movement.value > 0 ? movement.value : current.averageCost * movement.quantity;
      current.quantity -= movement.quantity;
      current.value -= outgoingValue;
      current.averageCost = current.quantity > 0 ? current.value / current.quantity : 0;
    }

    if (!options.allowNegativeStock && current.quantity < -0.0001) {
      throw new Error(
        `Negative stock for item ${movement.itemId} in warehouse ${movement.warehouseId} after movement ${movement.id}.`,
      );
    }

    positions.set(key, {
      ...current,
      quantity: Number(current.quantity.toFixed(4)),
      value: Math.round(current.value),
      averageCost: current.averageCost,
    });
  }

  return [...positions.values()];
}
