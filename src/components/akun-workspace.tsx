"use client";

import { useMemo, useState } from "react";
import { Banknote, Building, CreditCard, Download, Edit, Eye, PieChart, Plus, Search, ScrollText, Trash2, TrendingUp } from "lucide-react";
import { ActionButton, EmptyState, Panel, SelectField, StatusPill, TextField } from "@/components/ui";
import { MobileDialog } from "@/components/mobile-dialog";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";
import type { AccountType, ChartOfAccount, NormalBalance } from "@/lib/domain/types";
import { normalBalanceForType } from "@/lib/domain/types";
import { money } from "@/lib/format";
import { getAccountTypeLabel } from "@/lib/translations";
import { notify } from "@/lib/notify";

type AccountFormState = {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  category: string;
  isActive: boolean;
};

type AccountWithBalance = ChartOfAccount & { balance: number };

const accountTypes: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];
const categorySuggestions = ["cash", "receivable", "inventory", "fixed_asset", "payable", "tax", "capital", "sales", "other_income", "cogs", "operating_expense", "payroll", "adjustment"];

function typeInfo(type: AccountType): { label: string; icon: React.ElementType; color: string } {
  const info = {
    asset: { label: "AKTIVA", icon: Banknote, color: "text-blue-700 bg-blue-50" },
    liability: { label: "KEWAJIBAN", icon: Building, color: "text-red-700 bg-red-50" },
    equity: { label: "MODAL", icon: PieChart, color: "text-purple-700 bg-purple-50" },
    revenue: { label: "PENDAPATAN", icon: TrendingUp, color: "text-emerald-700 bg-emerald-50" },
    expense: { label: "BEBAN", icon: PieChart, color: "text-amber-700 bg-amber-50" },
  } satisfies Record<AccountType, { label: string; icon: React.ElementType; color: string }>;
  return info[type];
}

function accountToForm(account?: ChartOfAccount): AccountFormState {
  const type = account?.type ?? "expense";
  return {
    code: account?.code ?? "",
    name: account?.name ?? "",
    type,
    normalBalance: account?.normalBalance ?? normalBalanceForType(type),
    category: account?.category ?? "operating_expense",
    isActive: account?.isActive ?? true,
  };
}

function signedBalance(account: ChartOfAccount, workspace: ErpWorkspace) {
  let debit = 0;
  let credit = 0;

  for (const journal of workspace.journals) {
    if (journal.status === "reversed") continue;
    for (const line of journal.lines) {
      if (line.accountId === account.id || line.accountCode === account.code) {
        debit += line.debit;
        credit += line.credit;
      }
    }
  }

  return account.normalBalance === "credit" ? credit - debit : debit - credit;
}

function SummaryByType({ accounts }: { accounts: AccountWithBalance[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {accountTypes.map((type) => {
        const info = typeInfo(type);
        const Icon = info.icon;
        const total = accounts.filter((account) => account.type === type).reduce((sum, account) => sum + account.balance, 0);
        return (
          <div key={type} className={`rounded-lg p-3 ${info.color}`}>
            <div className="flex items-center gap-2"><Icon className="size-4" aria-hidden /><span className="text-xs font-medium">{info.label}</span></div>
            <p className="mt-1 font-mono text-sm font-semibold">{money(total)}</p>
          </div>
        );
      })}
    </div>
  );
}

function AccountFormDialog({ open, account, form, setForm, onClose, onSubmit, loading }: {
  open: boolean;
  account: ChartOfAccount | null;
  form: AccountFormState;
  setForm: React.Dispatch<React.SetStateAction<AccountFormState>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  function update<K extends keyof AccountFormState>(key: K, value: AccountFormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "type") next.normalBalance = normalBalanceForType(value as AccountType);
      return next;
    });
  }

  return (
    <MobileDialog isOpen={open} onClose={onClose} title={account ? "Ubah akun" : "Tambah akun"} maxWidth="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-4">
        {account?.isSystem ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Akun sistem dilindungi agar jurnal otomatis tetap konsisten. Buat akun custom jika butuh akun tambahan.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Kode akun" value={form.code} onChange={(e) => update("code", e.target.value)} disabled={Boolean(account?.isSystem)} required />
          <TextField label="Nama akun" value={form.name} onChange={(e) => update("name", e.target.value)} disabled={Boolean(account?.isSystem)} required />
          <SelectField label="Tipe akun" value={form.type} onChange={(e) => update("type", e.target.value as AccountType)} disabled={Boolean(account?.isSystem)}>
            {accountTypes.map((type) => <option key={type} value={type}>{getAccountTypeLabel(type)}</option>)}
          </SelectField>
          <SelectField label="Saldo normal" value={form.normalBalance} onChange={(e) => update("normalBalance", e.target.value as NormalBalance)} disabled={Boolean(account?.isSystem)}>
            <option value="debit">Debet</option>
            <option value="credit">Kredit</option>
          </SelectField>
          <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700">Kategori</span><input list="coa-categories" value={form.category} onChange={(e) => update("category", e.target.value)} disabled={Boolean(account?.isSystem)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" required /><datalist id="coa-categories">{categorySuggestions.map((category) => <option key={category} value={category} />)}</datalist></label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.isActive} onChange={(e) => update("isActive", e.target.checked)} disabled={Boolean(account?.isSystem)} className="size-4 rounded border-slate-300 text-emerald-600" />Akun aktif</label>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <ActionButton type="button" variant="secondary" onClick={onClose}>Batal</ActionButton>
          <ActionButton type="submit" disabled={loading || Boolean(account?.isSystem)}>{loading ? "Menyimpan..." : "Simpan akun"}</ActionButton>
        </div>
      </form>
    </MobileDialog>
  );
}

