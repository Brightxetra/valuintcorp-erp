"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  ChevronRight,
  ChevronDown,
  Search,
  Building,
  CreditCard,
  Landmark,
  TrendingUp,
  TrendingDown,
  X,
} from "lucide-react";
import { cn } from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import { formatMoney, formatDate } from "@/lib/labels";
import type { ErpWorkspace } from "@/lib/erp/types";
import type { ChartOfAccount, AccountType, JournalEntry, JournalLine } from "@/lib/domain/types";

// ============================================================================
// COA TYPES
// ============================================================================

interface COAFormData {
  code: string;
  name: string;
  type: AccountType;
  category: string;
  isActive: boolean;
}

// ============================================================================
// ACCOUNT TYPE ICONS & COLORS
// ============================================================================

const accountTypeConfig: Record<AccountType, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  asset: { icon: Building, color: "text-blue-600", bgColor: "bg-blue-100", label: "Aset" },
  liability: { icon: CreditCard, color: "text-red-600", bgColor: "bg-red-100", label: "Utang" },
  equity: { icon: Landmark, color: "text-purple-600", bgColor: "bg-purple-100", label: "Modal" },
  revenue: { icon: TrendingUp, color: "text-emerald-600", bgColor: "bg-emerald-100", label: "Pendapatan" },
  expense: { icon: TrendingDown, color: "text-amber-600", bgColor: "bg-amber-100", label: "Beban" },
};

// ============================================================================
// COA MANAGEMENT COMPONENT
// ============================================================================

