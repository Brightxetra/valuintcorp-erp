"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpenCheck,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  Home,
  Landmark,
  Menu,
  PackagePlus,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  UserCircle,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/components/ui";
import { FeedbackToast } from "@/components/feedback-toast";
import { ErpWorkspaceProvider, useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";
import { can, type Permission } from "@/lib/security/permissions";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home, permission: "business:read" },
      { href: "/sales", label: "Penjualan", icon: ReceiptText, permission: "accounting:write" },
      { href: "/purchases", label: "Pembelian", icon: ShoppingCart, permission: "accounting:write" },
      { href: "/inventory", label: "Stok", icon: Boxes, permission: "inventory:manage" },
    ],
  },
  {
    label: "Back office",
    items: [
      { href: "/accounting", label: "Akuntansi", icon: BookOpenCheck, permission: "accounting:read" },
      { href: "/reports", label: "Laporan", icon: FileBarChart, permission: "reports:export" },
      { href: "/hr", label: "HR & Payroll", icon: UsersRound, permission: "hr:manage" },
      { href: "/tax", label: "Pajak", icon: Landmark, permission: "tax:prepare" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/onboarding", label: "Onboarding", icon: ClipboardList, permission: "business:update" },
      { href: "/settings", label: "Settings", icon: Settings, permission: "business:read" },
    ],
  },
];

const mobileNav = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/sales", label: "Sales", icon: ReceiptText },
  { href: "/purchases", label: "Buy", icon: ShoppingCart },
  { href: "/inventory", label: "Stok", icon: Boxes },
  { href: "/settings", label: "More", icon: Menu },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ workspace, onNavigate }: { workspace: ErpWorkspace; onNavigate?: () => void }) {
  const pathname = usePathname();
  const role = workspace.user.role;

  return (
    <nav className="space-y-5">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.filter((item) => can(role, item.permission as Permission)).map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function searchWorkspace(workspace: ErpWorkspace | undefined, query: string) {
  if (!workspace || query.trim().length < 2) return [];

  const normalized = query.trim().toLowerCase();
  const matches = (value: string | undefined) => value?.toLowerCase().includes(normalized) ?? false;

  return [
    ...workspace.salesInvoices
      .filter((invoice) => {
        const customer = workspace.customers.find((item) => item.id === invoice.customerId);
        return matches(invoice.invoiceNo) || matches(customer?.name);
      })
      .map((invoice) => ({ href: "/sales", label: invoice.invoiceNo, meta: "Invoice penjualan" })),
    ...workspace.purchaseBills
      .filter((bill) => {
        const supplier = workspace.suppliers.find((item) => item.id === bill.supplierId);
        return matches(bill.billNo) || matches(supplier?.name);
      })
      .map((bill) => ({ href: "/purchases", label: bill.billNo, meta: "Purchase bill" })),
    ...workspace.products
      .filter((product) => matches(product.sku) || matches(product.name))
      .map((product) => ({ href: "/inventory", label: product.sku, meta: product.name })),
    ...workspace.locations
      .filter((location) => matches(location.name) || matches(location.code))
      .map((location) => ({ href: "/settings", label: location.name, meta: `Lokasi ${location.type}` })),
    ...workspace.dailyTransactionSummaries
      .filter((summary) => matches(summary.source) || matches(summary.date))
      .map((summary) => ({ href: "/reports", label: `${summary.source} ${summary.date}`, meta: `${summary.transactionCount} transaksi` })),
    ...workspace.customers
      .filter((customer) => matches(customer.name) || matches(customer.code))
      .map((customer) => ({ href: "/sales", label: customer.name, meta: "Customer" })),
    ...workspace.suppliers
      .filter((supplier) => matches(supplier.name) || matches(supplier.code))
      .map((supplier) => ({ href: "/purchases", label: supplier.name, meta: "Supplier" })),
    ...workspace.employees
      .filter((employee) => matches(employee.name) || matches(employee.employeeNo))
      .map((employee) => ({ href: "/hr", label: employee.name, meta: "Karyawan" })),
  ].slice(0, 8);
}

function CalendarLabel({ label, locked }: { label: string; locked: boolean }) {
  return (
    <>
      <Building2 className="size-4" aria-hidden />
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium",
          locked ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
        )}
      >
        {locked ? "locked" : "open"}
      </span>
    </>
  );
}

