"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  Users,
  Package,
  ShoppingCart,
  ReceiptText,
  BarChart3,
  Settings,
  ClipboardList,
  Building2,
  Calculator,
  UserPlus,
  Building,
  Warehouse,
  Tag,
  MapPin,
  Home,
  ChevronRight,
  Command,
  Star,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/components/ui";
import type { ErpWorkspace } from "@/lib/erp/types";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  href: string;
  category: string;
  isFavorite?: boolean;
  shortcut?: string;
}

interface CommandGroup {
  label: string;
  items: CommandItem[];
}

// ============================================================================
// COMMAND PALETTE - Ctrl+K Quick Access
// ============================================================================

export function CommandPalette({ workspace }: { workspace: ErpWorkspace }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Get favorites from localStorage
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    const stored = window.localStorage.getItem("erp-favorites");
    if (stored) {
      try {
        return JSON.parse(stored) as Record<string, boolean>;
      } catch {
        return {};
      }
    }
    return {};
  });

  // Build command items from workspace
  const commandItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // Navigation
      { id: "nav-dashboard", label: "Dashboard", icon: Home, href: "/dashboard", category: "Navigasi", shortcut: "G D" },
      { id: "nav-sales", label: "Penjualan", icon: ReceiptText, href: "/sales", category: "Navigasi" },
      { id: "nav-purchases", label: "Pembelian", icon: ShoppingCart, href: "/purchases", category: "Navigasi" },
      { id: "nav-inventory", label: "Stok & Inventory", icon: Package, href: "/inventory", category: "Navigasi" },
      { id: "nav-accounting", label: "Akuntansi", icon: Calculator, href: "/accounting", category: "Navigasi" },
      { id: "nav-reports", label: "Laporan", icon: BarChart3, href: "/reports", category: "Navigasi" },
      { id: "nav-hr", label: "HR & Payroll", icon: Users, href: "/hr", category: "Navigasi" },
      { id: "nav-tax", label: "Pajak", icon: FileText, href: "/tax", category: "Navigasi" },
      { id: "nav-settings", label: "Pengaturan", icon: Settings, href: "/settings", category: "Navigasi" },

      // Actions
      { id: "action-new-invoice", label: "Buat Invoice Baru", icon: ReceiptText, href: "/sales?action=new", category: "Aksi Cepat", shortcut: "N I" },
      { id: "action-new-bill", label: "Buat Purchase Bill", icon: ShoppingCart, href: "/purchases?action=new", category: "Aksi Cepat", shortcut: "N B" },
      { id: "action-new-product", label: "Tambah Produk", icon: Package, href: "/settings?tab=products&action=new", category: "Aksi Cepat", shortcut: "N P" },
      { id: "action-new-customer", label: "Tambah Customer", icon: Users, href: "/settings?tab=customers&action=new", category: "Aksi Cepat" },
      { id: "action-new-supplier", label: "Tambah Supplier", icon: Building2, href: "/settings?tab=suppliers&action=new", category: "Aksi Cepat" },
      { id: "action-payroll", label: "Proses Gaji", icon: Users, href: "/hr?action=payroll", category: "Aksi Cepat" },

      // Reports
      { id: "report-income", label: "Laporan Laba Rugi", icon: BarChart3, href: "/reports?type=income", category: "Laporan" },
      { id: "report-balance", label: "Laporan Neraca", icon: BarChart3, href: "/reports?type=balance", category: "Laporan" },
      { id: "report-ar", label: "Piutang (AR Aging)", icon: Users, href: "/reports?type=ar", category: "Laporan" },
      { id: "report-ap", label: "Utang (AP Aging)", icon: Building2, href: "/reports?type=ap", category: "Laporan" },
    ];

    // Add recent items from workspace
    const recentInvoices = workspace.salesInvoices.slice(-3).map((inv) => {
      const customer = workspace.customers.find((c) => c.id === inv.customerId);
      return {
        id: `inv-${inv.id}`,
        label: inv.invoiceNo,
        description: customer?.name || "Customer tidak ditemukan",
        icon: ReceiptText,
        href: `/sales?highlight=${inv.id}`,
        category: "Invoice Terbaru",
      };
    });

    const recentBills = workspace.purchaseBills.slice(-3).map((bill) => {
      const supplier = workspace.suppliers.find((s) => s.id === bill.supplierId);
      return {
        id: `bill-${bill.id}`,
        label: bill.billNo,
        description: supplier?.name || "Supplier tidak ditemukan",
        icon: ShoppingCart,
        href: `/purchases?highlight=${bill.id}`,
        category: "Bill Terbaru",
      };
    });

    return [...items, ...recentInvoices, ...recentBills];
  }, [workspace]);

  // Group items by category
  const groupedItems = useMemo<CommandGroup[]>(() => {
    const groups: Record<string, CommandItem[]> = {};

    commandItems.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push({
        ...item,
        isFavorite: favorites[item.id],
      });
    });

    // Sort groups: Favorites first, then navigation, then actions
    const groupOrder = ["Favorit", "Navigasi", "Aksi Cepat", "Laporan", "Invoice Terbaru", "Bill Terbaru"];

    return Object.entries(groups)
      .sort(([a], [b]) => {
        const aIdx = groupOrder.indexOf(a);
        const bIdx = groupOrder.indexOf(b);
        if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      })
      .map(([label, items]) => ({ label, items }));
  }, [commandItems, favorites]);

  // Filter by query
  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groupedItems;

    const lower = query.toLowerCase();
    return groupedItems
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(lower) ||
            item.description?.toLowerCase().includes(lower),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedItems, query]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => {
    return filteredGroups.flatMap((g) => g.items);
  }, [filteredGroups]);

  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Reset selection when filtered results change
  useEffect(() => {
    const timeout = window.setTimeout(() => setSelectedIndex(0), 0);
    return () => window.clearTimeout(timeout);
  }, [query]);

  // Navigate
  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      setOpen(false);
      setQuery("");
    },
    [router],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatItems[selectedIndex]) {
        e.preventDefault();
        navigate(flatItems[selectedIndex].href);
      }
    },
    [flatItems, selectedIndex, navigate],
  );

  // Toggle favorite
  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem("erp-favorites", JSON.stringify(next));
      return next;
    });
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Command Palette */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
          <Search className="size-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Ketik perintah atau cari..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
          />
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">
            <kbd className="rounded bg-white px-1.5 py-0.5 shadow-sm">ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <p className="text-sm">Tidak ada hasil untuk &quot;{query}&quot;</p>
            </div>
          ) : (
            filteredGroups.map((group, gi) => (
              <div key={group.label} className="py-1">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {group.label}
                </p>
                <div>
                  {group.items.map((item) => {
                    const flatIndex = flatItems.indexOf(item);
                    const isSelected = flatIndex === selectedIndex;
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                          isSelected ? "bg-slate-100" : "hover:bg-slate-50",
                        )}
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setSelectedIndex(flatIndex)}
                      >
                        <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          <Icon className="size-5" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-950">{item.label}</p>
                          {item.description && (
                            <p className="truncate text-xs text-slate-500">{item.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {item.shortcut && (
                            <kbd className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
                              {item.shortcut}
                            </kbd>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(item.id);
                            }}
                            className={cn(
                              "rounded-lg p-1.5 transition-colors",
                              item.isFavorite
                                ? "text-amber-500 hover:bg-amber-50"
                                : "text-slate-300 hover:bg-slate-100 hover:text-slate-500",
                            )}
                          >
                            <Star className="size-4" fill={item.isFavorite ? "currentColor" : "none"} />
                          </button>
                          {isSelected && (
                            <ChevronRight className="size-4 text-slate-400" aria-hidden />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">↑↓</kbd>
              <span>Navigasi</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">↵</kbd>
              <span>Pilih</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">⌘K</kbd>
              <span>Command Palette</span>
            </div>
          </div>
          <p className="text-slate-400">Valuintcorp ERP</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// KEYBOARD SHORTCUTS OVERLAY - Press ? to show
// ============================================================================

export function KeyboardShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { category: "Navigasi", items: [
      { keys: ["G", "D"], label: "Dashboard" },
      { keys: ["G", "S"], label: "Penjualan" },
      { keys: ["G", "P"], label: "Pembelian" },
      { keys: ["G", "I"], label: "Stok" },
      { keys: ["G", "A"], label: "Akuntansi" },
    ]},
    { category: "Aksi Cepat", items: [
      { keys: ["⌘", "K"], label: "Command Palette" },
      { keys: ["N", "I"], label: "Invoice Baru" },
      { keys: ["N", "B"], label: "Purchase Bill Baru" },
      { keys: ["?"], label: "Tampilkan Shortcuts" },
    ]},
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{item.label}</span>
                    <div className="flex gap-1">
                      {item.keys.map((key, i) => (
                        <kbd
                          key={i}
                          className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Import X for close button
import { X } from "lucide-react";
