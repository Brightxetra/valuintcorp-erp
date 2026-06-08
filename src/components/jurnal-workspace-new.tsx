"use client";

import { useState } from "react";
import { useErpWorkspace } from "@/components/erp-context";
import { PageHeader } from "@/components/ui";
import {
  Plus,
  BookOpen,
  Search,
  Check,
  AlertCircle,
  ChevronRight,
  X,
  FileText,
  Filter,
  RefreshCw,
  Lock,
  Unlock,
} from "lucide-react";
import { money } from "@/lib/format";
import type { ErpWorkspace } from "@/lib/erp/types";
import type { JournalEntry } from "@/lib/domain/types";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadge(status: string): { label: string; color: string } {
  switch (status) {
    case "posted":
      return { label: "Diposting", color: "bg-emerald-100 text-emerald-800" };
    case "draft":
      return { label: "Draft", color: "bg-amber-100 text-amber-800" };
    case "void":
      return { label: "Batal", color: "bg-red-100 text-red-800" };
    default:
      return { label: status, color: "bg-gray-100 text-gray-800" };
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

export function JurnalWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace } = useErpWorkspace(initialWorkspace);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter journals
  const filteredJournals = workspace.journals.filter((journal) => {
    const matchesSearch =
      searchQuery === "" ||
      journal.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      journal.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      journal.date.includes(searchQuery);
    const matchesStatus = statusFilter === "all" || journal.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate totals
  const totalDebit = filteredJournals.reduce((sum, journal) => {
    return sum + journal.lines.reduce((lineSum, line) => lineSum + (line.debit || 0), 0);
  }, 0);

  const postedCount = filteredJournals.filter((j) => j.status === "posted").length;
  const draftCount = filteredJournals.filter((j) => j.status === "draft").length;

  // New journal form state
  const [newJournal, setNewJournal] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    source: "manual",
    lines: [
      { accountId: "", debit: 0, credit: 0 },
      { accountId: "", debit: 0, credit: 0 },
    ],
  });

  function handleJournalChange(field: string, value: string) {
    setNewJournal((prev) => ({ ...prev, [field]: value }));
  }

  function handleLineChange(index: number, field: string, value: number) {
    setNewJournal((prev) => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], [field]: value };
      return { ...prev, lines };
    });
  }

  function addLine() {
    setNewJournal((prev) => ({
      ...prev,
      lines: [...prev.lines, { accountId: "", debit: 0, credit: 0 }],
    }));
  }

  function removeLine(index: number) {
    if (newJournal.lines.length > 2) {
      setNewJournal((prev) => ({
        ...prev,
        lines: prev.lines.filter((_, i) => i !== index),
      }));
    }
  }

  async function handleCreateJournal() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/erp/manual-journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newJournal),
      });

      if (!response.ok) {
        throw new Error("Gagal membuat jurnal");
      }

      const data = await response.json();
      if (data.workspace) {
        setWorkspace(data.workspace);
      }

      setSuccess("Jurnal berhasil dibuat!");
      setShowNewModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  const selectedJournal = showDetailModal ? workspace.journals.find((j) => j.id === showDetailModal) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Catatan Jurnal"
        description="Kelola jurnal umum untuk mencatat transaksi manual"
        action={
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <Plus className="size-4" />
            Jurnal Baru
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Jurnal</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{filteredJournals.length}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <BookOpen className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Diposting</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{postedCount}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <Check className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Draft</p>
              <p className="mt-2 text-2xl font-bold text-amber-600">{draftCount}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
              <FileText className="size-6" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Debit</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(totalDebit)}</p>
            </div>
            <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
              <Filter className="size-6" />
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
            placeholder="Cari jurnal..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div className="flex gap-2">
          {["all", "posted", "draft", "void"].map((status) => (
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
               status === "posted" ? "Diposting" :
               status === "draft" ? "Draft" : "Batal"}
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

      {/* Journal List */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Deskripsi</th>
                <th className="px-4 py-3">Sumber</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Total Debit</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredJournals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <BookOpen className="size-12 text-gray-300" />
                      <p>Belum ada jurnal</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredJournals.map((journal) => {
                  const status = getStatusBadge(journal.status);
                  const totalDebit = journal.lines.reduce((sum, line) => sum + (line.debit || 0), 0);

                  return (
                    <tr key={journal.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(journal.date)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{journal.description}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {String(journal.source) === "manual" ? "Manual" :
                         String(journal.source) === "sales" ? "Penjualan" :
                         String(journal.source) === "purchase" ? "Pembelian" :
                         String(journal.source) === "payroll" ? "Gaji" : journal.source}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(totalDebit)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setShowDetailModal(journal.id)}
                          className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100"
                        >
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

      {/* New Journal Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Buat Jurnal Baru"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Tanggal">
              <input
                type="date"
                value={newJournal.date}
                onChange={(e) => handleJournalChange("date", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </FormField>
            <FormField label="Sumber">
              <select
                value={newJournal.source}
                onChange={(e) => handleJournalChange("source", e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="manual">Manual</option>
                <option value="sales">Penjualan</option>
                <option value="purchase">Pembelian</option>
                <option value="payroll">Gaji</option>
                <option value="adjustment">Penyesuaian</option>
              </select>
            </FormField>
          </div>

          <FormField label="Deskripsi">
            <input
              type="text"
              value={newJournal.description}
              onChange={(e) => handleJournalChange("description", e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              placeholder="Contoh: Penyusutan aset bulan Juni"
            />
          </FormField>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Baris Jurnal</label>
              <button
                type="button"
                onClick={addLine}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                + Tambah Baris
              </button>
            </div>
            <div className="space-y-2">
              {newJournal.lines.map((line, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <select
                    value={line.accountId}
                    onChange={(e) => handleLineChange(index, "accountId", e.target.value as unknown as number)}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="">Pilih Akun</option>
                    <option value="kas">1110 - Kas</option>
                    <option value="bank">1120 - Bank</option>
                    <option value="piutang">1200 - Piutang Usaha</option>
                    <option value="persediaan">1300 - Persediaan</option>
                    <option value="utang">2000 - Utang Usaha</option>
                    <option value="pendapatan">4000 - Pendapatan</option>
                    <option value="beban">5000 - Beban</option>
                  </select>
                  <input
                    type="number"
                    value={line.debit || ""}
                    onChange={(e) => handleLineChange(index, "debit", parseInt(e.target.value) || 0)}
                    placeholder="Debit"
                    className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                  <input
                    type="number"
                    value={line.credit || ""}
                    onChange={(e) => handleLineChange(index, "credit", parseInt(e.target.value) || 0)}
                    placeholder="Kredit"
                    className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                  {newJournal.lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowNewModal(false)}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={handleCreateJournal}
              disabled={loading || !newJournal.description}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Memproses..." : "Simpan Jurnal"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!showDetailModal}
        onClose={() => setShowDetailModal(null)}
        title="Detail Jurnal"
      >
        {selectedJournal && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <div>
                <p className="text-sm text-gray-500">Tanggal</p>
                <p className="font-semibold">{formatDate(selectedJournal.date)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                selectedJournal.status === "posted" ? "bg-emerald-100 text-emerald-800" :
                selectedJournal.status === "draft" ? "bg-amber-100 text-amber-800" :
                "bg-red-100 text-red-800"
              }`}>
                {selectedJournal.status === "posted" ? "Diposting" :
                 selectedJournal.status === "draft" ? "Draft" : "Batal"}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Deskripsi</span>
                <span className="font-medium">{selectedJournal.description}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Sumber</span>
                <span className="font-medium capitalize">{selectedJournal.source}</span>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Akun</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Debit</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Kredit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedJournal.lines.map((line, idx) => {
                    const accountName = "Akun " + (idx + 1);
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-2">
                          <p className="font-medium">{accountName}</p>
                          <p className="text-xs text-gray-500">{"-"}</p>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {line.debit ? formatCurrency(line.debit) : "-"}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {line.credit ? formatCurrency(line.credit) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 pt-4">
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