export function AppShell({
  children,
  workspace,
}: {
  children: React.ReactNode;
  workspace: ErpWorkspace;
}) {
  return (
    <ErpWorkspaceProvider initialWorkspace={workspace}>
      <AppShellChrome>{children}</AppShellChrome>
    </ErpWorkspaceProvider>
  );
}

function AppShellChrome({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const {
    workspace,
    businesses,
    activeBusinessId,
    setActiveBusinessId,
    loading,
    error,
    demoMode,
  } = useErpWorkspace();
  const business = workspace.business;
  const period = workspace.period;
  const user = workspace.user;
  const searchResults = useMemo(() => searchWorkspace(workspace, query), [workspace, query]);
  const taskCount = workspace.tasks.length;

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="erp-mobile-shell min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Buka menu"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-sm font-bold text-white">
                ET
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-950">Valuintcorp ERP</span>
              <span className="block truncate text-xs text-slate-500">{business.displayName}</span>
              </span>
            </Link>
          </div>

          <div className="relative hidden min-w-0 flex-1 items-center justify-center px-4 lg:flex">
            <label className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search className="size-4" aria-hidden />
              <input
                placeholder="Cari invoice, customer, SKU, jurnal..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchResults[0]) {
                    router.push(searchResults[0].href);
                    setQuery("");
                  }
                }}
                className="w-full bg-transparent text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
            {searchResults.length > 0 ? (
              <div className="absolute top-full mt-2 w-full max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {searchResults.map((result) => (
                  <Link
                    key={`${result.meta}-${result.label}`}
                    href={result.href}
                    onClick={() => setQuery("")}
                    className="block px-4 py-3 text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-950">{result.label}</span>
                    <span className="ml-2 text-xs text-slate-500">{result.meta}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/sales"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                <PackagePlus className="size-4" aria-hidden />
                Invoice
              </Link>
              <Link
                href="/purchases"
                className="hidden rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 xl:inline-flex"
              >
                Bill
              </Link>
            </div>
            <Link href="/dashboard" className="relative rounded-lg border border-slate-200 p-2 text-slate-600" aria-label="Notifikasi">
              <Bell className="size-4" aria-hidden />
              {taskCount > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
                  {taskCount}
                </span>
              ) : null}
            </Link>
            <div className="hidden items-center gap-2 md:flex">
              {businesses.length > 1 ? (
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <Building2 className="size-4" aria-hidden />
                  <select
                    aria-label="Pilih bisnis aktif"
                    value={activeBusinessId}
                    onChange={(event) => setActiveBusinessId(event.target.value)}
                    className="bg-transparent text-sm outline-none"
                  >
                    {businesses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <CalendarLabel label={period.label} locked={period.locked} />
                <ChevronDown className="size-4" aria-hidden />
              </Link>
            </div>
            <Link href="/login" className="rounded-lg border border-slate-200 p-2 text-slate-600" aria-label={user?.name ?? "User"}>
              <UserCircle className="size-5" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <div className="erp-mobile-shell-content mx-auto grid max-w-[1500px] gap-5 px-4 pt-5 pb-[var(--erp-mobile-content-clearance)] sm:px-6 lg:grid-cols-[270px_1fr] lg:pb-8">
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-4 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Bisnis aktif</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{business.displayName}</p>
              <p className="mt-1 text-xs text-slate-500">{business.ownerName} - {business.industry}</p>
              <p className="mt-2 text-xs text-slate-500">Role: {user.role}</p>
              {demoMode ? <p className="mt-2 text-xs font-medium text-amber-700">Demo fallback aktif</p> : null}
              {loading ? <p className="mt-2 text-xs text-slate-500">Memuat workspace production...</p> : null}
              <FeedbackToast error={error} />
            </div>
            <NavLinks workspace={workspace} />
          </div>
        </aside>

        <main className="min-w-0 space-y-5">{children}</main>
      </div>

      <nav className="erp-mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white lg:hidden">
        <div className="grid grid-cols-5">
          {mobileNav.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-2 text-xs font-medium",
                  active ? "text-emerald-700" : "text-slate-500",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[86vw] max-w-sm overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">Menu ERP</p>
              <button
                type="button"
                className="rounded-lg border border-slate-200 p-2"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <NavLinks workspace={workspace} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
