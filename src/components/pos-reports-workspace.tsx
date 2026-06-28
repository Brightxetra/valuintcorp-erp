"use client";

import Link from "next/link";
import { CalendarDays, ClipboardList, ReceiptText, RefreshCw, ShoppingBag, Store, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useErpWorkspace } from "@/components/erp-context";
import { cn } from "@/components/ui";
import { money } from "@/lib/format";
import type { ErpWorkspace } from "@/lib/erp/types";
import { getAccessiblePosBranches } from "@/lib/pos/branches";
import { readStoredPosLocationId, writeStoredPosLocationId } from "@/lib/pos/preferences";
import type { PosExpense, PosPeriodMode, PosSale, PosSnapshot } from "@/lib/pos/types";
import { notify } from "@/lib/notify";

type ReportSummary = {
  revenue: number;
  cogs: number;
  expenses: number;
  openingStock: number;
  closingStock: number;
  sales: PosSale[];
  expenseRows: PosExpense[];
  dates: string[];
};

const periodOptions: Array<{ value: PosPeriodMode; label: string }> = [
  { value: "daily", label: "Harian" },
  { value: "weekly", label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateRange(anchorValue: string, period: PosPeriodMode) {
  const anchor = new Date(`${anchorValue}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return [today()];

  if (period === "daily") return [toDateInputValue(anchor)];

  if (period === "weekly") {
    const day = anchor.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = addDays(anchor, mondayOffset);
    return Array.from({ length: 7 }, (_, index) => toDateInputValue(addDays(start, index)));
  }

  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const days = Math.max(1, end.getDate());
  return Array.from({ length: days }, (_, index) => toDateInputValue(addDays(start, index)));
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(parsed);
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "emerald" | "amber" | "red" | "cyan" | "slate";
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
    cyan: "bg-cyan-50 text-cyan-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={cn("flex size-9 items-center justify-center rounded-xl", toneClass)}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

export function PosReportsWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, request } = useErpWorkspace(initialWorkspace);
  const branches = useMemo(() => getAccessiblePosBranches(workspace), [workspace]);
  const [locationId, setLocationId] = useState(() => {
    const storedId = readStoredPosLocationId();
    return branches.some((branch) => branch.id === storedId) ? storedId : branches[0]?.id ?? "";
  });
  const [periodMode, setPeriodMode] = useState<PosPeriodMode>("daily");
  const [anchorDate, setAnchorDate] = useState(today);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedBranch = branches.find((branch) => branch.id === locationId);
  const dates = useMemo(() => dateRange(anchorDate, periodMode), [anchorDate, periodMode]);

  const loadReport = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);

    try {
      const snapshots = await Promise.all(
        dates.map((date) =>
          request<PosSnapshot>(`/api/erp/pos?locationId=${encodeURIComponent(locationId)}&date=${encodeURIComponent(date)}`),
        ),
      );

      const first = snapshots[0];
      const last = snapshots[snapshots.length - 1] ?? first;
      setSummary({
        revenue: snapshots.reduce((total, item) => total + item.recap.revenue, 0),
        cogs: snapshots.reduce((total, item) => total + item.recap.cogs, 0),
        expenses: snapshots.reduce((total, item) => total + item.recap.miscExpenses, 0),
        openingStock: first?.recap.openingStock ?? 0,
        closingStock: last?.recap.closingStock ?? 0,
        sales: snapshots.flatMap((item) => item.recap.sales),
        expenseRows: snapshots.flatMap((item) => item.recap.expenses),
        dates,
      });
    } catch (caught) {
      notify.error("Laporan POS gagal dimuat", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setLoading(false);
    }
  }, [dates, locationId, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReport();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReport]);

  if (branches.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Store className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-950">Cabang POS belum tersedia</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Laporan POS akan muncul setelah cabang aktif terhubung ke gudang.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const grossProfit = (summary?.revenue ?? 0) - (summary?.cogs ?? 0);
  const stockMovement = (summary?.closingStock ?? 0) - (summary?.openingStock ?? 0);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Laporan POS</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Laporan cabang</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Lihat penjualan, pergerakan stok, dan biaya cabang dalam periode operasional.
            </p>
          </div>
          <Link
            href="/pos"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Kembali ke kasir
          </Link>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_180px_auto] md:items-end">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cabang
            <select
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                writeStoredPosLocationId(event.target.value);
              }}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none focus:border-slate-500"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Periode
            <select
              value={periodMode}
              onChange={(event) => setPeriodMode(event.target.value as PosPeriodMode)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none focus:border-slate-500"
            >
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tanggal acuan
            <div className="relative mt-1">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="date"
                value={anchorDate}
                onChange={(event) => setAnchorDate(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-medium text-slate-950 outline-none focus:border-slate-500"
              />
            </div>
          </label>
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
            Muat laporan
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Omzet" value={money(summary?.revenue ?? 0)} icon={ReceiptText} tone="emerald" />
        <MetricCard label="Laba kotor" value={money(grossProfit)} icon={Wallet} tone="cyan" />
        <MetricCard label="Biaya cabang" value={money(summary?.expenses ?? 0)} icon={ClipboardList} tone="red" />
        <MetricCard label="Stok awal" value={money(summary?.openingStock ?? 0)} icon={ShoppingBag} tone="amber" />
        <MetricCard label="Stok akhir" value={money(summary?.closingStock ?? 0)} icon={ShoppingBag} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Penjualan POS</h2>
              <p className="text-sm text-slate-500">
                {selectedBranch?.name ?? "Cabang"} - {summary?.dates[0] ? formatDate(summary.dates[0]) : "-"}
                {summary && summary.dates.length > 1 ? ` sampai ${formatDate(summary.dates[summary.dates.length - 1])}` : ""}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {summary?.sales.length ?? 0} transaksi
            </span>
          </div>
          <div className="space-y-2">
            {(summary?.sales ?? []).length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada transaksi POS pada periode ini.</p>
            ) : (
              summary?.sales.map((sale) => (
                <div key={sale.id} className="flex justify-between gap-4 rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">{sale.invoiceNo}</p>
                    <p className="text-slate-500">{formatDate(sale.date)} - HPP {money(sale.cogs)}</p>
                  </div>
                  <strong className="shrink-0 text-slate-950">{money(sale.total)}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Pergerakan stok</h2>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Stok awal</span>
                <strong className="text-slate-950">{money(summary?.openingStock ?? 0)}</strong>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Stok akhir</span>
                <strong className="text-slate-950">{money(summary?.closingStock ?? 0)}</strong>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                <span className="font-medium text-slate-700">Perubahan</span>
                <strong className={stockMovement < 0 ? "text-red-600" : "text-emerald-600"}>{money(stockMovement)}</strong>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Biaya cabang</h2>
            <div className="mt-3 space-y-2">
              {(summary?.expenseRows ?? []).length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada biaya cabang pada periode ini.</p>
              ) : (
                summary?.expenseRows.map((expense) => (
                  <div key={expense.id} className="flex justify-between gap-4 rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-950">{expense.category}</p>
                      <p className="truncate text-slate-500">{formatDate(expense.date)}{expense.memo ? ` - ${expense.memo}` : ""}</p>
                    </div>
                    <strong className="shrink-0 text-slate-950">{money(expense.amount)}</strong>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
