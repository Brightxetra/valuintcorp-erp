import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import type { DailyTransactionSummary } from "@/lib/erp/types";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function paramsFromUrl(request: Request) {
  const search = new URL(request.url).searchParams;
  const page = Math.max(Number(search.get("page") ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(search.get("pageSize") ?? 100), 1), 200);

  return {
    locationId: search.get("locationId") || undefined,
    source: search.get("source") || undefined,
    status: search.get("status") || undefined,
    dateFrom: search.get("dateFrom") || undefined,
    dateTo: search.get("dateTo") || undefined,
    page,
    pageSize,
  };
}

function filterRows(rows: DailyTransactionSummary[], params: ReturnType<typeof paramsFromUrl>) {
  return rows.filter((row) => {
    if (params.locationId && row.locationId !== params.locationId) return false;
    if (params.source && row.source !== params.source) return false;
    if (params.status && row.status !== params.status) return false;
    if (params.dateFrom && row.date < params.dateFrom) return false;
    if (params.dateTo && row.date > params.dateTo) return false;
    return true;
  });
}

function mapSummary(row: Record<string, unknown>): DailyTransactionSummary {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    locationId: String(row.location_id),
    source: String(row.source) as DailyTransactionSummary["source"],
    date: String(row.date),
    status: String(row.status) as DailyTransactionSummary["status"],
    transactionCount: Number(row.transaction_count ?? 0),
    grossAmount: Number(row.gross_amount ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    netAmount: Number(row.net_amount ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    paymentBreakdown:
      row.payment_breakdown && typeof row.payment_breakdown === "object"
        ? (row.payment_breakdown as DailyTransactionSummary["paymentBreakdown"])
        : {},
    postedJournalEntryId: typeof row.posted_journal_entry_id === "string" ? row.posted_journal_entry_id : undefined,
    createdAt: String(row.created_at),
  };
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "accounting:read");

  if (isApiResponse(context)) return context;

  const params = paramsFromUrl(request);
  const offset = (params.page - 1) * params.pageSize;

  if (context.demoMode) {
    const filtered = filterRows(getDemoErpStore().dailyTransactionSummaries, params).sort((a, b) =>
      b.date.localeCompare(a.date),
    );

    return withDemoHeader(
      json({
        rows: filtered.slice(offset, offset + params.pageSize),
        page: params.page,
        pageSize: params.pageSize,
        total: filtered.length,
      }),
      context,
    );
  }

  const supabase = createRequestSupabaseClient(request);
  let query = supabase
    .from("daily_transaction_summaries")
    .select("*", { count: "exact" })
    .eq("business_id", context.businessId)
    .order("date", { ascending: false })
    .range(offset, offset + params.pageSize - 1);

  if (params.locationId) query = query.eq("location_id", params.locationId);
  if (params.source) query = query.eq("source", params.source);
  if (params.status) query = query.eq("status", params.status);
  if (params.dateFrom) query = query.gte("date", params.dateFrom);
  if (params.dateTo) query = query.lte("date", params.dateTo);

  const { data, error, count } = await query;

  if (error) return withDemoHeader(json({ error: error.message }, 422), context);

  return withDemoHeader(
    json({
      rows: (Array.isArray(data) ? data : []).map((row) => mapSummary(row as Record<string, unknown>)),
      page: params.page,
      pageSize: params.pageSize,
      total: count ?? 0,
    }),
    context,
  );
}
