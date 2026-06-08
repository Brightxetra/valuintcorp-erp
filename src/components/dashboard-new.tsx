"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Home,
  ReceiptText,
  ShoppingCart,
  Package,
  Users,
  Calculator,
  FileBarChart,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  ArrowRight,
  Plus,
  Eye,
  Banknote,
  Building2,
} from "lucide-react";
import {
  ActionButton,
  Panel,
  StatusPill,
  EmptyState,
} from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";
import { outstandingSales, outstandingPurchase } from "@/lib/erp/operations";
import { money, percent } from "@/lib/format";
import { getStatusLabel } from "@/lib/translations";

// ============================================
// KOMPONEN KARTU METRIK
// ============================================
interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  tone?: "emerald" | "amber" | "red" | "cyan" | "slate" | "purple";
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  alert?: boolean;
  href?: string;
}

export function DashboardMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "emerald",
  trend,
  trendValue,
  alert,
  href,
}: MetricCardProps) {
  const toneClasses = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    red: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    cyan: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
    slate: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  };

  const classes = toneClasses[tone] ?? toneClasses.emerald;

  const content = (
    <div
      className={`relative overflow-hidden rounded-xl border ${classes.border} bg-white p-5 transition-shadow hover:shadow-md ${href ? "cursor-pointer" : ""}`}
    >
      {alert && (
        <div className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1.5">
          <AlertTriangle className="size-3 text-white" />
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}

          {trend && trendValue && (
            <div className={`mt-2 flex items-center gap-1 text-xs ${trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-slate-500"}`}>
              {trend === "up" ? <TrendingUp className="size-3" /> : trend === "down" ? <TrendingDown className="size-3" /> : null}
              <span>{trendValue}</span>
            </div>
          )}
        </div>

        <div className={`rounded-lg p-3 ${classes.bg} ${classes.text}`}>
          <Icon className="size-6" />
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

// ============================================
// KOMPONEN AKSI CEPAT
// ============================================
export function QuickActions() {
  const actions = [
    { href: "/transaksi/invoice/baru", label: "Invoice Baru", icon: ReceiptText, color: "bg-emerald-600 hover:bg-emerald-700" },
    { href: "/transaksi/tagihan/baru", label: "Tagihan Baru", icon: ShoppingCart, color: "bg-blue-600 hover:bg-blue-700" },
    { href: "/karyawan/gaji", label: "Hitung Gaji", icon: Calculator, color: "bg-purple-600 hover:bg-purple-700" },
    { href: "/keuangan/jurnal/baru", label: "Catat Jurnal", icon: FileBarChart, color: "bg-amber-600 hover:bg-amber-700" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className={`flex items-center gap-2 rounded-lg ${action.color} px-4 py-3 text-sm font-medium text-white transition`}
          >
            <Icon className="size-4" />
            {action.label}
          </Link>
        );
      })}
    </div>
  );
}

