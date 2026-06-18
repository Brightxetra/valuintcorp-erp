"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ReceiptText,
  ShoppingCart,
  Package,
  Users,
  Building2,
  FileBarChart,
  Settings,
  Banknote,
  FileText,
  HeartPulse,
  ScrollText,
  PieChart,
  Truck,
  Calculator,
  ChevronDown,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

// Navigasi BARU yang intuitif - bahasa sehari-hari Indonesia
const navGroups: NavGroup[] = [
  {
    label: "Beranda",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home },
    ],
  },
  {
    label: "💰 Transaksi",
    items: [
      { href: "/transaksi/invoice", label: "Invoice Penjualan", icon: ReceiptText, badge: "Penjualan" },
      { href: "/transaksi/tagihan", label: "Tagihan Supplier", icon: ShoppingCart, badge: "Pembelian" },
      { href: "/transaksi/kas", label: "Kas & Bank", icon: Banknote, badge: "Kas" },
    ],
    defaultOpen: true,
  },
  {
    label: "📦 Produk",
    items: [
      { href: "/produk/stok", label: "Stok & Persediaan", icon: Package },
      { href: "/produk/harga", label: "Daftar Harga", icon: FileText },
    ],
  },
  {
    label: "👥 Karyawan & Gaji",
    items: [
      { href: "/karyawan", label: "Data Karyawan", icon: Users },
      { href: "/karyawan/gaji", label: "Hitung Gaji", icon: Calculator },
      { href: "/karyawan/bpjs", label: "BPJS Kesehatan", icon: HeartPulse },
      { href: "/karyawan/absensi", label: "Absensi", icon: CalendarCheck },
    ],
  },
  {
    label: "📈 Keuangan",
    items: [
      { href: "/keuangan/akun", label: "Daftar Akun (COA)", icon: ScrollText },
      { href: "/keuangan/jurnal", label: "Catatan Jurnal", icon: FileBarChart },
      { href: "/keuangan/laporan", label: "Laporan Keuangan", icon: PieChart },
      { href: "/keuangan/rekonsiliasi", label: "Rekonsiliasi", icon: CheckCircle },
    ],
  },
  {
    label: "🚚 Operasional",
    items: [
      { href: "/operasional/pembelian", label: "Pembelian", icon: Truck },
      { href: "/operasional/pengiriman", label: "Pengiriman", icon: Package },
    ],
  },
  {
    label: "📋 Pengaturan",
    items: [
      { href: "/pengaturan/bisnis", label: "Profil Bisnis", icon: Building2 },
      { href: "/pengaturan/preferensi", label: "Preferensi", icon: Settings },
    ],
  },
];

// Placeholder component for CalendarCheck
function CalendarCheck({ className }: { className?: string }) {
  return <span className={className}>📅</span>;
}

// Placeholder component for CheckCircle
function CheckCircle({ className }: { className?: string }) {
  return <span className={className}>✓</span>;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSection({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(group.defaultOpen ?? false);
  const hasActiveChild = group.items.some((item) => isActive(pathname, item.href));

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold transition-all",
          hasActiveChild
            ? "bg-emerald-50 text-emerald-800"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
        )}
      >
        <span>{group.label}</span>
        {isOpen ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
      </button>

      {isOpen && (
        <div className="mt-1 space-y-0.5 pl-2">
          {group.items.map((item) => {
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
                    ? "bg-emerald-700 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SimpleSidebar() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navGroups.map((group) => (
        <NavSection key={group.label} group={group} pathname={pathname} />
      ))}
    </nav>
  );
}

// Quick Actions Component - Aksi cepat di sidebar
export function QuickActions() {
  return (
    <div className="rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 p-4 text-white">
      <h3 className="text-sm font-semibold">Aksi Cepat</h3>
      <div className="mt-3 space-y-2">
        <Link
          href="/transaksi/invoice?action=new"
          className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-sm font-medium transition hover:bg-white/30"
        >
          <Plus className="size-4" />
          Invoice Baru
        </Link>
        <Link
          href="/karyawan/gaji"
          className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-sm font-medium transition hover:bg-white/30"
        >
          <Calculator className="size-4" />
          Hitung Gaji
        </Link>
        <Link
          href="/keuangan/jurnal?action=new"
          className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-sm font-medium transition hover:bg-white/30"
        >
          <FileBarChart className="size-4" />
          Catat Jurnal
        </Link>
      </div>
    </div>
  );
}

// Metrik Ringkasan di Sidebar
export function SidebarMetrics({
  piutang = 0,
  hutang = 0,
  stok = 0
}: {
  piutang?: number;
  hutang?: number;
  stok?: number
}) {
  const formatMoney = (num: number) => {
    if (num >= 1000000) return `Rp ${(num / 1000000).toFixed(1)}jt`;
    if (num >= 1000) return `Rp ${(num / 1000).toFixed(0)}rb`;
    return `Rp ${num.toLocaleString("id-ID")}`;
  };

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Ringkasan Cepat
      </h3>
      <div className="mt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Piutang</span>
          <span className="font-medium text-amber-700">{formatMoney(piutang)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Hutang</span>
          <span className="font-medium text-red-700">{formatMoney(hutang)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Nilai Stok</span>
          <span className="font-medium text-emerald-700">{formatMoney(stok)}</span>
        </div>
      </div>
    </div>
  );
}

export default SimpleSidebar;