export function COAManagement({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace } = useErpWorkspace(initialWorkspace);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<AccountType | "all">("all");
  const [expandedTypes, setExpandedTypes] = useState<Set<AccountType>>(new Set(["asset", "liability", "equity", "revenue", "expense"]));
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<ChartOfAccount | null>(null);

  // Get accounts from workspace - combine system accounts with custom
  const allAccounts: ChartOfAccount[] = [
    ...getSystemAccounts(),
  ];

  // Filter accounts
  const filteredAccounts = allAccounts.filter((account) => {
    const matchesSearch = account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          account.code.includes(searchQuery);
    const matchesType = filterType === "all" || account.type === filterType;
    return matchesSearch && matchesType;
  });

  // Group by type
  const accountsByType = filteredAccounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = [];
    acc[account.type].push(account);
    return acc;
  }, {} as Record<AccountType, ChartOfAccount[]>);

  // Sort accounts within each group
  Object.keys(accountsByType).forEach((type) => {
    accountsByType[type as AccountType].sort((a, b) => a.code.localeCompare(b.code));
  });

  const toggleExpanded = (type: AccountType) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Daftar Akun</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola struktur akun untuk pencatatan jurnal otomatis
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <Plus className="size-4" />
            Tambah Akun
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama akun atau kode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AccountType | "all")}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none"
          >
            <option value="all">Semua Tipe</option>
            <option value="asset">Aset</option>
            <option value="liability">Utang</option>
            <option value="equity">Modal</option>
            <option value="revenue">Pendapatan</option>
            <option value="expense">Beban</option>
          </select>
        </div>
      </div>

      {/* Account Groups */}
      <div className="space-y-4">
        {(Object.keys(accountsByType) as AccountType[]).map((type) => {
          const config = accountTypeConfig[type];
          const Icon = config.icon;
          const accounts = accountsByType[type] || [];
          const isExpanded = expandedTypes.has(type);
          const totalBalance = 0;

          return (
            <div key={type} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {/* Group Header */}
              <button
                type="button"
                onClick={() => toggleExpanded(type)}
                className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-slate-50"
              >
                <div className={cn("rounded-xl p-2.5", config.bgColor)}>
                  <Icon className={cn("size-5", config.color)} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-950">{config.label}</h3>
                  <p className="text-sm text-slate-500">{accounts.length} akun</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-600">Saldo</p>
                  <p className={cn("font-semibold", totalBalance >= 0 ? "text-slate-950" : "text-red-600")}>
                    {formatMoney(Math.abs(totalBalance))}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronDown className="size-5 text-slate-400" />
                ) : (
                  <ChevronRight className="size-5 text-slate-400" />
                )}
              </button>

              {/* Account List */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Kode</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nama Akun</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Kategori</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Saldo</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {accounts.map((account) => (
                        <tr
                          key={account.id}
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => setSelectedAccount(account)}
                        >
                          <td className="px-4 py-3 font-mono text-sm font-medium text-slate-600">
                            {account.code}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-950">{account.name}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 capitalize">
                            {account.category?.replace("_", " ")}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatMoney(0)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              account.isActive
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            )}>
                              {account.isActive ? "Aktif" : "Nonaktif"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAccount(account);
                                }}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              >
                                <Pencil className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {filteredAccounts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-2xl bg-slate-100 p-4">
              <Landmark className="size-8 text-slate-400" />
            </div>
            <p className="mt-4 font-medium text-slate-900">Tidak ada akun ditemukan</p>
            <p className="mt-1 text-sm text-slate-500">
              {searchQuery ? "Coba ubah kata kunci pencarian" : "Tambah akun baru untuk memulai"}
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingAccount) && (
        <COAFormModal
          account={editingAccount}
          existingCodes={allAccounts.map(a => a.code)}
          onClose={() => {
            setShowAddModal(false);
            setEditingAccount(null);
          }}
          onSave={(data) => {
            // Handle save
            console.log("Save account:", data);
            setShowAddModal(false);
            setEditingAccount(null);
          }}
        />
      )}

      {/* Account Detail Panel */}
      {selectedAccount && (
        <AccountDetailPanel
          account={selectedAccount}
          journals={workspace.journals.filter(j =>
            j.lines.some(l => l.accountCode === selectedAccount.code)
          )}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// COA FORM MODAL
// ============================================================================

function COAFormModal({
  account,
  existingCodes,
  onClose,
  onSave,
}: {
  account: ChartOfAccount | null;
  existingCodes: string[];
  onClose: () => void;
  onSave: (data: COAFormData) => void;
}) {
  const [formData, setFormData] = useState<COAFormData>({
    code: account?.code || "",
    name: account?.name || "",
    type: account?.type || "expense",
    category: account?.category || "",
    isActive: account?.isActive ?? true,
  });

  const accountTypes: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

  const categories: Record<AccountType, string[]> = {
    asset: ["cash", "receivable", "inventory", "fixed_asset"],
    liability: ["payable", "tax", "loan"],
    equity: ["capital", "reserve"],
    revenue: ["sales", "service", "other_income"],
    expense: ["cogs", "operating_expense", "payroll", "tax", "interest"],
  };

  const generateCode = () => {
    const prefix = formData.type === "asset" ? "1" :
                   formData.type === "liability" ? "2" :
                   formData.type === "equity" ? "3" :
                   formData.type === "revenue" ? "4" : "5";

    // Find highest existing code with same prefix
    const samePrefix = existingCodes
      .filter(c => c.startsWith(prefix))
      .map(c => parseInt(c))
      .filter(n => !isNaN(n));

    const next = samePrefix.length > 0 ? Math.max(...samePrefix) + 1 : parseInt(prefix + "001");
    setFormData(prev => ({ ...prev, code: String(next) }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-950">
            {account ? "Edit Akun" : "Tambah Akun Baru"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kode Akun</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="1000"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
                <button
                  type="button"
                  onClick={generateCode}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"
                >
                  Auto
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipe Akun</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as AccountType }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              >
                {accountTypes.map((type) => (
                  <option key={type} value={type}>
                    {accountTypeConfig[type].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nama Akun</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Contoh: Kas Kecil"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            >
              <option value="">Pilih Kategori</option>
              {categories[formData.type]?.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                formData.isActive ? "bg-emerald-600" : "bg-slate-300"
              )}
            >
              <span
                className={cn(
                  "inline-block size-4 rounded-full bg-white transition-transform",
                  formData.isActive ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
            <span className="text-sm text-slate-600">
              {formData.isActive ? "Akun Aktif" : "Akun Nonaktif"}
            </span>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              {account ? "Simpan Perubahan" : "Tambah Akun"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// ACCOUNT DETAIL PANEL
// ============================================================================

function AccountDetailPanel({
  account,
  journals,
  onClose,
}: {
  account: ChartOfAccount;
  journals: JournalEntry[];
  onClose: () => void;
}) {
  const accountJournals = journals.filter((j: JournalEntry) =>
    j.lines.some((l) => l.accountCode === account.code)
  );

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl border-l border-slate-200 bg-white shadow-xl">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{account.name}</h2>
            <p className="text-sm text-slate-500">Kode: {account.code}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Info */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipe</p>
              <p className="mt-1 font-semibold capitalize">{account.type}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Kategori</p>
              <p className="mt-1 font-semibold capitalize">{account.category?.replace("_", " ")}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo</p>
              <p className="mt-1 text-xl font-bold">{formatMoney(0)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
              <p className="mt-1">
                <span className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                  account.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                )}>
                  {account.isActive ? "Aktif" : "Nonaktif"}
                </span>
              </p>
            </div>
          </div>

          {/* Journal History */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Riwayat Jurnal</h3>
            {accountJournals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <p className="text-sm text-slate-500">Belum ada transaksi di akun ini</p>
              </div>
            ) : (
              <div className="space-y-2">
                {accountJournals.slice(0, 10).map((journal) => {
                  const line = journal.lines.find((l: JournalLine) => l.accountCode === account.code);
                  return (
                    <div key={journal.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                      <div>
                        <p className="font-medium text-slate-950">{journal.description}</p>
                        <p className="text-xs text-slate-500">{formatDate(journal.date)}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-semibold",
                          (line?.debit ?? 0) > 0 ? "text-blue-600" : "text-emerald-600"
                        )}>
                          {(line?.debit ?? 0) > 0 ? "DR " : "CR "}
                          {formatMoney(line?.debit || line?.credit || 0)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER: Get system accounts
// ============================================================================

function getSystemAccounts(): (ChartOfAccount & { _balance?: number })[] {
  return [
    { id: "acc-1000", code: "1000", name: "Kas dan Bank", type: "asset", normalBalance: "debit", category: "cash", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-1100", code: "1100", name: "Piutang Usaha", type: "asset", normalBalance: "debit", category: "receivable", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-1200", code: "1200", name: "Persediaan", type: "asset", normalBalance: "debit", category: "inventory", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-1300", code: "1300", name: "Aset Tetap", type: "asset", normalBalance: "debit", category: "fixed_asset", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-2000", code: "2000", name: "Utang Usaha", type: "liability", normalBalance: "credit", category: "payable", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-2100", code: "2100", name: "Utang Gaji", type: "liability", normalBalance: "credit", category: "payable", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-2101", code: "2101", name: "Utang BPJS", type: "liability", normalBalance: "credit", category: "payable", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-2200", code: "2200", name: "Utang Pajak", type: "liability", normalBalance: "credit", category: "tax", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-3000", code: "3000", name: "Modal Pemilik", type: "equity", normalBalance: "credit", category: "capital", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-3100", code: "3100", name: "Prive Pemilik", type: "equity", normalBalance: "credit", category: "capital", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-4000", code: "4000", name: "Penjualan", type: "revenue", normalBalance: "credit", category: "sales", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-4010", code: "4010", name: "Pendapatan Jasa", type: "revenue", normalBalance: "credit", category: "sales", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-5000", code: "5000", name: "Harga Pokok Penjualan", type: "expense", normalBalance: "debit", category: "cogs", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-5100", code: "5100", name: "Beban Operasional", type: "expense", normalBalance: "debit", category: "operating_expense", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-5200", code: "5200", name: "Beban Gaji", type: "expense", normalBalance: "debit", category: "payroll", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-5201", code: "5201", name: "Beban BPJS", type: "expense", normalBalance: "debit", category: "payroll", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-5300", code: "5300", name: "Beban Pajak", type: "expense", normalBalance: "debit", category: "tax", isSystem: true, isActive: true, businessId: null, _balance: 0 },
    { id: "acc-6000", code: "6000", name: "Penyesuaian Persediaan", type: "expense", normalBalance: "debit", category: "adjustment", isSystem: true, isActive: true, businessId: null, _balance: 0 },
  ];
}