function AccountDetail({ account, onEdit, onArchive }: { account: AccountWithBalance; onEdit: (account: ChartOfAccount) => void; onArchive: (account: ChartOfAccount) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-100 p-2 text-slate-600"><CreditCard className="size-5" aria-hidden /></div>
          <div><h3 className="font-semibold text-slate-950">{account.name}</h3><p className="text-sm text-slate-500">{account.code}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">{account.isSystem ? <StatusPill tone="gray">Sistem</StatusPill> : <StatusPill tone="cyan">Custom</StatusPill>}<StatusPill tone={account.isActive ? "emerald" : "gray"}>{account.isActive ? "Aktif" : "Nonaktif"}</StatusPill></div>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-slate-500">Tipe</p><p className="font-medium">{getAccountTypeLabel(account.type)}</p></div>
        <div><p className="text-xs text-slate-500">Kategori</p><p className="font-medium">{account.category}</p></div>
        <div><p className="text-xs text-slate-500">Saldo normal</p><p className="font-medium">{account.normalBalance === "debit" ? "Debet" : "Kredit"}</p></div>
        <div><p className="text-xs text-slate-500">Saldo</p><p className="text-xl font-bold text-slate-950">{money(account.balance)}</p></div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-200 p-4">
        <ActionButton variant="secondary"><Eye className="size-4" /> Lihat Transaksi</ActionButton>
        <ActionButton variant="secondary" onClick={() => onEdit(account)} disabled={account.isSystem}><Edit className="size-4" /> Ubah</ActionButton>
        <ActionButton variant="danger" onClick={() => onArchive(account)} disabled={account.isSystem || !account.isActive}><Trash2 className="size-4" /> Nonaktifkan</ActionButton>
      </div>
    </div>
  );
}

