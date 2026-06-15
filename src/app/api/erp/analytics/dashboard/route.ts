import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import type { Business, ReportPeriod } from "@/lib/domain/types";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import type {
  DailyTransactionSummary,
  ErpMetrics,
  ErpTask,
  ErpWorkspace,
  Location,
  LocationMetric,
  RawImportBatch,
} from "@/lib/erp/types";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

type Row = Record<string, unknown>;

function text(row: Row, key: string, fallback = "") {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

function optionalText(row: Row, key: string) {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(row: Row, key: string, fallback = 0) {
  const value = row[key];

  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function booleanValue(row: Row, key: string, fallback = false) {
  const value = row[key];
  return typeof value === "boolean" ? value : fallback;
}

function rowList(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function defaultPeriod(): ReportPeriod {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  return {
    label: month,
    startDate: `${month}-01`,
    endDate: today,
    locked: false,
  };
}

function businessFromRow(row: Row): Business {
  return {
    id: text(row, "id"),
    legalName: text(row, "legal_name"),
    displayName: text(row, "display_name"),
    industry: text(row, "industry", "general") as Business["industry"],
    taxId: optionalText(row, "tax_id"),
    logoUrl: optionalText(row, "logo_url"),
    baseCurrency: "IDR",
    periodStartMonth: numberValue(row, "period_start_month", 1),
    ownerName: text(row, "owner_name"),
  };
}

function periodFromRow(row: Row): ReportPeriod {
  if (!row.id && !row.label) return defaultPeriod();

  return {
    label: text(row, "label", text(row, "period", "Periode aktif")),
    startDate: text(row, "start_date"),
    endDate: text(row, "end_date"),
    locked: booleanValue(row, "locked"),
  };
}

function mapLocation(row: Row): Location {
  return {
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    code: text(row, "code"),
    name: text(row, "name"),
    type: text(row, "type", "branch") as Location["type"],
    warehouseId: optionalText(row, "warehouse_id"),
    isActive: booleanValue(row, "is_active", true),
  };
}

function mapSummary(row: Row): DailyTransactionSummary {
  return {
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    locationId: text(row, "location_id"),
    source: text(row, "source", "manual") as DailyTransactionSummary["source"],
    date: text(row, "date"),
    status: text(row, "status", "draft") as DailyTransactionSummary["status"],
    transactionCount: numberValue(row, "transaction_count"),
    grossAmount: numberValue(row, "gross_amount"),
    discountAmount: numberValue(row, "discount_amount"),
    netAmount: numberValue(row, "net_amount"),
    taxAmount: numberValue(row, "tax_amount"),
    paymentBreakdown: row.payment_breakdown && typeof row.payment_breakdown === "object"
      ? (row.payment_breakdown as DailyTransactionSummary["paymentBreakdown"])
      : {},
    postedJournalEntryId: optionalText(row, "posted_journal_entry_id"),
    createdAt: text(row, "created_at"),
  };
}

function mapImportBatch(row: Row): RawImportBatch {
  return {
    id: text(row, "id"),
    businessId: text(row, "business_id"),
    locationId: optionalText(row, "location_id"),
    source: text(row, "source", "manual") as RawImportBatch["source"],
    status: text(row, "status", "uploaded") as RawImportBatch["status"],
    totalRows: numberValue(row, "total_rows"),
    validRows: numberValue(row, "valid_rows"),
    duplicateRows: numberValue(row, "duplicate_rows"),
    errorRows: numberValue(row, "error_rows"),
    createdAt: text(row, "created_at"),
  };
}

function buildSummaryMetrics(summaries: DailyTransactionSummary[], taxRate: number): ErpMetrics {
  const activeSummaries = summaries.filter((summary) => summary.status !== "rolled_back");
  const revenue = activeSummaries.reduce((total, summary) => total + summary.netAmount, 0);
  const rawTransactionCount = activeSummaries.reduce((total, summary) => total + summary.transactionCount, 0);

  return {
    revenue,
    purchases: 0,
    grossMargin: revenue,
    cash: 0,
    accountsReceivable: 0,
    accountsPayable: 0,
    inventoryValue: 0,
    payrollCost: 0,
    taxEstimate: Math.round(revenue * taxRate),
    overdueReceivables: 0,
    overduePayables: 0,
    stockAlertCount: 0,
    rawTransactionCount,
    summarizedRevenue: revenue,
    fixedAssetBookValue: 0,
  };
}

function buildLocationMetrics(locations: Location[], summaries: DailyTransactionSummary[]): LocationMetric[] {
  return locations.map((location) => {
    const locationSummaries = summaries.filter(
      (summary) => summary.locationId === location.id && summary.status !== "rolled_back",
    );
    const revenue = locationSummaries.reduce((total, summary) => total + summary.netAmount, 0);
    const transactionCount = locationSummaries.reduce((total, summary) => total + summary.transactionCount, 0);

    return {
      locationId: location.id,
      revenue,
      transactionCount,
      averageTicket: transactionCount > 0 ? Math.round(revenue / transactionCount) : 0,
    };
  });
}

function buildBoundedTasks(params: {
  period: ReportPeriod;
  importBatches: RawImportBatch[];
  metrics: ErpMetrics;
  summaries: DailyTransactionSummary[];
}): ErpTask[] {
  const tasks: ErpTask[] = [];
  const pendingImport = params.importBatches.find((batch) =>
    ["uploaded", "validated", "mapped", "summarized"].includes(batch.status),
  );
  const unpostedSummary = params.summaries.find((summary) => summary.status === "summarized");
  const taxDueDate = new Date(`${params.period.endDate}T00:00:00.000Z`);

  taxDueDate.setUTCDate(taxDueDate.getUTCDate() + 10);

  if (pendingImport) {
    tasks.push({
      id: `task-import-${pendingImport.id}`,
      module: "accounting",
      severity: pendingImport.errorRows > 0 ? "warning" : "info",
      title: "Selesaikan import transaksi",
      description: `${pendingImport.totalRows} row ${pendingImport.source} menunggu validasi/ringkasan/posting.`,
      dueDate: pendingImport.createdAt.slice(0, 10),
    });
  }

  if (unpostedSummary) {
    tasks.push({
      id: `task-summary-${unpostedSummary.id}`,
      module: "accounting",
      severity: "warning",
      title: "Post ringkasan penjualan harian",
      description: `${unpostedSummary.transactionCount} transaksi ${unpostedSummary.source} ${unpostedSummary.date} belum menjadi jurnal.`,
      dueDate: unpostedSummary.date,
    });
  }

  tasks.push({
    id: "task-tax-prep",
    module: "tax",
    severity: params.metrics.revenue > 0 ? "info" : "warning",
    title: "Siapkan export Coretax",
    description: "Rekonsiliasi omzet posted dan lampiran sebelum input manual di Coretax.",
    dueDate: taxDueDate.toISOString().slice(0, 10),
  });

  return tasks;
}

function boundedDashboard(workspace: ErpWorkspace, locationId?: string | null) {
  const summaries = locationId
    ? workspace.dailyTransactionSummaries.filter((summary) => summary.locationId === locationId)
    : workspace.dailyTransactionSummaries;

  return {
    business: workspace.business,
    period: workspace.period,
    metrics: workspace.metrics,
    locationMetrics: locationId
      ? workspace.locationMetrics.filter((metric) => metric.locationId === locationId)
      : workspace.locationMetrics,
    summaries: summaries.slice(0, 50),
    importBatches: workspace.rawImportBatches.slice(0, 25),
    tasks: workspace.tasks.slice(0, 20),
  };
}

async function loadBoundedSupabaseDashboard(request: Request, businessId: string, locationId?: string | null) {
  const supabase = createRequestSupabaseClient(request);
  let summariesQuery = supabase
    .from("daily_transaction_summaries")
    .select("*")
    .eq("business_id", businessId)
    .order("date", { ascending: false })
    .limit(500);
  let locationsQuery = supabase.from("locations").select("*").eq("business_id", businessId).order("code");

  if (locationId) {
    summariesQuery = summariesQuery.eq("location_id", locationId);
    locationsQuery = locationsQuery.eq("id", locationId);
  }

  const [business, periods, taxProfiles, locations, summaries, importBatches] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", businessId).single(),
    supabase
      .from("report_periods")
      .select("*")
      .eq("business_id", businessId)
      .order("start_date", { ascending: false })
      .limit(1),
    supabase.from("tax_profiles").select("final_umkm_rate").eq("business_id", businessId).maybeSingle(),
    locationsQuery,
    summariesQuery,
    supabase
      .from("raw_import_batches")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  const firstError = business.error ?? periods.error ?? taxProfiles.error ?? locations.error ?? summaries.error ?? importBatches.error;

  if (firstError) throw new Error(firstError.message);

  const summaryRows = rowList(summaries.data).map(mapSummary);
  const importBatchRows = rowList(importBatches.data).map(mapImportBatch);
  const period = periodFromRow(rowList(periods.data)[0] ?? {});
  const metrics = buildSummaryMetrics(summaryRows, numberValue((taxProfiles.data ?? {}) as Row, "final_umkm_rate", 0.005));
  const locationMetrics = buildLocationMetrics(rowList(locations.data).map(mapLocation), summaryRows);

  return {
    business: businessFromRow((business.data ?? {}) as Row),
    period,
    metrics,
    locationMetrics,
    summaries: summaryRows.slice(0, 50),
    importBatches: importBatchRows,
    tasks: buildBoundedTasks({ period, importBatches: importBatchRows, metrics, summaries: summaryRows }),
  };
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "business:read");

  if (isApiResponse(context)) return context;

  const locationId = new URL(request.url).searchParams.get("locationId");

  if (context.demoMode) {
    return withDemoHeader(json({ dashboard: boundedDashboard(getDemoErpStore(), locationId) }), context);
  }

  try {
    return withDemoHeader(json({ dashboard: await loadBoundedSupabaseDashboard(request, context.businessId, locationId) }), context);
  } catch (error) {
    return withDemoHeader(
      json({ error: error instanceof Error ? error.message : "Dashboard gagal dimuat." }, 500),
      context,
    );
  }
}
