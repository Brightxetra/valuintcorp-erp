"use client";

import { useState } from "react";
import { useErpWorkspace } from "@/components/erp-context";
import { FeedbackToast } from "@/components/feedback-toast";
import { PageHeader } from "@/components/ui";
import { Wallet, Search, X, Building, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import type { ErpWorkspace } from "@/lib/erp/types";

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="size-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

interface KasEntry {
  id: string;
  date: string;
  type: "masuk" | "keluar";
  description: string;
  amount: number;
  method: "cash" | "bank_transfer" | "qris" | "marketplace";
  reference?: string;
}

export function KasWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace } = useErpWorkspace(initialWorkspace);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [kasEntries, setKasEntries] = useState<KasEntry[]>(() => {
    const entries: KasEntry[] = [];
    workspace.payments.filter((p) => p.direction === "inbound").forEach((payment) => {
      const invoice = workspace.salesInvoices.find((inv) => inv.id === payment.documentId);
      const customer = invoice ? workspace.customers.find((c) => c.id === invoice.customerId) : null;
      entries.push({
        id: payment.id,
        date: payment.date,
        type: "masuk",
        description: `Penerimaan dari ${customer?.name || "Pelanggan"}`,
        amount: payment.amount,
        method: payment.method as KasEntry["method"],
        reference: payment.reference
      });
    });
    workspace.payments.filter((p) => p.direction === "outbound").forEach((payment) => {
      const bill = workspace.purchaseBills.find((b) => b.id === payment.documentId);
      const supplier = bill ? workspace.suppliers.find((s) => s.id === bill.supplierId) : null;
      entries.push({
        id: payment.id,
        date: payment.date,
        type: "keluar",
        description: `Pembayaran ke ${supplier?.name || "Supplier"}`,
        amount: payment.amount,
        method: payment.method as KasEntry["method"],
        reference: payment.reference
      });
    });
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  const filteredEntries = kasEntries.filter((entry) => {
    const matchesSearch = searchQuery === "" || entry.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || entry.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const totalMasuk = kasEntries.filter((e) => e.type === "masuk").reduce((sum, e) => sum + e.amount, 0);
  const totalKeluar = kasEntries.filter((e) => e.type === "keluar").reduce((sum, e) => sum + e.amount, 0);
  const saldo = totalMasuk - totalKeluar;

  const [newEntry, setNewEntry] = useState({
    type: "masuk" as "masuk" | "keluar",
    amount: 0,
    description: "",
    method: "cash" as KasEntry["method"],
    date: new Date().toISOString().split("T")[0]
  });

  function handleNewEntryChange(field: string, value: string | number) {
    setNewEntry((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreateEntry() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const entry: KasEntry = {
        id: `kas-${Date.now()}`,
        date: newEntry.date,
        type: newEntry.type,
        description: newEntry.description,
        amount: newEntry.amount,
        method: newEntry.method
      };
      setKasEntries((prev) => [entry, ...prev]);
      setSuccess(newEntry.type === "masuk" ? "Pemasukan" : "Pengeluaran" + " berhasil dicatat!");
      setShowNewModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kas & Bank"
        description="Kelola aliran kas masuk dan keluar"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => { setNewEntry((prev) => ({ ...prev, type: "keluar" })); setShowNewModal(true); }}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              <ArrowDownLeft className="size-4" />
              Pengeluaran
            </button>
            <button
              onClick={() => { setNewEntry((prev) => ({ ...prev, type: "masuk" })); setShowNewModal(true); }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <ArrowUpRight className="size-4" />
              Penerimaan
            </button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Saldo Kas</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(saldo)}</p>
            </div>
            <div className="rounded-xl bg-purple-50 p-3 text-purple-600"><Wallet className="size-6" /></div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Masuk</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{formatCurrency(totalMasuk)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><ArrowUpRight className="size-6" /></div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Keluar</p>
              <p className="mt-2 text-2xl font-bold text-red-600">{formatCurrency(totalKeluar)}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-red-600"><ArrowDownLeft className="size-6" /></div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Transaksi</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{kasEntries.length}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Building className="size-6" /></div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari transaksi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div className="flex gap-2">
          {[{ value: "all", label: "Semua" }, { value: "masuk", label: "Masuk" }, { value: "keluar", label: "Keluar" }].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setTypeFilter(filter.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${typeFilter === filter.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <FeedbackToast error={error} success={success} />

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Deskripsi</th>
                <th className="px-4 py-3">Metode</th>
                <th className="px-4 py-3 text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Wallet className="size-12 text-gray-300" />
                      <p>Belum ada transaksi kas</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${entry.type === "masuk" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {entry.type === "masuk" ? <ArrowUpRight className="size-3" /> : <ArrowDownLeft className="size-3" />}
                        {entry.type === "masuk" ? "Masuk" : "Keluar"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{entry.description}</p>
                      {entry.reference && <p className="text-xs text-gray-500">{entry.reference}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {entry.method === "cash" ? "Tunai" : entry.method === "bank_transfer" ? "Transfer" : entry.method === "qris" ? "QRIS" : "Marketplace"}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${entry.type === "masuk" ? "text-emerald-600" : "text-red-600"}`}>
                      {entry.type === "masuk" ? "+" : "-"} {formatCurrency(entry.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title={newEntry.type === "masuk" ? "Catat Penerimaan" : "Catat Pengeluaran"}>
        <div className="space-y-4">
          <div className="mb-4 flex rounded-lg bg-gray-100 p-1">
            <button type="button" onClick={() => handleNewEntryChange("type", "masuk")} className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${newEntry.type === "masuk" ? "bg-emerald-600 text-white" : "bg-transparent text-gray-600"}`}>
              <ArrowUpRight className="inline size-4 mr-1" />
              Masuk
            </button>
            <button type="button" onClick={() => handleNewEntryChange("type", "keluar")} className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${newEntry.type === "keluar" ? "bg-red-600 text-white" : "bg-transparent text-gray-600"}`}>
              <ArrowDownLeft className="inline size-4 mr-1" />
              Keluar
            </button>
          </div>
          <FormField label="Jumlah">
            <input type="number" value={newEntry.amount} onChange={(e) => handleNewEntryChange("amount", parseInt(e.target.value) || 0)} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-lg font-semibold outline-none focus:border-emerald-500" placeholder="0" />
          </FormField>
          <FormField label="Deskripsi">
            <input type="text" value={newEntry.description} onChange={(e) => handleNewEntryChange("description", e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" placeholder="Contoh: Pembayaran invoice" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Metode">
              <select value={newEntry.method} onChange={(e) => handleNewEntryChange("method", e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
                <option value="cash">Tunai</option>
                <option value="bank_transfer">Transfer Bank</option>
                <option value="qris">QRIS</option>
                <option value="marketplace">Marketplace</option>
              </select>
            </FormField>
            <FormField label="Tanggal">
              <input type="date" value={newEntry.date} onChange={(e) => handleNewEntryChange("date", e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
            </FormField>
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={() => setShowNewModal(false)} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Batal</button>
            <button onClick={handleCreateEntry} disabled={loading || newEntry.amount <= 0 || !newEntry.description} className={`flex-1 rounded-lg py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 ${newEntry.type === "masuk" ? "bg-emerald-600" : "bg-red-600"}`}>
              {loading ? "Memproses..." : "Simpan"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