export function AkunWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request } = useErpWorkspace(initialWorkspace);
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<AccountWithBalance | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [showBalance, setShowBalance] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [form, setForm] = useState<AccountFormState>(() => accountToForm());
  const [loading, setLoading] = useState(false);

  const accounts = useMemo<AccountWithBalance[]>(() => workspace.accounts.map((account) => ({ ...account, balance: signedBalance(account, workspace) })), [workspace]);
  const filteredAccounts = accounts.filter((account) => {
    const normalized = search.toLowerCase().trim();
    const matchesSearch = !normalized || account.code.toLowerCase().includes(normalized) || account.name.toLowerCase().includes(normalized) || account.category.toLowerCase().includes(normalized);
    return matchesSearch && (!showOnlyActive || account.isActive);
  });

  function openCreate() {
    setEditingAccount(null);
    setForm(accountToForm());
    setShowForm(true);
  }

  function openEdit(account: ChartOfAccount) {
    setEditingAccount(account);
    setForm(accountToForm(account));
    setShowForm(true);
  }

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const body = await request<{ workspace: ErpWorkspace }>("/api/erp/chart-of-accounts", {
        method: "POST",
        body: JSON.stringify({ id: editingAccount?.id, values: form }),
      });
      setWorkspace(body.workspace);
      setShowForm(false);
      notify.success(editingAccount ? "Akun diperbarui" : "Akun ditambahkan", { description: `${form.code} - ${form.name}` });
    } catch (caught) {
      notify.error("Akun gagal disimpan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setLoading(false);
    }
  }

  async function archiveAccount(account: ChartOfAccount) {
    if (!window.confirm(`Nonaktifkan akun ${account.code} - ${account.name}?`)) return;
    setLoading(true);
    try {
      const body = await request<{ workspace: ErpWorkspace }>("/api/erp/chart-of-accounts", {
        method: "DELETE",
        body: JSON.stringify({ id: account.id }),
      });
      setWorkspace(body.workspace);
      setSelectedAccount(null);
      notify.info("Akun dinonaktifkan", { description: `${account.code} - ${account.name}` });
    } catch (caught) {
      notify.error("Akun gagal dinonaktifkan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-950">Daftar Akun (COA)</h1><p className="mt-1 text-slate-600">Kelola chart of accounts dari Supabase dan lihat saldo dari jurnal posted.</p></div>
        <div className="flex flex-wrap gap-2"><ActionButton variant="secondary"><Download className="size-4" /> Export</ActionButton><ActionButton onClick={openCreate}><Plus className="size-4" /> Tambah Akun Baru</ActionButton></div>
      </div>

      <SummaryByType accounts={accounts.filter((account) => account.isActive)} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Cari kode, nama, atau kategori akun..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-4 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></div>
        <div className="flex flex-wrap items-center gap-3"><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={showBalance} onChange={() => setShowBalance(!showBalance)} className="size-4 rounded border-slate-300 text-emerald-600" />Tampilkan Saldo</label><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={showOnlyActive} onChange={() => setShowOnlyActive(!showOnlyActive)} className="size-4 rounded border-slate-300 text-emerald-600" />Aktif saja</label></div>
      </div>

      <Panel title="Struktur Akun" description="Akun sistem dilindungi. Tambah akun custom untuk kebutuhan operasional tambahan.">
        {filteredAccounts.length > 0 ? (
          <div className="space-y-5">
            {accountTypes.map((type) => {
              const rows = filteredAccounts.filter((account) => account.type === type);
              if (rows.length === 0) return null;
              const info = typeInfo(type);
              const Icon = info.icon;
              return (
                <section key={type}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><span className={`rounded-lg p-2 ${info.color}`}><Icon className="size-4" aria-hidden /></span>{info.label}</div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="mobile-card-table w-full text-sm">
                      <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left font-semibold text-slate-500">Kode</th><th className="px-4 py-3 text-left font-semibold text-slate-500">Nama</th><th className="px-4 py-3 text-left font-semibold text-slate-500">Kategori</th><th className="px-4 py-3 text-right font-semibold text-slate-500">Saldo</th><th className="px-4 py-3 text-center font-semibold text-slate-500">Status</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{rows.map((account) => <tr key={account.id} onClick={() => setSelectedAccount(account)} className="cursor-pointer hover:bg-slate-50"><td data-mobile-label="Kode" className="px-4 py-3 font-mono font-semibold text-slate-900">{account.code}</td><td data-mobile-label="Nama" className="px-4 py-3"><p className="font-medium text-slate-950">{account.name}</p><p className="text-xs text-slate-500">{account.normalBalance === "debit" ? "Debet" : "Kredit"}</p></td><td data-mobile-label="Kategori" className="px-4 py-3 text-slate-600">{account.category}</td><td data-mobile-label="Saldo" className="px-4 py-3 text-right font-mono text-slate-700">{showBalance ? money(account.balance) : "••••"}</td><td data-mobile-label="Status" className="px-4 py-3 text-center"><div className="flex flex-wrap justify-center gap-1">{account.isSystem ? <StatusPill tone="gray">Sistem</StatusPill> : <StatusPill tone="cyan">Custom</StatusPill>}{account.isActive ? <StatusPill tone="emerald">Aktif</StatusPill> : <StatusPill tone="gray">Nonaktif</StatusPill>}</div></td></tr>)}</tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        ) : <EmptyState title="Belum ada akun" description="Akun akan muncul setelah chart of accounts dimuat dari Supabase." />}
      </Panel>

      {selectedAccount ? <AccountDetail account={selectedAccount} onEdit={openEdit} onArchive={(account) => void archiveAccount(account)} /> : null}

      <div className="rounded-lg bg-blue-50 p-4"><div className="flex items-start gap-3"><ScrollText className="mt-0.5 size-5 shrink-0 text-blue-600" /><div><p className="font-medium text-blue-800">Tentang Chart of Accounts</p><p className="mt-1 text-sm text-blue-700">COA tersimpan di tabel <code>chart_of_accounts</code>. Akun custom bisa ditambah, diubah, dan dinonaktifkan; akun sistem dikunci karena dipakai jurnal otomatis.</p></div></div></div>

      <AccountFormDialog open={showForm} account={editingAccount} form={form} setForm={setForm} onClose={() => setShowForm(false)} onSubmit={saveAccount} loading={loading} />
    </div>
  );
}
