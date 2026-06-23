"use client";

import { useState } from "react";
import { useErpWorkspace } from "@/components/erp-context";
import { MobileDialog as Modal } from "@/components/mobile-dialog";
import { PageHeader } from "@/components/ui";
import {
  Plus,
  Package,
  Search,
  ChevronRight,
  Boxes,
  ArrowRight,
  AlertTriangle,
  Filter,
} from "lucide-react";
import type { ErpWorkspace } from "@/lib/erp/types";
import { valueInventory } from "@/lib/inventory/valuation";
import { notify } from "@/lib/notify";

// ============================================================================
// TYPES
// ============================================================================

interface StockAlert {
  productId: string;
  productName: string;
  sku: string;
  currentQty: number;
  reorderPoint: number;
  status: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ============================================================================
// MODAL
// ============================================================================

// ============================================================================
// FORM FIELD
// ============================================================================

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StokWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request } = useErpWorkspace(initialWorkspace);
  const [searchQuery, setSearchQuery] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Calculate stock positions
  const positions = valueInventory(workspace.stockMovements);

  // Generate alerts
  const alerts: StockAlert[] = workspace.products
    .filter((p) => p.trackStock)
    .map((product) => {
      const totalQty = positions
        .filter((pos) => pos.itemId === product.id)
        .reduce((sum, pos) => sum + pos.quantity, 0);
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentQty: totalQty,
        reorderPoint: product.reorderPoint,
        status: totalQty <= 0 ? "critical" : totalQty <= product.reorderPoint ? "low" : "ok",
      };
    })
    .filter((alert) => alert.status !== "ok");

  // Filter positions
  const filteredPositions = positions.filter((pos) => {
    const product = workspace.products.find((p) => p.id === pos.itemId);

    const matchesSearch =
      searchQuery === "" ||
      product?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product?.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesWarehouse = warehouseFilter === "all" || pos.warehouseId === warehouseFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "low" && product && product.reorderPoint >= pos.quantity);

    return matchesSearch && matchesWarehouse && matchesStatus;
  });

  // Calculate totals
  const totalNilaiStok = positions.reduce((sum, pos) => sum + pos.value, 0);
  const totalSKU = new Set(positions.map((pos) => pos.itemId)).size;
  const alertCount = alerts.length;

  const [stockReceipt, setStockReceipt] = useState({
    itemId: "",
    warehouseId: workspace.warehouses[0]?.id || "",
    quantity: 1,
    unitCost: 0,
    memo: "",
    date: new Date().toISOString().split("T")[0],
  });

  // New adjustment form state
  const [newAdjustment, setNewAdjustment] = useState({
    itemId: "",
    warehouseId: workspace.warehouses[0]?.id || "",
    quantity: 0,
    value: 0,
    reason: "",
    date: new Date().toISOString().split("T")[0],
  });

  // Transfer form state
  const [transfer, setTransfer] = useState({
    itemId: "",
    fromWarehouseId: workspace.warehouses[0]?.id || "",
    toWarehouseId: workspace.warehouses[1]?.id || workspace.warehouses[0]?.id || "",
    quantity: 1,
    date: new Date().toISOString().split("T")[0],
  });

  function handleReceiptChange(field: string, value: string | number) {
    setStockReceipt((prev) => ({ ...prev, [field]: value }));
  }

  function handleAdjustmentChange(field: string, value: string | number) {
    setNewAdjustment((prev) => ({ ...prev, [field]: value }));
  }

  function handleTransferChange(field: string, value: string | number) {
    setTransfer((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreateAdjustment() {
    setLoading(true);

    try {
      const data = await request<{ workspace: ErpWorkspace }>("/api/erp/stock-adjustments", {
        method: "POST",
        body: JSON.stringify(newAdjustment),
      });

      setWorkspace(data.workspace);
      notify.success("Penyesuaian stok disimpan", { description: newAdjustment.reason });
      setShowNewModal(false);
    } catch (err) {
      notify.error("Penyesuaian stok gagal", { description: err instanceof Error ? err.message : "Terjadi kesalahan" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateReceipt() {
    setLoading(true);

    try {
      const data = await request<{ workspace: ErpWorkspace }>("/api/erp/stock-receipts", {
        method: "POST",
        body: JSON.stringify(stockReceipt),
      });

      setWorkspace(data.workspace);
      const product = workspace.products.find((item) => item.id === stockReceipt.itemId);
      notify.success("Stok masuk dicatat", { description: product ? product.sku + " +" + stockReceipt.quantity : undefined });
      setShowReceiptModal(false);
      setStockReceipt((prev) => ({ ...prev, quantity: 1, unitCost: 0, memo: "" }));
    } catch (err) {
      notify.error("Stok masuk gagal", { description: err instanceof Error ? err.message : "Terjadi kesalahan" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTransfer() {
    setLoading(true);

    try {
      const data = await request<{ workspace: ErpWorkspace }>("/api/erp/stock-transfers", {
        method: "POST",
        body: JSON.stringify(transfer),
      });

      setWorkspace(data.workspace);
      notify.success("Transfer stok disimpan");
      setShowTransferModal(false);
    } catch (err) {
      notify.error("Transfer stok gagal", { description: err instanceof Error ? err.message : "Terjadi kesalahan" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Stok & Persediaan"
        description="Kelola stok barang, penyesuaian, dan transfer antar gudang"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowReceiptModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              <Plus className="size-4" />
              Stok Masuk
            </button>
            <button
              onClick={() => setShowTransferModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
            >
              <ArrowRight className="size-4" />
              Transfer
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <Plus className="size-4" />
              Penyesuaian Stok
            </button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Nilai Stok</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(totalNilaiStok)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Package className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">SKU Aktif</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{totalSKU}</p>
            </div>
            <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
              <Boxes className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Lokasi/Gudang</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{workspace.warehouses.length}</p>
            </div>
            <div className="rounded-xl bg-cyan-50 p-3 text-cyan-600">
              <Filter className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Perlu Attention</p>
              <p className="mt-2 text-2xl font-bold text-red-600">{alertCount}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-red-600">
              <AlertTriangle className="size-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="size-5 text-amber-600" />
            <p className="font-semibold text-amber-800">Peringatan Stok Rendah</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.slice(0, 6).map((alert) => (
              <div key={alert.productId} className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{alert.productName}</p>
                  <p className="text-xs text-gray-500">{alert.sku}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${alert.status === "critical" ? "text-red-600" : "text-amber-600"}`}>
                    {alert.currentQty}
                  </p>
                  <p className="text-xs text-gray-500">min: {alert.reorderPoint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari SKU atau nama produk..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            <option value="all">Semua Gudang</option>
            {workspace.warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>{wh.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            <option value="all">Semua Status</option>
            <option value="low">Rendah</option>
            <option value="ok">Normal</option>
          </select>
        </div>
      </div>


      {/* Stock List */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="mobile-card-table w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">Gudang</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Avg Cost</th>
                <th className="px-4 py-3 text-right">Nilai</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredPositions.length === 0 ? (
                <tr>
                  <td colSpan={7} data-mobile-label="" className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Package className="size-12 text-gray-300" />
                      <p>Belum ada data stok</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPositions.map((pos) => {
                  const product = workspace.products.find((p) => p.id === pos.itemId);
                  const warehouse = workspace.warehouses.find((w) => w.id === pos.warehouseId);
                  const isLow = product && product.reorderPoint >= pos.quantity;

                  return (
                    <tr key={`${pos.itemId}-${pos.warehouseId}`} className="hover:bg-gray-50">
                      <td data-mobile-label="SKU" className="px-4 py-3">
                        <p className="font-mono text-sm font-semibold text-gray-900">{product?.sku || "-"}</p>
                      </td>
                      <td data-mobile-label="Produk" className="px-4 py-3">
                        <p className="font-medium text-gray-900">{product?.name || "-"}</p>
                        <p className="text-xs text-gray-500">{product?.unit || "pcs"}</p>
                      </td>
                      <td data-mobile-label="Gudang" className="px-4 py-3 text-sm text-gray-600">
                        {warehouse?.name || "-"}
                      </td>
                      <td data-mobile-label="Qty" className={`px-4 py-3 text-right font-semibold ${isLow ? "text-amber-600" : "text-gray-900"}`}>
                        {pos.quantity}
                        {isLow && <AlertTriangle className="inline size-3 ml-1 text-amber-500" />}
                      </td>
                      <td data-mobile-label="Biaya rata-rata" className="px-4 py-3 text-right text-gray-600">
                        {formatCurrency(pos.averageCost)}
                      </td>
                      <td data-mobile-label="Nilai" className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(pos.value)}
                      </td>
                      <td data-mobile-label="Aksi" className="px-4 py-3 text-center">
                        <button className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100">
                          <ChevronRight className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Receipt Modal */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title="Stok Masuk"
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Gunakan ini untuk mencatat stok fisik masuk tanpa membuat tagihan supplier. Jika pembelian perlu hutang dan jurnal AP, gunakan menu Bill.</p>
          <FormField label="Produk">
            <select
              value={stockReceipt.itemId}
              onChange={(e) => handleReceiptChange("itemId", e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Pilih Produk</option>
              {workspace.products.filter((p) => p.trackStock && p.isPurchasable !== false && p.isActive !== false).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.name}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Gudang tujuan">
              <select
                value={stockReceipt.warehouseId}
                onChange={(e) => handleReceiptChange("warehouseId", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {workspace.warehouses.filter((wh) => wh.isActive).map((wh) => (
                  <option key={wh.id} value={wh.id}>{wh.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Tanggal">
              <input
                type="date"
                value={stockReceipt.date}
                onChange={(e) => handleReceiptChange("date", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Qty masuk">
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                value={stockReceipt.quantity}
                onChange={(e) => handleReceiptChange("quantity", Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </FormField>
            <FormField label="Biaya per unit">
              <input
                type="number"
                min="0"
                value={stockReceipt.unitCost}
                onChange={(e) => handleReceiptChange("unitCost", Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </FormField>
          </div>

          <FormField label="Catatan">
            <input
              value={stockReceipt.memo}
              onChange={(e) => handleReceiptChange("memo", e.target.value)}
              placeholder="Contoh: stok awal, restock manual, koreksi pembelian"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </FormField>

          <div className="flex gap-3 pt-4">
            <button onClick={() => setShowReceiptModal(false)} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Batal</button>
            <button onClick={handleCreateReceipt} disabled={loading || !stockReceipt.itemId || !stockReceipt.warehouseId || stockReceipt.quantity <= 0} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{loading ? "Memproses..." : "Catat Stok Masuk"}</button>
          </div>
        </div>
      </Modal>

      {/* New Adjustment Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Penyesuaian Stok"
      >
        <div className="space-y-4">
          <FormField label="Produk">
            <select
              value={newAdjustment.itemId}
              onChange={(e) => handleAdjustmentChange("itemId", e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Pilih Produk</option>
              {workspace.products.filter((p) => p.trackStock).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.name}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Gudang">
              <select
                value={newAdjustment.warehouseId}
                onChange={(e) => handleAdjustmentChange("warehouseId", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {workspace.warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>{wh.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Tanggal">
              <input
                type="date"
                value={newAdjustment.date}
                onChange={(e) => handleAdjustmentChange("date", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Qty Koreksi (negatif = kurang)">
              <input
                type="number"
                value={newAdjustment.quantity}
                onChange={(e) => handleAdjustmentChange("quantity", parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Contoh: -5 untuk kurang 5"
              />
            </FormField>
            <FormField label="Nilai per Unit">
              <input
                type="number"
                value={newAdjustment.value}
                onChange={(e) => handleAdjustmentChange("value", parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </FormField>
          </div>

          <FormField label="Alasan">
            <select
              value={newAdjustment.reason}
              onChange={(e) => handleAdjustmentChange("reason", e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Pilih Alasan</option>
              <option value="stock_opname">Stock Opname</option>
              <option value="damage">Barang Rusak</option>
              <option value="expired">Barang Kadaluarsa</option>
              <option value="correction">Koreksi Pencatatan</option>
              <option value="other">Lainnya</option>
            </select>
          </FormField>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowNewModal(false)}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={handleCreateAdjustment}
              disabled={loading || !newAdjustment.itemId}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Memproses..." : "Simpan Penyesuaian"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Transfer Antar Gudang"
      >
        <div className="space-y-4">
          <FormField label="Produk">
            <select
              value={transfer.itemId}
              onChange={(e) => handleTransferChange("itemId", e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Pilih Produk</option>
              {workspace.products.filter((p) => p.trackStock).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.name}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Dari Gudang">
              <select
                value={transfer.fromWarehouseId}
                onChange={(e) => handleTransferChange("fromWarehouseId", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {workspace.warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>{wh.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Ke Gudang">
              <select
                value={transfer.toWarehouseId}
                onChange={(e) => handleTransferChange("toWarehouseId", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {workspace.warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>{wh.name}</option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Qty Transfer">
              <input
                type="number"
                value={transfer.quantity}
                onChange={(e) => handleTransferChange("quantity", parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </FormField>
            <FormField label="Tanggal">
              <input
                type="date"
                value={transfer.date}
                onChange={(e) => handleTransferChange("date", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </FormField>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowTransferModal(false)}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={handleCreateTransfer}
              disabled={loading || !transfer.itemId || transfer.fromWarehouseId === transfer.toWarehouseId}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Memproses..." : "Transfer"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
