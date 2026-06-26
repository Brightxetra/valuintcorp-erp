"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  Bell,
  BookOpenCheck,
  Boxes,
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileBarChart,
  FileText,
  Home,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  Star,
  ShoppingBag,
  User,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/components/ui";
import { ErpWorkspaceProvider, useErpWorkspace } from "@/components/erp-context";
import { notify } from "@/lib/notify";
import { getMostSpecificActiveHref, pathMatchesHref } from "@/lib/navigation/active-link";
import type { ErpWorkspace } from "@/lib/erp/types";
import { posExperienceForPermissions, type Permission } from "@/lib/security/permissions";
import { browserIdleSessionExpired, clearServerSession, touchServerSessionActivity } from "@/lib/erp/client-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// ============================================================================
// NAVIGATION CONFIGURATION
// ============================================================================

// Navigasi BARU yang intuitif - bahasa sehari-hari Indonesia
const navGroups = [
  {
    label: "📊 Beranda",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "business:read" as Permission },
    ],
  },
  {
    label: "💰 Transaksi",
    items: [
      { href: "/transaksi/invoice", label: "Invoice Penjualan", icon: ReceiptText, permission: "accounting:write" as Permission },
      { href: "/transaksi/tagihan", label: "Tagihan Supplier", icon: ShoppingCart, permission: "accounting:write" as Permission },
      { href: "/transaksi/kas", label: "Kas & Bank", icon: Building2, permission: "accounting:write" as Permission },
    ],
    defaultOpen: true,
  },
  {
    label: "POS Cabang",
    items: [
      { href: "/pos", label: "Kasir & Rekap Cabang", icon: ShoppingBag, permission: "pos:read" as Permission },
    ],
    defaultOpen: true,
  },
  {
    label: "📦 Produk",
    items: [
      { href: "/produk/stok", label: "Stok & Persediaan", icon: Boxes, permission: "inventory:manage" as Permission },
      { href: "/produk/harga", label: "Daftar Harga", icon: FileText, permission: "inventory:manage" as Permission },
    ],
  },
  {
    label: "👥 Karyawan & Gaji",
    items: [
      { href: "/karyawan", label: "Data Karyawan", icon: UsersRound, permission: "hr:manage" as Permission },
      { href: "/karyawan/gaji", label: "Hitung Gaji", icon: Calculator, permission: "hr:manage" as Permission },
      { href: "/karyawan/bpjs", label: "BPJS Kesehatan", icon: UsersRound, permission: "hr:manage" as Permission },
    ],
  },
  {
    label: "📈 Keuangan",
    items: [
      { href: "/keuangan/akun", label: "Daftar Akun", icon: BookOpenCheck, permission: "accounting:read" as Permission },
      { href: "/keuangan/jurnal", label: "Catatan Jurnal", icon: FileBarChart, permission: "accounting:write" as Permission },
      { href: "/keuangan/aset", label: "Aset Tetap", icon: Building2, permission: "accounting:read" as Permission },
      { href: "/keuangan/laporan", label: "Laporan Keuangan", icon: FileBarChart, permission: "reports:export" as Permission },
    ],
  },
  {
    label: "📋 Pengaturan",
    items: [
      { href: "/settings", label: "Pengaturan", icon: Settings, permission: "business:read" as Permission },
    ],
  },
];

const mobileNav = [
  { href: "/dashboard", label: "Beranda", icon: Home, permission: "business:read" as Permission },
  { href: "/pos", label: "POS", icon: ShoppingBag, permission: "pos:read" as Permission },
  { href: "/transaksi/invoice", label: "Invoice", icon: ReceiptText, permission: "accounting:write" as Permission },
  { href: "/karyawan", label: "Karyawan", icon: UsersRound, permission: "hr:manage" as Permission },
  { href: "/keuangan/aset", label: "Aset", icon: Building2, permission: "accounting:read" as Permission },
  { href: "/settings", label: "Lainnya", icon: Menu, permission: "business:read" as Permission },
];

