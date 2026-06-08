"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import type { InventoryItem, StockMovement, Warehouse } from "@/lib/domain/types";
import { valueInventory } from "@/lib/inventory/valuation";
import { money } from "@/lib/format";

export function InventoryWorkbench({
  items,
  warehouses,
  initialMovements,
}: {
  items: InventoryItem[];
  warehouses: Warehouse[];
  initialMovements: StockMovement[];
}) {
  const [movements, setMovements] = useState(initialMovements);
  const positions = useMemo(() => valueInventory(movements), [movements]);

  function addMovement(formData: FormData) {
    const movement: StockMovement = {
      id: `local-stock-${Date.now()}`,
      businessId: "demo-business",
      itemId: String(formData.get("itemId")),
      warehouseId: String(formData.get("warehouseId")),
      date: String(formData.get("date")),
      type: String(formData.get("type")) as StockMovement["type"],
      quantity: Number(formData.get("quantity")),
      value: Number(formData.get("value")),
      memo: String(formData.get("memo") ?? ""),
    };

    setMovements((current) => [...current, movement]);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">Tambah pergerakan stok</h2>
        <p className="mt-1 text-sm text-gray-500">Form ini langsung menghitung ulang posisi moving average.</p>
        <form action={addMovement} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Item</span>
              <select name="itemId" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {items.map((item) => (
                  <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Gudang</span>
              <select name="warehouseId" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Tanggal</span>
              <input name="date" type="date" defaultValue="2026-06-28" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Tipe</span>
              <select name="type" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="purchase">Purchase</option>
                <option value="sale">Sale</option>
                <option value="transfer_in">Transfer in</option>
                <option value="transfer_out">Transfer out</option>
                <option value="adjustment_in">Adjustment in</option>
                <option value="adjustment_out">Adjustment out</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Qty</span>
              <input name="quantity" type="number" defaultValue={10} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Nilai</span>
              <input name="value" type="number" defaultValue={100000} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Memo</span>
            <input name="memo" defaultValue="Stock opname lokal" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
              <Plus className="size-4" aria-hidden />
              Tambah movement
            </button>
            <button
              type="button"
              onClick={() => setMovements(initialMovements)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium"
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">Posisi stok</h2>
        <div className="mt-4 space-y-3">
          {positions.map((position) => {
            const item = items.find((candidate) => candidate.id === position.itemId);
            const warehouse = warehouses.find((candidate) => candidate.id === position.warehouseId);

            return (
              <div key={`${position.itemId}-${position.warehouseId}`} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{item?.name}</p>
                    <p className="mt-1 text-sm text-gray-500">{item?.sku} - {warehouse?.name}</p>
                  </div>
                  <span className="rounded-lg bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
                    {position.quantity} {item?.unit}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <p className="rounded-lg bg-gray-50 p-3">Nilai {money(position.value)}</p>
                  <p className="rounded-lg bg-gray-50 p-3">Avg {money(position.averageCost)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2">
        <h2 className="text-lg font-semibold">Riwayat pergerakan</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Gudang</th>
                <th className="px-4 py-3 font-medium">Tipe</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...movements].reverse().map((movement) => (
                <tr key={movement.id}>
                  <td className="px-4 py-3 text-gray-500">{movement.date}</td>
                  <td className="px-4 py-3 font-medium">{items.find((item) => item.id === movement.itemId)?.name}</td>
                  <td className="px-4 py-3">{warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.name}</td>
                  <td className="px-4 py-3">{movement.type}</td>
                  <td className="px-4 py-3 text-right">{movement.quantity}</td>
                  <td className="px-4 py-3 text-right">{money(movement.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
