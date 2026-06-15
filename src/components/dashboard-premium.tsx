"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BookOpenCheck,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  GripVertical,
  Landmark,
  PackagePlus,
  ReceiptText,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { cn } from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace, ErpTask } from "@/lib/erp/types";
import { money, percent, shortDate } from "@/lib/format";
import { erpApiDownload } from "@/lib/erp/client-api";

// ============================================================================
// WIDGET TYPES & CONFIGURATION
// ============================================================================

interface Widget {
  id: string;
  title: string;
  icon: React.ElementType;
  size: "small" | "medium" | "large";
  visible: boolean;
}

interface WidgetOrder {
  id: string;
  order: number;
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: "metrics", title: "Metrik Utama", icon: TrendingUp, size: "large", visible: true },
  { id: "tasks", title: "Prioritas Hari Ini", icon: AlertTriangle, size: "medium", visible: true },
  { id: "activities", title: "Aktivitas Terbaru", icon: Clock, size: "medium", visible: true },
  { id: "ar-ap", title: "AR/AP Due", icon: BookOpenCheck, size: "small", visible: true },
  { id: "payroll", title: "Payroll", icon: UsersRound, size: "small", visible: true },
  { id: "tax", title: "Pajak", icon: Landmark, size: "small", visible: true },
  { id: "location", title: "Performa Lokasi", icon: Landmark, size: "large", visible: true },
  { id: "imports", title: "Import & Summary", icon: FileSpreadsheet, size: "medium", visible: true },
];

function useWidgetConfig(defaultWidgets: Widget[]) {
  function readStoredConfig() {
    if (typeof window === "undefined") return { widgets: defaultWidgets, order: [] as WidgetOrder[] };
    const stored = window.localStorage.getItem("erp-dashboard-widgets");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          widgets: parsed.widgets || defaultWidgets,
          order: parsed.order || [],
        };
      } catch {
        return { widgets: defaultWidgets, order: [] as WidgetOrder[] };
      }
    }
    return { widgets: defaultWidgets, order: [] as WidgetOrder[] };
  }

  const [initialConfig] = useState(readStoredConfig);
  const [widgets, setWidgets] = useState<Widget[]>(initialConfig.widgets);
  const [order, setOrder] = useState<WidgetOrder[]>(initialConfig.order);

  const saveConfig = (newWidgets: Widget[], newOrder: WidgetOrder[]) => {
    localStorage.setItem("erp-dashboard-widgets", JSON.stringify({ widgets: newWidgets, order: newOrder }));
    setWidgets(newWidgets);
    setOrder(newOrder);
  };

  const toggleWidget = (id: string) => {
    const newWidgets = widgets.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
    );
    saveConfig(newWidgets, order);
  };

  return { widgets, order, toggleWidget };
}

// ============================================================================
// PREMIUM METRIC CARD
// ============================================================================