// ============================================================================
// FAVORITES SYSTEM
// ============================================================================

interface FavoriteItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
}

function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = window.localStorage.getItem("erp-favorites-nav");
    if (stored) {
      try {
        return JSON.parse(stored) as FavoriteItem[];
      } catch {
        return [];
      }
    }
    return [];
  });
  const favoritesRef = useRef(favorites);

  const toggleFavorite = useCallback((item: FavoriteItem) => {
    const exists = favoritesRef.current.some((favorite) => favorite.id === item.id);
    const next = exists
      ? favoritesRef.current.filter((favorite) => favorite.id !== item.id)
      : [...favoritesRef.current, item];

    favoritesRef.current = next;
    localStorage.setItem("erp-favorites-nav", JSON.stringify(next));
    setFavorites(next);

    if (exists) {
      notify.info("Dihapus dari favorit", { description: item.label });
    } else {
      notify.success("Ditambahkan ke favorit", { description: item.label });
    }
  }, []);

  const isFavorite = useCallback((id: string) => favorites.some((f) => f.id === id), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}

// ============================================================================
// COMMAND PALETTE
// ============================================================================

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  href: string;
  category: string;
  shortcut?: string;
}

function CommandPalette({ workspace, onClose }: { workspace: ErpWorkspace; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  const commandItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      { id: "nav-dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", category: "Navigasi", shortcut: "G D" },
      { id: "nav-sales", label: "Penjualan", icon: ReceiptText, href: "/sales", category: "Navigasi" },
      { id: "nav-purchases", label: "Pembelian", icon: ShoppingCart, href: "/purchases", category: "Navigasi" },
      { id: "nav-inventory", label: "Stok", icon: Boxes, href: "/inventory", category: "Navigasi" },
      { id: "nav-accounting", label: "Akuntansi", icon: BookOpenCheck, href: "/accounting", category: "Navigasi" },
      { id: "nav-fixed-assets", label: "Aset Tetap", icon: Building2, href: "/keuangan/aset", category: "Navigasi" },
      { id: "nav-reports", label: "Laporan", icon: FileBarChart, href: "/reports", category: "Navigasi" },
      { id: "nav-hr", label: "HR & Payroll", icon: UsersRound, href: "/hr", category: "Navigasi" },
      { id: "nav-tax", label: "Pajak", icon: Landmark, href: "/tax", category: "Navigasi" },
      { id: "nav-settings", label: "Pengaturan", icon: Settings, href: "/settings", category: "Navigasi" },
      { id: "nav-pos", label: "POS Cabang", icon: ShoppingBag, href: "/pos", category: "Navigasi" },
      { id: "action-new-invoice", label: "Buat Invoice Baru", icon: PackagePlus, href: "/sales?action=new", category: "Aksi Cepat", shortcut: "N I" },
      { id: "action-new-bill", label: "Buat Purchase Bill", icon: ShoppingCart, href: "/purchases?action=new", category: "Aksi Cepat", shortcut: "N B" },
      { id: "action-new-product", label: "Tambah Produk", icon: Boxes, href: "/settings?tab=products&action=new", category: "Aksi Cepat" },
    ];

    workspace.salesInvoices.slice(-5).forEach((inv) => {
      const customer = workspace.customers.find((c) => c.id === inv.customerId);
      items.push({
        id: `inv-${inv.id}`,
        label: inv.invoiceNo,
        description: customer?.name || "Customer",
        icon: ReceiptText,
        href: `/sales?highlight=${inv.id}`,
        category: "Invoice Terbaru",
      });
    });

    const permissionForItem = (item: CommandItem): Permission => {
      if (item.id.includes("pos")) return "pos:read";
      if (item.id.includes("inventory") || item.id.includes("product")) return "inventory:manage";
      if (item.id.includes("reports")) return "reports:export";
      if (item.id.includes("hr")) return "hr:manage";
      if (item.id.includes("tax")) return "tax:prepare";
      if (item.id.includes("accounting") || item.id.includes("fixed-assets")) return "accounting:read";
      if (item.id.includes("sales") || item.id.includes("purchases") || item.id.includes("invoice") || item.id.includes("bill")) return "accounting:write";
      return "business:read";
    };
    return items.filter((item) => workspace.permissions.includes(permissionForItem(item)));
  }, [workspace]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};

    const favItems = favorites.map((f) => ({ ...f, category: "Favorit" } as CommandItem));
    if (favItems.length > 0) groups["Favorit"] = favItems;

    commandItems.forEach((item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push({ ...item, isFavorite: isFavorite(item.id) } as CommandItem);
    });

    return Object.entries(groups);
  }, [commandItems, favorites, isFavorite]);

  const filteredGroups = useMemo((): { label: string; items: CommandItem[] }[] => {
    if (!query.trim()) {
      return groupedItems.map(([label, items]) => ({ label, items }));
    }
    const lower = query.toLowerCase();
    return groupedItems
      .map(([label, items]) => ({
        label,
        items: items.filter(
          (item) =>
            item.label.toLowerCase().includes(lower) ||
            item.description?.toLowerCase().includes(lower)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedItems, query]);

  const flatItems = useMemo(() => filteredGroups.flatMap((g) => g.items), [filteredGroups]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSelectedIndex(0), 0);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
    setQuery("");
  }, [router, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIndex]) {
      navigate(flatItems[selectedIndex].href);
    }
  }, [flatItems, selectedIndex, navigate]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[max(1rem,12vh)]">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Search */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
          <Search className="size-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Cari menu, aksi, atau data..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">ESC</kbd>
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <p className="text-sm">Tidak ada hasil untuk &quot;{query}&quot;</p>
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.label} className="py-1">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const flatIndex = flatItems.indexOf(item);
                  const selected = flatIndex === selectedIndex;
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors cursor-pointer",
                        selected ? "bg-slate-100" : "hover:bg-slate-50"
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
                          aria-label={
                            isFavorite(item.id)
                              ? `Hapus ${item.label} dari favorit`
                              : `Tambah ${item.label} ke favorit`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite({ id: item.id, label: item.label, icon: item.icon, href: item.href });
                          }}
                          className={cn(
                            "rounded-lg p-1.5 transition-colors",
                            isFavorite(item.id)
                              ? "text-amber-500 hover:bg-amber-50"
                              : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                          )}
                        >
                          <Star className="size-4" fill={isFavorite(item.id) ? "currentColor" : "none"} />
                        </button>
                        {selected && <ChevronRight className="size-4 text-slate-400" aria-hidden />}
                      </div>
                    </div>
                  );
                })}
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
          </div>
          <span className="font-medium text-slate-700">Valuintcorp</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// KEYBOARD SHORTCUTS OVERLAY
