"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useErpWorkspace } from "@/components/erp-context";
import { PageHeader } from "@/components/ui";
import {
  Plus,
  Receipt,
  Search,
  Check,
  Clock,
  AlertCircle,
  ChevronRight,
  X,
  DollarSign,
} from "lucide-react";
import { money } from "@/lib/format";
import type { ErpWorkspace } from "@/lib/erp/types";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function getStatusBadge(status: string): { label: string; color: string; icon: React.ReactNode } {
  switch (status) {
    case "paid":
      return { label: "Lunas", color: "bg-emerald-100 text-emerald-800", icon: <Check className="size-3" /> };
    case "partially_paid":
      return { label: "Dibayar Sebagian", color: "bg-blue-100 text-blue-800", icon: <Clock className="size-3" /> };
    case "posted":
      return { label: "Belum Bayar", color: "bg-amber-100 text-amber-800", icon: <Clock className="size-3" /> };
    case "void":
      return { label: "Batal", color: "bg-red-100 text-red-800", icon: <X className="size-3" /> };
    default:
      return { label: status, color: "bg-gray-100 text-gray-800", icon: null };
  }
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

export function TagihanWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const searchParams = useSearchParams();
  const requestedAction = searchParams.get("action");
  const { workspace, setWorkspace, request } = useErpWorkspace(initialWorkspace);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNewBillModal, setShowNewBillModal] = useState(() => requestedAction === "new");
  const [showBayarModal, setShowBayarModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter bills
  const filteredBills = workspace.purchaseBills.filter((bill) => {
    const matchesSearch =
      searchQuery === "" ||
      bill.billNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workspace.suppliers.find((s) => s.id === bill.supplierId)?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || bill.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate totals
  const totalBelumBayar = filteredBills
    .filter((bill) => bill.status === "posted" || bill.status === "partially_paid")
    .reduce((sum, bill) => sum + (bill.total - bill.paidAmount), 0);

  const totalLunas = filteredBills
    .filter((bill) => bill.status === "paid")
    .reduce((sum, bill) => sum + bill.total, 0);

  // New bill form state
  const [newBill, setNewBill] = useState(() => {
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + 30);
    return {
    supplierId: "",
    items: [{ productId: "", quantity: 1, unitCost: 0 }],
    date: today.toISOString().split("T")[0],
    dueDate: dueDate.toISOString().split("T")[0],
    notes: "",
    };
  });

  // Payment form state
  const [pembayaran, setPembayaran] = useState({
    amount: 0,
    method: "bank_transfer",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  function handleNewBillChange(field: string, value: string | number) {
    setNewBill((prev) => ({ ...prev, [field]: value }));
  }

  function handleItemChange(index: number, field: string, value: string | number) {
    setNewBill((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  }

  function addItem() {
    setNewBill((prev) => ({
      ...prev,
      items: [...prev.items, { productId: "", quantity: 1, unitCost: 0 }],
    }));
  }

  function removeItem(index: number) {
    setNewBill((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }

  function calculateNewBillTotal() {
    return newBill.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
  }

  async function handleCreateBill() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await request<{ workspace: ErpWorkspace }>("/api/erp/purchase-bills", {
        method: "POST",
        body: JSON.stringify({
          supplierId: newBill.supplierId,
          date: newBill.date,
          dueDate: newBill.dueDate,
          items: newBill.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
          notes: newBill.notes,
        }),
      });

      if (data.workspace) {
        setWorkspace(data.workspace);
      }

      setSuccess("Tagihan supplier berhasil dibuat!");
      setShowNewBillModal(false);
      setNewBill({
        supplierId: "",
        items: [{ productId: "", quantity: 1, unitCost: 0 }],
        date: new Date().toISOString().split("T")[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        notes: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  async function handleBayar(billId: string) {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const bill = workspace.purchaseBills.find((b) => b.id === billId);
      if (!bill) throw new Error("Tagihan tidak ditemukan");

      const data = await request<{ workspace: ErpWorkspace }>("/api/erp/payments", {
        method: "POST",
        body: JSON.stringify({
          direction: "outbound",
          documentType: "purchase_bill",
          documentId: billId,
          amount: pembayaran.amount,
          method: pembayaran.method,
          date: pembayaran.date,
          notes: pembayaran.notes,
        }),
      });

      if (data.workspace) {
        setWorkspace(data.workspace);
      }

      setSuccess("Pembayaran berhasil dicatat!");
      setShowBayarModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Tagihan Supplier"
        description="Kelola purchase bill dan lacak pembayaran ke supplier"
        action={
          <button
            onClick={() => setShowNewBillModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus className="size-4" />
            Buat Tagihan Baru
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Tagihan</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{filteredBills.length}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Receipt className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Belum Bayar</p>
              <p className="mt-2 text-2xl font-bold text-red-600">{money(totalBelumBayar)}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-red-600">
              <Clock className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Sudah Lunas</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{money(totalLunas)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <Check className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Utang Aktif</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {filteredBills.filter((bill) => bill.status !== "paid").length}
              </p>
            </div>
            <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
              <DollarSign className="size-6" />
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
            placeholder="Cari tagihan atau nama supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex gap-2">
          {["all", "posted", "partially_paid", "paid", "void"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                statusFilter === status
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {status === "all" ? "Semua" :
               status === "posted" ? "Belum Bayar" :
               status === "partially_paid" ? "Sebagian" :
               status === "paid" ? "Lunas" : "Batal"}
            </button>
          ))}
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

      {/* Bills Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Bill No</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Jatuh Tempo</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Sisa</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="size-12 text-gray-300" />
                      <p>Belum ada tagihan</p>
                      <button
                        onClick={() => setShowNewBillModal(true)}
                        className="text-blue-600 hover:underline"
                      >
                        Buat tagihan pertama
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBills.map((bill) => {
                  const supplier = workspace.suppliers.find((s) => s.id === bill.supplierId);
                  const status = getStatusBadge(bill.status);
                  const sisaBayar = bill.total - bill.paidAmount;

                  return (
                    <tr key={bill.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{bill.billNo}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{supplier?.name || "-"}</p>
                        {supplier?.phone && (
                          <p className="text-xs text-gray-500">{supplier.phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(bill.date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(bill.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {money(bill.total)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${sisaBayar > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {money(sisaBayar)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                          {status.icon}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {bill.status !== "paid" && bill.status !== "void" && (
                            <button
                              onClick={() => {
                                setShowBayarModal(bill.id);
                                setPembayaran({
                                  amount: bill.total - bill.paidAmount,
                                  method: "bank_transfer",
                                  date: new Date().toISOString().split("T")[0],
                                  notes: "",
                                });
                              }}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              Bayar
                            </button>
                          )}
                          <Link
                            href={`/transaksi/tagihan/${bill.id}`}
                            aria-label={`Lihat detail ${bill.billNo}`}
                            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100"
                          >
                            <ChevronRight className="size-4" />
                          </Link>
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

      {/* New Bill Modal */}
      <Modal
        isOpen={showNewBillModal}
        onClose={() => setShowNewBillModal(false)}
        title="Buat Tagihan Baru"
      >
        <div className="space-y-4">
          <FormField label="Supplier">
            <select
              value={newBill.supplierId}
              onChange={(e) => handleNewBillChange("supplierId", e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Pilih Supplier</option>
              {workspace.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Tanggal">
              <input
                type="date"
                value={newBill.date}
                onChange={(e) => handleNewBillChange("date", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </FormField>
            <FormField label="Jatuh Tempo">
              <input
                type="date"
                value={newBill.dueDate}
                onChange={(e) => handleNewBillChange("dueDate", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </FormField>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Item</label>
              <button
                type="button"
                onClick={addItem}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                + Tambah Item
              </button>
            </div>
            <div className="space-y-2">
              {newBill.items.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <select
                    value={item.productId}
                    onChange={(e) => handleItemChange(index, "productId", e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">Pilih Produk</option>
                    {workspace.products.filter((p) => p.isPurchasable).map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} - {money(product.purchasePrice)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value) || 0)}
                    placeholder="Qty"
                    className="w-16 rounded-lg border border-gray-200 px-2 py-2 text-center text-sm outline-none focus:border-blue-500"
                  />
                  <input
                    type="number"
                    value={item.unitCost}
                    onChange={(e) => handleItemChange(index, "unitCost", parseInt(e.target.value) || 0)}
                    placeholder="Harga"
                    className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  {newBill.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total:</span>
              <span className="text-xl font-bold text-gray-900">{money(calculateNewBillTotal())}</span>
            </div>
          </div>

          <FormField label="Catatan (opsional)">
            <textarea
              value={newBill.notes}
              onChange={(e) => handleNewBillChange("notes", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Tambahkan catatan jika perlu..."
            />
          </FormField>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowNewBillModal(false)}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={handleCreateBill}
              disabled={loading || !newBill.supplierId || newBill.items.length === 0}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Membuat..." : "Buat Tagihan"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bayar Modal */}
      <Modal
        isOpen={!!showBayarModal}
        onClose={() => setShowBayarModal(null)}
        title="Bayar Tagihan"
      >
        <div className="space-y-4">
          <FormField label="Jumlah Bayar">
            <input
              type="number"
              value={pembayaran.amount}
              onChange={(e) => setPembayaran((p) => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-lg font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </FormField>

          <FormField label="Metode Bayar">
            <select
              value={pembayaran.method}
              onChange={(e) => setPembayaran((p) => ({ ...p, method: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="bank_transfer">Transfer Bank</option>
              <option value="cash">Tunai</option>
            </select>
          </FormField>

          <FormField label="Tanggal Bayar">
            <input
              type="date"
              value={pembayaran.date}
              onChange={(e) => setPembayaran((p) => ({ ...p, date: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </FormField>

          <FormField label="Catatan (opsional)">
            <textarea
              value={pembayaran.notes}
              onChange={(e) => setPembayaran((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </FormField>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowBayarModal(null)}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={() => showBayarModal && handleBayar(showBayarModal)}
              disabled={loading || pembayaran.amount <= 0}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Memproses..." : "Simpan Pembayaran"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