export function PremiumMetricCard({
  label,
  value,
  trend,
  icon: Icon,
  color = "slate",
  onClick,
}: {
  label: string;
  value: string;
  trend?: { value: number; label: string };
  icon: React.ElementType;
  color?: "slate" | "emerald" | "blue" | "amber" | "red";
  onClick?: () => void;
}) {
  const colorClasses = {
    slate: { bg: "bg-slate-100", text: "text-slate-600" },
    emerald: { bg: "bg-emerald-100", text: "text-emerald-600" },
    blue: { bg: "bg-blue-100", text: "text-blue-600" },
    amber: { bg: "bg-amber-100", text: "text-amber-600" },
    red: { bg: "bg-red-100", text: "text-red-600" },
  }[color];

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-lg cursor-pointer",
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
          {trend && (
            <div className={cn(
              "mt-2 flex items-center gap-1 text-sm font-medium",
              trend.value >= 0 ? "text-emerald-600" : "text-red-600"
            )}>
              {trend.value >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              <span>{Math.abs(trend.value)}% {trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn("rounded-2xl p-3", colorClasses.bg)}>
          <Icon className={cn("size-6", colorClasses.text)} aria-hidden />
        </div>
      </div>
      {onClick && (
        <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
          <ArrowUpRight className="size-4 text-slate-400" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// METRICS GRID WIDGET
// ============================================================================

function MetricsWidget({ workspace }: { workspace: ErpWorkspace }) {
  const marginRate = workspace.metrics.revenue > 0
    ? (workspace.metrics.grossMargin / workspace.metrics.revenue) * 100
    : 0;

  const metrics = [
    { label: "Omzet Posted", value: money(workspace.metrics.revenue), icon: ReceiptText, color: "emerald" as const },
    { label: "Kas Operasional", value: money(workspace.metrics.cash), icon: Banknote, color: "blue" as const },
    { label: "Piutang Terbuka", value: money(workspace.metrics.accountsReceivable), icon: Clock, color: "amber" as const, alert: workspace.metrics.overdueReceivables > 0 },
    { label: "Nilai Stok", value: money(workspace.metrics.inventoryValue), icon: Boxes, color: "slate" as const, alert: workspace.metrics.stockAlertCount > 0 },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-slate-100 p-2">
            <TrendingUp className="size-5 text-slate-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-950">Metrik Utama</h3>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          Gross Margin: {percent(marginRate / 100)}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className={cn(
              "relative rounded-xl border bg-slate-50 p-4 transition-all hover:bg-white hover:shadow-md",
              m.alert && "border-amber-300"
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{m.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{m.value}</p>
              </div>
              <div className="rounded-xl p-2.5 bg-emerald-100">
                <m.icon className="size-5 text-emerald-600" aria-hidden />
              </div>
            </div>
            {m.alert && (
              <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="size-3" />
                <span>Perlu perhatian</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// TASKS WIDGET
// ============================================================================

function TasksWidget({ tasks }: { tasks: ErpTask[] }) {
  const severityColors = {
    critical: "bg-red-50 border-red-200 text-red-700",
    warning: "bg-amber-50 border-amber-200 text-amber-700",
    info: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };

  const severityIcons = {
    critical: AlertTriangle,
    warning: AlertCircle,
    info: CheckCircle2,
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-slate-100 p-2">
            <AlertTriangle className="size-5 text-slate-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-950">Prioritas Hari Ini</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {tasks.length} tugas
        </span>
      </div>
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="size-10 text-emerald-300" />
            <p className="mt-2 text-sm font-medium text-slate-500">Semua clear!</p>
            <p className="mt-1 text-xs text-slate-400">Tidak ada tugas yang perlu perhatian</p>
          </div>
        ) : (
          tasks.map((task) => {
            const Icon = severityIcons[task.severity];
            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-sm",
                  severityColors[task.severity]
                )}
              >
                <div className="mt-0.5 rounded-lg bg-white p-1.5">
                  <Icon className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-950">{task.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{task.description}</p>
                  <span className="mt-2 inline-block rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase">
                    {task.module}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ACTIVITIES WIDGET
// ============================================================================

function ActivitiesWidget({ activities }: { activities: ErpWorkspace["activities"] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-slate-100 p-2">
            <Clock className="size-5 text-slate-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-950">Aktivitas Terbaru</h3>
        </div>
      </div>
      <div className="space-y-1">
        {activities.slice(0, 6).map((activity) => (
          <div
            key={activity.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
              {activity.actorName?.charAt(0) || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-950">{activity.description}</p>
              <p className="text-xs text-slate-500">{activity.actorName} • {shortDate(activity.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// AR/AP WIDGET
// ============================================================================

function ArApWidget({ workspace }: { workspace: ErpWorkspace }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-slate-100 p-2">
          <BookOpenCheck className="size-5 text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-slate-950">AR/AP Due</h3>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-red-50 p-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-red-600">Piutang Jatuh Tempo</p>
            <p className="mt-1 text-lg font-bold text-red-700">{money(workspace.metrics.overdueReceivables)}</p>
          </div>
          <AlertTriangle className="size-5 text-red-400" aria-hidden />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-amber-50 p-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Utang Jatuh Tempo</p>
            <p className="mt-1 text-lg font-bold text-amber-700">{money(workspace.metrics.overduePayables)}</p>
          </div>
          <AlertCircle className="size-5 text-amber-400" aria-hidden />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAYROLL WIDGET
// ============================================================================

function PayrollWidget({ workspace }: { workspace: ErpWorkspace }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-slate-100 p-2">
          <UsersRound className="size-5 text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-slate-950">Payroll</h3>
      </div>
      <div className="rounded-xl bg-slate-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Biaya Payroll</p>
        <p className="mt-1 text-xl font-bold text-slate-950">{money(workspace.metrics.payrollCost)}</p>
        <p className="mt-1 text-xs text-slate-500">{workspace.employees.length} karyawan aktif</p>
      </div>
    </div>
  );
}

// ============================================================================
// TAX WIDGET
// ============================================================================

function TaxWidget({ workspace }: { workspace: ErpWorkspace }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-slate-100 p-2">
          <Landmark className="size-5 text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-slate-950">Pajak</h3>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Estimasi PPh Final</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{money(workspace.metrics.taxEstimate)}</p>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-amber-50 p-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Status Coretax</p>
            <p className="mt-1 text-sm font-semibold text-amber-700">{workspace.taxProfile.coretaxStatus}</p>
          </div>
          <ChevronRight className="size-4 text-amber-400" aria-hidden />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LOCATION PERFORMANCE WIDGET
// ============================================================================

function LocationWidget({ workspace }: { workspace: ErpWorkspace }) {
  const locationMetrics = workspace.locationMetrics;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-slate-100 p-2">
            <Landmark className="size-5 text-slate-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-950">Performa Per Lokasi</h3>
        </div>
        <span className="text-xs text-slate-500">{locationMetrics.length} lokasi</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Lokasi</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Transaksi</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Omzet</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Ticket</th>
            </tr>
          </thead>
          <tbody>
            {locationMetrics.map((metric) => {
              const location = workspace.locations.find((l) => l.id === metric.locationId);
              return (
                <tr key={metric.locationId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-medium">{location?.name || "Unknown"}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{metric.transactionCount}</td>
                  <td className="py-2.5 px-3 text-right font-medium">{money(metric.revenue)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{money(metric.averageTicket)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// IMPORTS WIDGET
// ============================================================================

function ImportsWidget({ workspace }: { workspace: ErpWorkspace }) {
  const batches = workspace.rawImportBatches;

  const statusColors = {
    pending: "bg-amber-100 text-amber-700",
    validated: "bg-blue-100 text-blue-700",
    summarized: "bg-emerald-100 text-emerald-700",
    posted: "bg-slate-100 text-slate-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-slate-100 p-2">
            <FileSpreadsheet className="size-5 text-slate-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-950">Import & Summary</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {batches.length} batch
        </span>
      </div>
      <div className="space-y-2">
        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <FileSpreadsheet className="size-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">Belum ada import</p>
          </div>
        ) : (
          batches.slice(0, 4).map((batch) => (
            <div key={batch.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-950">{batch.source}</p>
                <p className="text-xs text-slate-500">{batch.validRows}/{batch.totalRows} valid</p>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColors[batch.status as keyof typeof statusColors] || statusColors.pending)}>
                {batch.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// WIDGET CUSTOMIZER
// ============================================================================

function WidgetCustomizer({ widgets, onToggle }: { widgets: Widget[]; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <GripVertical className="size-4" />
        Customize
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <h4 className="mb-3 text-sm font-semibold text-slate-950">Tampilkan/Sembunyikan Widget</h4>
            <div className="space-y-2">
              {widgets.map((widget) => (
                <label key={widget.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={widget.visible}
                    onChange={() => onToggle(widget.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">{widget.title}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export function DashboardPremium({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, loading, demoMode, activeBusinessId } = useErpWorkspace(initialWorkspace);
  const { widgets, toggleWidget } = useWidgetConfig(DEFAULT_WIDGETS);
  const router = useRouter();

  const visibleWidgets = widgets.filter((w) => w.visible);

  const business = workspace.business;

  return (
    <div className="space-y-6">
      {/* ============================================================================
          HEADER SECTION
          ============================================================================ */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {new Date().toLocaleDateString("id-ID", { weekday: "long" })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            Selamat {getGreeting()}, {workspace.user.name?.split(" ")[0] || "User"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {business.displayName} • {workspace.period.label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <WidgetCustomizer widgets={widgets} onToggle={toggleWidget} />
          <button
            type="button"
            onClick={() => erpApiDownload("/api/exports/financials?format=xlsx", activeBusinessId)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Download className="size-4" />
            Export
          </button>
          <button
            type="button"
            onClick={() => router.push("/sales?action=new")}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <PackagePlus className="size-4" />
            Buat Invoice
          </button>
        </div>
      </div>

      {/* ============================================================================
          STATUS BAR
          ============================================================================ */}
      {demoMode && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
          <AlertCircle className="size-5 text-amber-600" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Mode Demo Aktif</p>
            <p className="text-xs text-amber-600">Data tidak tersimpan permanen. Hubungkan Supabase untuk mode production.</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 p-4">
          <div className="size-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm text-blue-700">Memuat workspace production...</p>
        </div>
      )}

      {/* ============================================================================
          WIDGETS GRID
          ============================================================================ */}
      <div className="grid gap-6">
        {/* Metrics - Always first, full width */}
        {visibleWidgets.find((w) => w.id === "metrics") && <MetricsWidget workspace={workspace} />}

        {/* Tasks & Activities - Two columns */}
        {(visibleWidgets.find((w) => w.id === "tasks") || visibleWidgets.find((w) => w.id === "activities")) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {visibleWidgets.find((w) => w.id === "tasks") && <TasksWidget tasks={workspace.tasks} />}
            {visibleWidgets.find((w) => w.id === "activities") && <ActivitiesWidget activities={workspace.activities} />}
          </div>
        )}

        {/* AR/AP, Payroll, Tax - Three columns */}
        {(visibleWidgets.find((w) => w.id === "ar-ap") || visibleWidgets.find((w) => w.id === "payroll") || visibleWidgets.find((w) => w.id === "tax")) && (
          <div className="grid gap-6 lg:grid-cols-3">
            {visibleWidgets.find((w) => w.id === "ar-ap") && <ArApWidget workspace={workspace} />}
            {visibleWidgets.find((w) => w.id === "payroll") && <PayrollWidget workspace={workspace} />}
            {visibleWidgets.find((w) => w.id === "tax") && <TaxWidget workspace={workspace} />}
          </div>
        )}

        {/* Location & Imports - Two columns */}
        {(visibleWidgets.find((w) => w.id === "location") || visibleWidgets.find((w) => w.id === "imports")) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {visibleWidgets.find((w) => w.id === "location") && <LocationWidget workspace={workspace} />}
            {visibleWidgets.find((w) => w.id === "imports") && <ImportsWidget workspace={workspace} />}
          </div>
        )}
      </div>

      {/* ============================================================================
          QUICK ACTIONS
          ============================================================================ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-950">Aksi Cepat</h3>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push("/sales?action=new")}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <ReceiptText className="size-4" />
            Invoice Baru
          </button>
          <button
            type="button"
            onClick={() => router.push("/purchases?action=new")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ShoppingCart className="size-4" />
            Purchase Bill
          </button>
          <button
            type="button"
            onClick={() => router.push("/inventory?action=new")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Boxes className="size-4" />
            Stock Adjustment
          </button>
          <button
            type="button"
            onClick={() => router.push("/hr?action=payroll")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <UsersRound className="size-4" />
            Proses Gaji
          </button>
          <button
            type="button"
            onClick={() => router.push("/reports")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <FileSpreadsheet className="size-4" />
            Lihat Laporan
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper function
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Pagi";
  if (hour < 15) return "Siang";
  if (hour < 18) return "Sore";
  return "Malam";
}