// ============================================================================

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
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
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Navigasi</h3>
            <div className="space-y-2">
              {[
                { keys: ["G", "D"], label: "Dashboard" },
                { keys: ["G", "S"], label: "Penjualan" },
                { keys: ["G", "P"], label: "Pembelian" },
                { keys: ["G", "I"], label: "Stok" },
                { keys: ["G", "A"], label: "Akuntansi" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{item.label}</span>
                  <div className="flex gap-1">
                    {item.keys.map((key, i) => (
                      <kbd key={i} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{key}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Aksi Cepat</h3>
            <div className="space-y-2">
              {[
                { keys: ["⌘", "K"], label: "Command Palette" },
                { keys: ["N", "I"], label: "Invoice Baru" },
                { keys: ["N", "B"], label: "Bill Baru" },
                { keys: ["?"], label: "Tampilkan Shortcuts" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{item.label}</span>
                  <div className="flex gap-1">
                    {item.keys.map((key, i) => (
                      <kbd key={i} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{key}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NAVIGATION COMPONENTS
// ============================================================================

function isActive(pathname: string, href: string) {
  return pathMatchesHref(pathname, href);
}

function NavLinks({ workspace, onNavigate }: {
  workspace: ErpWorkspace;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const permissions = new Set(workspace.permissions);
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const visibleNavigationItems = navGroups.flatMap((group) =>
    group.items.filter((item) => permissions.has(item.permission)),
  );
  const activeNavigationHref = getMostSpecificActiveHref(
    pathname,
    visibleNavigationItems.map((item) => item.href),
  );
  const hasActiveFavorite = favorites.some((item) => item.href === activeNavigationHref);

  return (
    <nav className="space-y-6">
      {/* Favorites Section */}
      {favorites.length > 0 && (
        <div>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Favorit</p>
          <div className="space-y-1">
            {favorites.map((item) => {
              const active = item.href === activeNavigationHref;
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                  <button
                    type="button"
                    aria-label={`Hapus ${item.label} dari favorit`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFavorite(item);
                    }}
                    className="ml-auto rounded-lg p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-200"
                  >
                    <X className="size-3 text-slate-500" />
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation Groups */}
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>
          <div className="space-y-1">
            {group.items.filter((item) => permissions.has(item.permission)).map((item) => {
              const active = !hasActiveFavorite && item.href === activeNavigationHref;
              const Icon = item.icon;
              const favId = `nav-${item.href}`;
              const isFav = isFavorite(favId);

              return (
                <div key={item.href} className="group relative">
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                  <button
                    type="button"
                    aria-label={
                      isFav
                        ? `Hapus ${item.label} dari favorit`
                        : `Tambah ${item.label} ke favorit`
                    }
                    onClick={() => {
                      toggleFavorite({
                        id: favId,
                        label: item.label,
                        icon: item.icon,
                        href: item.href,
                      });
                    }}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-all",
                      isFav ? "text-amber-500 opacity-100" : "text-slate-300 opacity-0 hover:bg-slate-200 hover:text-slate-500 group-hover:opacity-100"
                    )}
                  >
                    <Star className="size-4" fill={isFav ? "currentColor" : "none"} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

// ============================================================================
// MAIN APP SHELL
// ============================================================================

export function AppShell({ children, workspace }: { children: React.ReactNode; workspace: ErpWorkspace }) {
  return (
    <ErpWorkspaceProvider initialWorkspace={workspace}>
      <AppShellChrome>{children}</AppShellChrome>
    </ErpWorkspaceProvider>
  );
}

function AppShellChrome({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, businesses, activeBusinessId, setActiveBusinessId, demoMode, demoAccount, runtimeMode } = useErpWorkspace();

  const business = workspace.business;
  const period = workspace.period;
  const user = workspace.user;
  const taskCount = workspace.tasks.length;
  const posExperience = posExperienceForPermissions(workspace.permissions);
  const isPosFocusedShell = posExperience !== "erp";
  const posRoleLabel =
    posExperience === "supervisor"
      ? "Supervisor cabang"
      : posExperience === "cashier"
        ? "Kasir cabang"
        : "Akses POS cabang";
  const branchSummary = useMemo(() => {
    if (workspace.locations.length === 0) return "Cabang belum ditugaskan";
    if (workspace.locations.length === 1) return workspace.locations[0]?.name ?? "1 cabang";
    return `${workspace.locations.length} cabang ditugaskan`;
  }, [workspace.locations]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPosFocusedShell) {
        if (e.key === "Escape") {
          setAccountMenuOpen(false);
          setSidebarOpen(false);
        }
        return;
      }

      // Command Palette: Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      // Shortcuts overlay: ?
      if (e.key === "?" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
      // Close modals on Escape
      if (e.key === "Escape") {
        setCommandOpen(false);
        setShortcutsOpen(false);
        setSidebarOpen(false);
        setNotificationOpen(false);
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPosFocusedShell]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (demoMode) return undefined;

    let ended = false;

    async function endExpiredSession() {
      if (ended) return;
      ended = true;
      await createBrowserSupabaseClient().auth.signOut().catch(() => undefined);
      await clearServerSession();
      router.push("/login?reason=session-expired");
    }

    function handleActivity() {
      void touchServerSessionActivity().then((active) => {
        if (!active) void endExpiredSession();
      });
    }

    const activityEvents = ["click", "keydown", "pointerdown", "scroll", "touchstart"] as const;

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }

    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        if (browserIdleSessionExpired()) {
          void endExpiredSession();
        } else {
          handleActivity();
        }
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    const timer = window.setInterval(() => {
      if (browserIdleSessionExpired()) {
        void endExpiredSession();
      }
    }, 30_000);

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener("visibilitychange", visibilityHandler);
      window.clearInterval(timer);
    };
  }, [demoMode, router]);

  useEffect(() => {
    if (isPosFocusedShell && !isActive(pathname, "/pos")) {
      router.replace("/pos");
    }
  }, [isPosFocusedShell, pathname, router]);

  async function signOut() {
    setAccountMenuOpen(false);

    if (!demoMode) {
      await createBrowserSupabaseClient().auth.signOut();
    }

    await clearServerSession();
    router.push("/login");
  }

  if (isPosFocusedShell) {
    return (
      <div className="min-h-dvh bg-slate-100 text-slate-950">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <Link href="/pos" className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                <ShoppingBag className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-950">Valuintcorp POS</span>
                <span className="block truncate text-xs text-slate-500">{business.displayName}</span>
              </div>
            </Link>

            <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex" aria-label="Status POS">
              <span className="truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                {branchSummary}
              </span>
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", period.locked ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100")}>
                <span className={cn("size-2 rounded-full", period.locked ? "bg-red-500" : "bg-emerald-500")} aria-hidden />
                {period.label}
              </span>
              {runtimeMode !== "production" ? (
                <span className="rounded-full bg-cyan-50 px-3 py-1.5 text-sm font-medium text-cyan-700">
                  {demoMode ? "Demo" : demoAccount ? "Demo Supabase" : runtimeMode}
                </span>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((open) => !open)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                aria-label="Menu akun POS"
                aria-expanded={accountMenuOpen}
              >
                <User className="size-5" aria-hidden />
                <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{user.name}</span>
                <ChevronDown className="size-4" aria-hidden />
              </button>

              {accountMenuOpen ? (
                <div className="absolute right-0 top-12 z-50 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="border-b border-slate-100 px-2 pb-3">
                    <p className="truncate text-sm font-semibold text-slate-950">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email || user.role}</p>
                    <p className="mt-1 text-xs text-slate-500">{posRoleLabel} - {business.displayName}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void signOut();
                    }}
                    className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="size-4" aria-hidden />
                    Keluar
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4 lg:px-6 lg:pb-10">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 md:hidden">
            <span className="rounded-full bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200">{branchSummary}</span>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-medium", period.locked ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100")}>
              <span className={cn("size-2 rounded-full", period.locked ? "bg-red-500" : "bg-emerald-500")} aria-hidden />
              {period.label}
            </span>
          </div>

          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="erp-mobile-shell min-h-screen bg-slate-50 text-slate-950">
      {/* ============================================================================
          HEADER - Premium Top Bar
          ============================================================================ */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
          {/* Logo & Business */}
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-700 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
                ET
              </div>
              <div className="min-w-0 hidden sm:block">
                <span className="block truncate text-sm font-semibold text-slate-950">Valuintcorp</span>
                <span className="block truncate text-xs text-slate-500">{business.displayName}</span>
              </div>
            </Link>
          </div>

          {/* Search Bar - Desktop */}
          <div className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex w-full max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-100"
            >
              <Search className="size-4" aria-hidden />
              <span className="flex-1 text-left">Cari menu atau data...</span>
              <div className="flex items-center gap-1">
                <kbd className="rounded bg-white px-1.5 py-0.5 text-xs shadow-sm">⌘</kbd>
                <kbd className="rounded bg-white px-1.5 py-0.5 text-xs shadow-sm">K</kbd>
              </div>
            </button>
          </div>

          {/* Mobile Search Button */}
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-700 lg:hidden"
            aria-label="Search"
          >
            <Search className="size-5" aria-hidden />
          </button>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Quick Actions - Desktop */}
            {workspace.permissions.includes("accounting:write") ? (
              <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/sales?action=new"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                <PackagePlus className="size-4" aria-hidden />
                <span className="hidden md:inline">Invoice</span>
              </Link>
              <Link
                href="/purchases?action=new"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Bill
              </Link>
              </div>
            ) : null}

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationOpen((open) => !open);
                  setAccountMenuOpen(false);
                }}
                className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 transition-colors hover:bg-slate-50"
                aria-label="Notifikasi"
                aria-expanded={notificationOpen}
              >
                <Bell className="size-5" aria-hidden />
                {taskCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {taskCount > 9 ? "9+" : taskCount}
                  </span>
                )}
              </button>

              {notificationOpen ? (
                <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-2 pb-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Notifikasi & tugas</p>
                      <p className="text-xs text-slate-500">{taskCount} tugas aktif</p>
                    </div>
                    <Link
                      href="/dashboard"
                      onClick={() => setNotificationOpen(false)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      Lihat dashboard
                    </Link>
                  </div>

                  <div className="max-h-96 overflow-y-auto py-2">
                    {workspace.tasks.length > 0 ? (
                      <div className="space-y-2">
                        {workspace.tasks.slice(0, 6).map((task) => (
                          <div key={task.id} className="rounded-xl border border-slate-100 p-3">
                            <div className="flex items-start gap-3">
                              <div
                                className={cn(
                                  "mt-0.5 size-2 rounded-full",
                                  task.severity === "critical" ? "bg-red-500" : task.severity === "warning" ? "bg-amber-500" : "bg-cyan-500",
                                )}
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-950">{task.title}</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">{task.description}</p>
                                {task.dueDate ? (
                                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400">
                                    <Clock3 className="size-3" aria-hidden />
                                    {task.dueDate}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Belum ada tugas prioritas.</p>
                    )}

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Aktivitas terbaru</p>
                      <div className="mt-2 space-y-2">
                        {workspace.activities.slice(0, 4).map((activity) => (
                          <div key={activity.id} className="rounded-xl bg-slate-50 p-3">
                            <p className="text-xs font-medium text-slate-700">{activity.action}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{activity.description}</p>
                          </div>
                        ))}
                        {workspace.activities.length === 0 ? (
                          <p className="px-2 text-sm text-slate-500">Belum ada aktivitas terbaru.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* User & Business - Desktop */}
            <div className="hidden items-center gap-2 md:flex">
              {businesses.length > 1 && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <Building2 className="size-4 text-slate-500" aria-hidden />
                  <select
                    aria-label="Pilih bisnis"
                    value={activeBusinessId}
                    onChange={(e) => setActiveBusinessId(e.target.value)}
                    className="bg-transparent text-sm outline-none"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>{b.displayName}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <div className={cn("flex size-2 rounded-full", period.locked ? "bg-red-500" : "bg-emerald-500")} aria-hidden />
                <span className="text-sm text-slate-600">{period.label}</span>
              </div>
            </div>

            {/* Account Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen((open) => !open);
                  setNotificationOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50 md:px-3"
                aria-label="Menu akun"
                aria-expanded={accountMenuOpen}
              >
                <User className="size-5" aria-hidden />
                <span className="hidden text-sm font-medium md:inline">Akun</span>
                <ChevronDown className="hidden size-4 md:inline" aria-hidden />
              </button>

              {accountMenuOpen ? (
                <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="border-b border-slate-100 px-2 pb-3">
                    <p className="truncate text-sm font-semibold text-slate-950">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email || user.role}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {demoMode ? "Demo fallback lokal" : demoAccount ? "Akun demo Supabase" : "Akun production"}
                    </p>
                  </div>

                  <div className="mt-2 space-y-1">
                    <Link
                      href="/settings"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Settings className="size-4" aria-hidden />
                      Pengaturan akun & bisnis
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        void signOut();
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      <LogOut className="size-4" aria-hidden />
                      Keluar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================================
          MAIN CONTENT
          ============================================================================ */}
      <div className="erp-mobile-shell-content mx-auto max-w-[1600px] px-4 pt-6 pb-[var(--erp-mobile-content-clearance)] lg:px-6 lg:pb-24">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* ============================================================================
              SIDEBAR - Desktop
              ============================================================================ */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {/* User Info Card */}
              <div className="mb-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                    {user.name?.charAt(0) || "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-white/60">{user.role}</p>
                  </div>
                </div>
                {runtimeMode !== "production" && (
                  <div
                    className={cn(
                      "mt-3 rounded-lg px-3 py-2 text-xs font-medium",
                      demoMode ? "bg-amber-500/20 text-amber-300" : "bg-cyan-500/20 text-cyan-200",
                    )}
                  >
                    {demoMode ? "Mode fallback - data contoh lokal" : "Akun demo - sandbox Supabase"}
                  </div>
                )}
              </div>

              <NavLinks workspace={workspace} />
            </div>
          </aside>

          {/* Main Content */}
          <main className="min-w-0 space-y-6">
            {demoAccount && (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="size-5 shrink-0 text-cyan-600" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-cyan-800">Akun demo Supabase aktif</p>
                    <p className="mt-1 text-sm text-cyan-700">
                      {`Data sandbox akan reset ${workspace.demoSandbox?.nextResetAt ? `pada ${new Date(workspace.demoSandbox.nextResetAt).toLocaleString("id-ID")}` : "sesuai jadwal demo"}.`}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>

      {/* ============================================================================
          MOBILE BOTTOM NAVIGATION
          ============================================================================ */}
      <nav className="erp-mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white lg:hidden">
        <div className="grid grid-cols-5">
          {mobileNav.filter((item) => workspace.permissions.includes(item.permission)).slice(0, 5).map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-3 text-[11px] font-medium transition-colors",
                  active ? "text-slate-950" : "text-slate-500"
                )}
              >
                <Icon className={cn("size-5", active && "text-blue-600")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ============================================================================
          MOBILE SIDEBAR DRAWER
          ============================================================================ */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setSidebarOpen(false)} />
          <aside className="erp-mobile-drawer absolute left-0 top-0 h-full w-[85vw] max-w-sm overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
                  ET
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">Menu</p>
                  <p className="text-xs text-slate-500">{business.displayName}</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2 text-slate-600"
                onClick={() => setSidebarOpen(false)}
                aria-label="Tutup"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="p-4">
              <div className="mb-6 rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">{user.name}</p>
                <p className="mt-1 text-xs text-slate-500">{user.role} • {business.displayName}</p>
              </div>

              <NavLinks workspace={workspace} onNavigate={() => setSidebarOpen(false)} />

              {workspace.permissions.includes("accounting:write") ? (
                <div className="mt-6 space-y-2">
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Aksi Cepat</p>
                <Link
                  href="/sales?action=new"
                  className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
                  onClick={() => setSidebarOpen(false)}
                >
                  <PackagePlus className="size-5" aria-hidden />
                  Buat Invoice Baru
                </Link>
                <Link
                  href="/purchases?action=new"
                  className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700"
                  onClick={() => setSidebarOpen(false)}
                >
                  <ShoppingCart className="size-5" aria-hidden />
                  Buat Purchase Bill
                </Link>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      )}

      {/* ============================================================================
          MODALS
          ============================================================================ */}
      {commandOpen && <CommandPalette workspace={workspace} onClose={() => setCommandOpen(false)} />}
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
