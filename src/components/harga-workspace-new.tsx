"use client";

import { useState, useMemo } from "react";
import { useErpWorkspace } from "@/components/erp-context";
import { PageHeader } from "@/components/ui";
import {
  Plus,
  FileText,
  Search,
  Check,
  AlertCircle,
  ChevronRight,
  X,
  DollarSign,
  Tag,
  Percent,
  Edit,
  Copy,
} from "lucide-react";
import { money } from "@/lib/format";
import type { ErpWorkspace } from "@/lib/erp/types";
import { valueInventory } from "@/lib/inventory/valuation";

// ============================================================================
// TYPES
// ============================================================================

interface PriceList {
  id: string;
  productId: string;
  price: number;
  type: "selling" | "purchase" | "special";
  validFrom?: string;
  validTo?: string;
  notes?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// ============================================================================
// MODAL
// ============================================================================

function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

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

export function HargaWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace } = useErpWorkspace(initialWorkspace);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get unique categories
  const categories = [...new Set(workspace.products.map((p) => p.category).filter(Boolean))];

  // Filter products
  const filteredProducts = workspace.products.filter((product) => {
    const matchesSearch =
      searchQuery === "" ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "sellable" && product.isSellable) ||
      (typeFilter === "purchasable" && product.isPurchasable) ||
      (typeFilter === "track_stock" && product.trackStock);

    return matchesSearch && matchesCategory && matchesType;
  });

  // Get stock positions (must be before statistics calculation)
  const positions = useMemo(() => {
    return valueInventory(workspace.stockMovements);
  }, [workspace.stockMovements]);

  // Calculate statistics
  const totalProduk = filteredProducts.length;
  const totalNilaiJual = filteredProducts.reduce((sum, p) => sum + (p.sellingPrice * (positions.find((pos) => pos.itemId === p.id)?.quantity || 0)), 0);
  const avgMargin = filteredProducts.length > 0
    ? filteredProducts.reduce((sum, p) => {
        const margin = p.sellingPrice > 0 ? ((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100 : 0;
        return sum + margin;
      }, 0) / filteredProducts.length
    : 0;

  // New price form state
  const [newPrice, setNewPrice] = useState({
    productId: "",
    price: 0,
    type: "selling" as "selling" | "purchase" | "special",
    validFrom: "",
    validTo: "",
    notes: "",
  });

  function handlePriceChange(field: string, value: string | number) {
    setNewPrice((prev) => ({ ...prev, [field]: value }));
  }

  async function handleUpdatePrice() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // In production, this would call an API
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSuccess("Harga berhasil diperbarui!");
      setShowNewModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  const selectedProduct = showDetailModal ? workspace.products.find((p) => p.id === showDetailModal) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Daftar Harga"
        description="Kelola harga jual, harga beli, dan harga khusus untuk setiap produk"
        action={
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <Plus className="size-4" />
            Update Harga
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Produk</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{totalProduk}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <FileText className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Kategori</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{categories.length}</p>
            </div>
            <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
              <Tag className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Harga Jual Tertinggi</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">
                {formatCurrency(Math.max(...workspace.products.map((p) => p.sellingPrice)))}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <DollarSign className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Margin</p>
              <p className="mt-2 text-2xl font-bold text-amber-600">{avgMargin.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
              <Percent className="size-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari produk atau SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            <option value="all">Semua Kategori</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            <option value="all">Semua Tipe</option>
            <option value="sellable">Dijual</option>
            <option value="purchasable">Dibeli</option>
            <option value="track_stock">Track Stok</option>
          </select>
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
          <Check className="size-5 text-emerald-600" />
          <p className="text-sm font-medium">{success}</p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 p-4 text-red-800">
          <AlertCircle className="size-5 text-red-600" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Product List */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Harga Jual</th>
                <th className="px-4 py-3 text-right">Harga Beli</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="size-12 text-gray-300" />
                      <p>Belum ada produk</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const margin = product.sellingPrice > 0
                    ? ((product.sellingPrice - product.purchasePrice) / product.sellingPrice) * 100
                    : 0;

                  return (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-mono text-sm font-semibold text-gray-900">{product.sku}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{product.name}</p>
                        <p className="text-xs text-gray-500">{product.unit}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                          {product.category || "Umum"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {formatCurrency(product.sellingPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatCurrency(product.purchasePrice)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${margin >= 20 ? "text-emerald-600" : margin >= 10 ? "text-amber-600" : "text-red-600"}`}>
                        {margin.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {product.isSellable && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Jual</span>
                          )}
                          {product.isPurchasable && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Beli</span>
                          )}
                          {product.trackStock && (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Stok</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setShowDetailModal(product.id)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                          >
                            <Edit className="size-4" />
                          </button>
                          <button className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
                            <Copy className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Update Price Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Update Harga Produk"
      >
        <div className="space-y-4">
          <FormField label="Produk">
            <select
              value={newPrice.productId}
              onChange={(e) => {
                const product = workspace.products.find((p) => p.id === e.target.value);
                handlePriceChange("productId", e.target.value);
                if (product) {
                  handlePriceChange("price", product.sellingPrice);
                }
              }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Pilih Produk</option>
              {workspace.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.name}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Tipe Harga">
              <select
                value={newPrice.type}
                onChange={(e) => handlePriceChange("type", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="selling">Harga Jual</option>
                <option value="purchase">Harga Beli</option>
                <option value="special">Harga Khusus</option>
              </select>
            </FormField>
            <FormField label="Harga Baru">
              <input
                type="number"
                value={newPrice.price}
                onChange={(e) => handlePriceChange("price", parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-lg font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Berlaku Dari (opsional)">
              <input
                type="date"
                value={newPrice.validFrom}
                onChange={(e) => handlePriceChange("validFrom", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </FormField>
            <FormField label="Berlaku Sampai (opsional)">
              <input
                type="date"
                value={newPrice.validTo}
                onChange={(e) => handlePriceChange("validTo", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </FormField>
          </div>

          <FormField label="Catatan (opsional)">
            <textarea
              value={newPrice.notes}
              onChange={(e) => handlePriceChange("notes", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              placeholder="Contoh: Promo akhir bulan"
            />
          </FormField>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowNewModal(false)}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={handleUpdatePrice}
              disabled={loading || !newPrice.productId || newPrice.price <= 0}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Memproses..." : "Update Harga"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!showDetailModal}
        onClose={() => setShowDetailModal(null)}
        title="Detail Produk"
      >
        {selectedProduct && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <div>
                <p className="text-sm text-gray-500">SKU</p>
                <p className="font-mono font-semibold text-gray-900">{selectedProduct.sku}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Unit</p>
                <p className="font-semibold text-gray-900">{selectedProduct.unit}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Nama Produk</span>
                <span className="font-medium">{selectedProduct.name}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Kategori</span>
                <span className="font-medium">{selectedProduct.category || "-"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Harga Jual</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(selectedProduct.sellingPrice)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Harga Beli</span>
                <span className="font-medium text-gray-900">{formatCurrency(selectedProduct.purchasePrice)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Margin</span>
                <span className="font-semibold text-amber-600">
                  {selectedProduct.sellingPrice > 0
                    ? (((selectedProduct.sellingPrice - selectedProduct.purchasePrice) / selectedProduct.sellingPrice) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Min Stok (Reorder)</span>
                <span className="font-medium">{selectedProduct.reorderPoint}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Track Stok</span>
                <span className={`font-medium ${selectedProduct.trackStock ? "text-emerald-600" : "text-gray-400"}`}>
                  {selectedProduct.trackStock ? "Ya" : "Tidak"}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setNewPrice({
                    productId: selectedProduct.id,
                    price: selectedProduct.sellingPrice,
                    type: "selling",
                    validFrom: "",
                    validTo: "",
                    notes: "",
                  });
                  setShowDetailModal(null);
                  setShowNewModal(true);
                }}
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Update Harga
              </button>
              <button
                onClick={() => setShowDetailModal(null)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}