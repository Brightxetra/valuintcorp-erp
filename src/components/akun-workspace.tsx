"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ScrollText,
  ChevronRight,
  Plus,
  ChevronDown,
  ChevronUp,
  Search,
  Eye,
  Edit,
  Trash2,
  Download,
  FolderOpen,
  FolderClosed,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  Building,
  TrendingUp,
  PieChart,
} from "lucide-react";
import {
  ActionButton,
  Panel,
  StatusPill,
  EmptyState,
  TextField,
  SelectField,
} from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";
import { money } from "@/lib/format";
import { getAccountTypeLabel } from "@/lib/translations";

// ============================================
// TIPE DATA
// ============================================
interface AccountNode {
  id: string;
  code: string;
  name: string;
  type: string;
  category: string;
  normalBalance: string;
  balance: number;
  isSystem: boolean;
  isActive: boolean;
  children?: AccountNode[];
}

// ============================================
// KOMPONEN TREE ITEM
// ============================================
interface TreeItemProps {
  node: AccountNode;
  level: number;
  expandedNodes: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: AccountNode) => void;
  selectedId?: string;
}

function AccountTreeItem({ node, level, expandedNodes, onToggle, onSelect, selectedId }: TreeItemProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition ${
          isSelected ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-50"
        }`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Toggle Icon */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="rounded p-1 hover:bg-slate-200"
          >
            {isExpanded ? (
              <ChevronDown className="size-4 text-slate-500" />
            ) : (
              <ChevronRight className="size-4 text-slate-500" />
            )}
          </button>
        ) : (
          <span className="size-4" />
        )}

        {/* Account Icon */}
        <span className={getTypeIconColor(node.type)}>
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="size-4" />
            ) : (
              <FolderClosed className="size-4" />
            )
          ) : (
            <CreditCard className="size-4" />
          )}
        </span>

        {/* Account Info */}
        <div className="flex flex-1 items-center gap-2">
          <span className="font-mono text-xs text-slate-400">{node.code}</span>
          <span className="flex-1 font-medium text-slate-950">{node.name}</span>
        </div>

        {/* Balance */}
        <span className={`font-mono text-sm ${node.balance >= 0 ? "text-slate-700" : "text-red-600"}`}>
          {node.balance >= 0 ? money(node.balance) : `(${money(Math.abs(node.balance))})`}
        </span>

        {/* Status */}
        {node.isSystem && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            Sistem
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <AccountTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Helper untuk icon color
function getTypeIconColor(type: string): string {
  const colors: Record<string, string> = {
    asset: "text-blue-600",
    liability: "text-red-600",
    equity: "text-purple-600",
    revenue: "text-emerald-600",
    expense: "text-amber-600",
    cost: "text-cyan-600",
  };
  return colors[type] || "text-slate-500";
}

// ============================================
// KOMPONEN DETAIL AKUN
// ============================================
interface AccountDetailProps {
  account: AccountNode;
  onClose: () => void;
}

function AccountDetail({ account, onClose }: AccountDetailProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${getTypeIconColor(account.type)} bg-slate-100`}>
            <CreditCard className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-950">{account.name}</h3>
            <p className="text-sm text-slate-500">{account.code}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          ✕
        </button>
      </div>

      {/* Info */}
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-500">Tipe Akun</p>
          <p className="font-medium">{getAccountTypeLabel(account.type)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Kategori</p>
          <p className="font-medium">{account.category}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Sifat Saldo Normal</p>
          <p className="font-medium">{account.normalBalance === "debit" ? "Debet" : "Kredit"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Saldo</p>
          <p className="text-xl font-bold text-slate-950">{money(account.balance)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-slate-200 p-4">
        <ActionButton variant="secondary">
          <Eye className="size-4" /> Lihat Transaksi
        </ActionButton>
        {!account.isSystem && (
          <>
            <ActionButton variant="secondary">
              <Edit className="size-4" /> Ubah
            </ActionButton>
            <ActionButton variant="danger">
              <Trash2 className="size-4" /> Hapus
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================
// KOMPONEN RINGKASAN PER TIPE
// ============================================
interface SummaryByTypeProps {
  accounts: AccountNode[];
}

function SummaryByType({ accounts }: SummaryByTypeProps) {
  const typeSummary = accounts.reduce((acc, account) => {
    if (!acc[account.type]) {
      acc[account.type] = 0;
    }
    acc[account.type] += account.balance;
    return acc;
  }, {} as Record<string, number>);

  const typeInfo: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    asset: { label: "AKTIVA", icon: Banknote, color: "text-blue-700 bg-blue-50" },
    liability: { label: "KEWAJIBAN", icon: Building, color: "text-red-700 bg-red-50" },
    equity: { label: "MODAL", icon: PieChart, color: "text-purple-700 bg-purple-50" },
    revenue: { label: "PENDAPATAN", icon: TrendingUp, color: "text-emerald-700 bg-emerald-50" },
    expense: { label: "BEBAN", icon: PieChart, color: "text-amber-700 bg-amber-50" },
    cost: { label: "HPP", icon: PieChart, color: "text-cyan-700 bg-cyan-50" },
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {Object.entries(typeSummary).map(([type, total]) => {
        const info = typeInfo[type] || { label: type, icon: CreditCard, color: "text-slate-700 bg-slate-50" };
        const Icon = info.icon;
        return (
          <div key={type} className={`rounded-lg p-3 ${info.color}`}>
            <div className="flex items-center gap-2">
              <Icon className="size-4" />
              <span className="text-xs font-medium">{info.label}</span>
            </div>
            <p className="mt-1 font-mono text-sm font-semibold">{money(total)}</p>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// WORKSPACE UTAMA
// ============================================
export function AkunWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace } = useErpWorkspace(initialWorkspace);
  const [search, setSearch] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["1-1000", "2-1000", "3-1000", "4-1000", "5-1000", "6-1000"]));
  const [selectedAccount, setSelectedAccount] = useState<AccountNode | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [showBalance, setShowBalance] = useState(true);

  // Buat tree dari data
  const buildAccountTree = (): AccountNode[] => {
    // Sistem akun default
    const systemAccounts = [
      { id: "1-1000", code: "1-1000", name: "Kas & Bank", type: "asset", category: "cash", normalBalance: "debit", balance: 45_500_000, isSystem: true, isActive: true },
      { id: "1-1101", code: "1-1101", name: "Kas Tunai", type: "asset", category: "cash", normalBalance: "debit", balance: 15_000_000, isSystem: true, isActive: true },
      { id: "1-1102", code: "1-1102", name: "Bank BCA", type: "asset", category: "cash", normalBalance: "debit", balance: 25_000_000, isSystem: true, isActive: true },
      { id: "1-1103", code: "1-1103", name: "Bank Mandiri", type: "asset", category: "cash", normalBalance: "debit", balance: 5_500_000, isSystem: true, isActive: true },
      { id: "1-1200", code: "1-1200", name: "Piutang", type: "asset", category: "receivable", normalBalance: "debit", balance: 25_000_000, isSystem: true, isActive: true },
      { id: "1-1201", code: "1-1201", name: "Piutang Usaha", type: "asset", category: "receivable", normalBalance: "debit", balance: 25_000_000, isSystem: true, isActive: true },
      { id: "1-1300", code: "1-1300", name: "Persediaan", type: "asset", category: "inventory", normalBalance: "debit", balance: 30_000_000, isSystem: true, isActive: true },
      { id: "1-1301", code: "1-1301", name: "Persediaan Barang", type: "asset", category: "inventory", normalBalance: "debit", balance: 30_000_000, isSystem: true, isActive: true },
      { id: "2-1000", code: "2-1000", name: "Utang", type: "liability", category: "payable", normalBalance: "credit", balance: 16_200_000, isSystem: true, isActive: true },
      { id: "2-1101", code: "2-1101", name: "Utang Usaha", type: "liability", category: "payable", normalBalance: "credit", balance: 15_000_000, isSystem: true, isActive: true },
      { id: "2-1201", code: "2-1201", name: "Utang Gaji", type: "liability", category: "salary_payable", normalBalance: "credit", balance: 1_200_000, isSystem: true, isActive: true },
      { id: "2-1202", code: "2-1202", name: "Hutang PPN", type: "liability", category: "tax_payable", normalBalance: "credit", balance: 0, isSystem: true, isActive: true },
      { id: "3-1000", code: "3-1000", name: "Modal", type: "equity", category: "owner_capital", normalBalance: "credit", balance: 70_300_000, isSystem: true, isActive: true },
      { id: "3-1101", code: "3-1101", name: "Modal Utama", type: "equity", category: "owner_capital", normalBalance: "credit", balance: 50_000_000, isSystem: true, isActive: true },
      { id: "3-2101", code: "3-2101", name: "Laba Ditahan", type: "equity", category: "retained_earnings", normalBalance: "credit", balance: 20_300_000, isSystem: true, isActive: true },
      { id: "4-1000", code: "4-1000", name: "Pendapatan", type: "revenue", category: "sales_revenue", normalBalance: "credit", balance: 85_000_000, isSystem: true, isActive: true },
      { id: "4-1101", code: "4-1101", name: "Penjualan", type: "revenue", category: "sales_revenue", normalBalance: "credit", balance: 85_000_000, isSystem: true, isActive: true },
      { id: "5-1000", code: "5-1000", name: "Beban", type: "expense", category: "operating_expense", normalBalance: "debit", balance: 34_000_000, isSystem: true, isActive: true },
      { id: "5-1101", code: "5-1101", name: "Harga Pokok Penjualan", type: "cost", category: "cogs", normalBalance: "debit", balance: 50_000_000, isSystem: true, isActive: true },
      { id: "5-1102", code: "5-1102", name: "Beban Gaji", type: "expense", category: "payroll_expense", normalBalance: "debit", balance: 15_000_000, isSystem: true, isActive: true },
      { id: "5-1103", code: "5-1103", name: "Beban Sewa", type: "expense", category: "operating_expense", normalBalance: "debit", balance: 3_000_000, isSystem: true, isActive: true },
      { id: "5-1104", code: "5-1104", name: "Beban Listrik & Air", type: "expense", category: "operating_expense", normalBalance: "debit", balance: 1_000_000, isSystem: true, isActive: true },
      { id: "5-1105", code: "5-1105", name: "Beban Lainnya", type: "expense", category: "other_expense", normalBalance: "debit", balance: 0, isSystem: true, isActive: true },
    ];

    // Filter berdasarkan search
    const filtered = search.trim()
      ? systemAccounts.filter(
          (a) =>
            a.name.toLowerCase().includes(search.toLowerCase()) ||
            a.code.includes(search)
        )
      : systemAccounts;

    // Build tree structure
    const tree: AccountNode[] = [];
    const nodeMap = new Map<string, AccountNode>();

    filtered.forEach((account) => {
      nodeMap.set(account.id, { ...account, children: [] });
    });

    filtered.forEach((account) => {
      const node = nodeMap.get(account.id)!;
      const parentId = account.id.split("-")[0] + "-000";

      if (nodeMap.has(parentId) && account.id !== parentId) {
        nodeMap.get(parentId)!.children!.push(node);
      } else if (!account.id.endsWith("000")) {
        tree.push(node);
      }
    });

    return tree;
  };

  const accountTree = buildAccountTree();

  function toggleNode(id: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedNodes(new Set(accountTree.map((a) => a.id)));
  }

  function collapseAll() {
    setExpandedNodes(new Set());
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">📈 Daftar Akun (COA)</h1>
          <p className="mt-1 text-slate-600">Kelola chart of accounts dan lihat saldo setiap akun</p>
        </div>
        <div className="flex gap-2">
          <ActionButton variant="secondary">
            <Download className="size-4" /> Export
          </ActionButton>
          <ActionButton>
            <Plus className="size-4" /> Tambah Akun Baru
          </ActionButton>
        </div>
      </div>

      {/* RINGKASAN PER TIPE */}
      <SummaryByType accounts={accountTree} />

      {/* PENCARIAN & FILTER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode akun atau nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-4 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showBalance}
              onChange={() => setShowBalance(!showBalance)}
              className="size-4 rounded border-slate-300 text-emerald-600"
            />
            Tampilkan Saldo
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlyActive}
              onChange={() => setShowOnlyActive(!showOnlyActive)}
              className="size-4 rounded border-slate-300 text-emerald-600"
            />
            Aktif saja
          </label>
          <button
            type="button"
            onClick={expandAll}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* TREE VIEW */}
      <Panel
        title="Struktur Akun"
        description="Klik untuk expand/collapse, atau klik nama akun untuk melihat detail"
      >
        <div className="space-y-1">
          {accountTree.map((node) => (
            <AccountTreeItem
              key={node.id}
              node={node}
              level={0}
              expandedNodes={expandedNodes}
              onToggle={toggleNode}
              onSelect={setSelectedAccount}
              selectedId={selectedAccount?.id}
            />
          ))}
        </div>
      </Panel>

      {/* DETAIL PANEL */}
      {selectedAccount && (
        <AccountDetail account={selectedAccount} onClose={() => setSelectedAccount(null)} />
      )}

      {/* INFO */}
      <div className="rounded-lg bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <ScrollText className="mt-0.5 size-5 shrink-0 text-blue-600" />
          <div>
            <p className="font-medium text-blue-800">Tentang Chart of Accounts (COA)</p>
            <ul className="mt-2 space-y-1 text-sm text-blue-700">
              <li>• <strong>AKTIVA (1xxx):</strong> Aset seperti kas, piutang, persediaan, aset tetap</li>
              <li>• <strong>KEWAJIBAN (2xxx):</strong> Hutang seperti utang usaha, utang gaji, utang pajak</li>
              <li>• <strong>MODAL (3xxx):</strong> Ekuitas seperti modal pemilik, laba ditahan</li>
              <li>• <strong>PENDAPATAN (4xxx):</strong> Semua income/penjualan</li>
              <li>• <strong>BEBAN (5xxx):</strong> Biaya operasional, HPP, pajak</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}