// ============================================
// KOMPONEN TUGAS/ALERT
// ============================================
export function TaskList({ tasks }: { tasks: ErpWorkspace["tasks"] }) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4">
        <CheckCircle2 className="size-5 text-emerald-600" />
        <p className="text-sm text-emerald-800">Semua tugas sudah selesai. Tidak ada yang perlu dilakukan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.slice(0, 5).map((task) => (
        <div
          key={task.id}
          className={`flex items-start gap-3 rounded-lg border p-3 ${
            task.severity === "critical"
              ? "border-red-200 bg-red-50"
              : task.severity === "warning"
                ? "border-amber-200 bg-amber-50"
                : "border-emerald-200 bg-emerald-50"
          }`}
        >
          <span
            className={
              task.severity === "critical"
                ? "text-red-600"
                : task.severity === "warning"
                  ? "text-amber-600"
                  : "text-emerald-600"
            }
          >
            {task.severity === "critical" ? (
              <AlertTriangle className="size-5" />
            ) : (
              <Clock className="size-5" />
            )}
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-950">{task.title}</p>
              <StatusPill
                tone={
                  task.severity === "critical" ? "red" : task.severity === "warning" ? "amber" : "emerald"
                }
              >
                {task.module}
              </StatusPill>
            </div>
            <p className="mt-1 text-sm text-slate-600">{task.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// KOMPONEN INVOICE TERBARU
// ============================================
export function RecentInvoices({ workspace }: { workspace: ErpWorkspace }) {
  const recentInvoices = workspace.salesInvoices.slice(0, 5);

  if (recentInvoices.length === 0) {
    return (
      <EmptyState
        title="Belum ada invoice"
        description="Buat invoice penjualan pertama Anda"
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {recentInvoices.map((invoice) => {
        const outstanding = outstandingSales(invoice);
        const customer = workspace.customers.find((c) => c.id === invoice.customerId);
        const statusTone =
          invoice.status === "paid"
            ? "emerald"
            : invoice.status === "partially_paid"
              ? "cyan"
              : invoice.status === "posted"
                ? "amber"
                : invoice.status === "void"
                  ? "red"
                  : "gray";

        return (
          <Link
            key={invoice.id}
            href={`/transaksi/invoice/${invoice.id}`}
            className="flex items-center justify-between p-3 transition hover:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-slate-100 p-2">
                <ReceiptText className="size-4 text-slate-600" />
              </div>
              <div>
                <p className="font-medium text-slate-950">{invoice.invoiceNo}</p>
                <p className="text-sm text-slate-500">{customer?.name ?? "Pelanggan"}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium text-slate-950">{money(invoice.total)}</p>
              <StatusPill tone={statusTone}>{getStatusLabel(invoice.status)}</StatusPill>
            </div>
          </Link>
        );
      })}
      <Link
        href="/transaksi/invoice"
        className="flex items-center justify-center gap-2 p-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        Lihat Semua Invoice <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

// ============================================
// KOMPONEN AKTIVITAS TERBARU
// ============================================
export function RecentActivities({ activities }: { activities: ErpWorkspace["activities"] }) {
  if (activities.length === 0) {
    return (
      <p className="p-4 text-center text-sm text-slate-500">Belum ada aktivitas terbaru</p>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {activities.slice(0, 5).map((activity) => (
        <div key={activity.id} className="p-3">
          <p className="text-sm text-slate-950">{activity.description}</p>
          <p className="mt-1 text-xs text-slate-500">
            {activity.actorName} - {new Date(activity.createdAt).toLocaleDateString("id-ID")}
          </p>
        </div>
      ))}
    </div>
  );
}

// ============================================
// WORKSPACE UTAMA
// ============================================
export function DashboardWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, loading, error, demoMode } = useErpWorkspace(initialWorkspace);

  const marginRate = workspace.metrics.revenue > 0 ? workspace.metrics.grossMargin / workspace.metrics.revenue : 0;

  // Hitung piutang & hutang jatuh tempo
  const overdueInvoices = workspace.salesInvoices.filter(
    (inv) => inv.status === "posted" || inv.status === "partially_paid"
  );
  const overdueBills = workspace.purchaseBills.filter(
    (bill) => bill.status === "posted" || bill.status === "partially_paid"
  );

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Selamat Datang di Valuintcorp</h1>
        <p className="mt-1 text-slate-600">Ringkasan bisnis Anda hari ini</p>
        {demoMode && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <AlertTriangle className="size-4" />
            Mode Latihan aktif - Data adalah contoh saja
          </div>
        )}
        {loading && <p className="mt-2 text-sm text-slate-500">Memuat data...</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* AKSI CEPAT */}
      <Panel
        title="Aksi Cepat"
        description="Tugas yang sering dilakukan"
      >
        <QuickActions />
      </Panel>

      {/* KARTU METRIK UTAMA */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardMetricCard
          title="Total Penjualan"
          value={money(workspace.metrics.revenue)}
          subtitle={`Margin kotor ${percent(marginRate)}`}
          icon={ReceiptText}
          tone="emerald"
          trend="up"
          trendValue="vs bulan lalu"
          href="/transaksi/invoice"
        />
        <DashboardMetricCard
          title="Kas & Bank"
          value={money(workspace.metrics.cash)}
          subtitle="Saldo tersedia"
          icon={Banknote}
          tone="cyan"
          href="/keuangan/akun"
        />
        <DashboardMetricCard
          title="Piutang Pelanggan"
          value={money(workspace.metrics.accountsReceivable)}
          subtitle={`${money(workspace.metrics.overdueReceivables)} jatuh tempo`}
          icon={Wallet}
          tone={workspace.metrics.overdueReceivables > 0 ? "amber" : "emerald"}
          alert={workspace.metrics.overdueReceivables > 0}
          href="/transaksi/invoice"
        />
        <DashboardMetricCard
          title="Nilai Stok"
          value={money(workspace.metrics.inventoryValue)}
          subtitle={`${workspace.metrics.stockAlertCount} SKU perlu dicek`}
          icon={Package}
          tone={workspace.metrics.stockAlertCount > 0 ? "amber" : "emerald"}
          alert={workspace.metrics.stockAlertCount > 0}
          href="/produk/stok"
        />
      </div>

      {/* RINGKASAN TAMBAHAN */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardMetricCard
          title="Hutang Supplier"
          value={money(workspace.metrics.accountsPayable)}
          subtitle={`${money(workspace.metrics.overduePayables)} jatuh tempo`}
          icon={ShoppingCart}
          tone="amber"
          href="/transaksi/tagihan"
        />
        <DashboardMetricCard
          title="Biaya Gaji"
          value={money(workspace.metrics.payrollCost)}
          subtitle={`${workspace.employees.length} karyawan`}
          icon={Users}
          tone="purple"
          href="/karyawan/gaji"
        />
        <DashboardMetricCard
          title="Estimasi Pajak"
          value={money(workspace.metrics.taxEstimate)}
          subtitle="PPh final UMKM"
          icon={DollarSign}
          tone="red"
          href="/pajak"
        />
        <DashboardMetricCard
          title="Transaksi Bulan Ini"
          value={String(workspace.locationMetrics.reduce((acc, m) => acc + m.transactionCount, 0))}
          subtitle="Total transaksi"
          icon={TrendingUp}
          tone="slate"
          href="/laporan"
        />
      </div>

      {/* DUA KOLOM: TUGAS & AKTIVITAS */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tugas Hari Ini" description="Hal yang perlu perhatian Anda">
          <TaskList tasks={workspace.tasks} />
        </Panel>

        <Panel title="Aktivitas Terbaru" description="Aktivitas bisnis terkini">
          <RecentActivities activities={workspace.activities} />
        </Panel>
      </div>

      {/* INVOICE TERBARU */}
      <Panel
        title="Invoice Terbaru"
        description="Transaksi penjualan terakhir"
      >
        <RecentInvoices workspace={workspace} />
      </Panel>
    </div>
  );
}