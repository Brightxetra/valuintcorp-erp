import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import type { RawTransaction } from "@/lib/erp/types";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function paramsFromUrl(request: Request) {
  const search = new URL(request.url).searchParams;
  const page = Math.max(Number(search.get("page") ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(search.get("pageSize") ?? 50), 1), 100);

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

function filterRows(rows: RawTransaction[], params: ReturnType<typeof paramsFromUrl>) {
  return rows.filter((row) => {
    if (params.locationId && row.locationId !== params.locationId) return false;
    if (params.source && row.source !== params.source) return false;
    if (params.status && row.status !== params.status) return false;
    if (params.dateFrom && row.transactionDate < params.dateFrom) return false;
    if (params.dateTo && row.transactionDate > params.dateTo) return false;
    return true;
  });
}

function mapRawTransaction(row: Record<string, unknown>): RawTransaction {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    locationId: String(row.location_id),
    batchId: typeof row.batch_id === "string" ? row.batch_id : undefined,
    source: String(row.source) as RawTransaction["source"],
    externalId: String(row.external_id),
    transactionDate: String(row.transaction_date),
    status: String(row.status) as RawTransaction["status"],
    grossAmount: Number(row.gross_amount ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    netAmount: Number(row.net_amount ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    paymentMethod: String(row.payment_method ?? "cash") as RawTransaction["paymentMethod"],
    customerName: typeof row.customer_name === "string" ? row.customer_name : undefined,
    createdAt: String(row.created_at),
  };
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "accounting:read");

  if (isApiResponse(context)) return context;

  const params = paramsFromUrl(request);
  const offset = (params.page - 1) * params.pageSize;

  if (context.demoMode) {
    const filtered = filterRows(getDemoErpStore().rawTransactions, params).sort((a, b) =>
      b.transactionDate.localeCompare(a.transactionDate),
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
    .from("raw_transactions")
    .select("*", { count: "exact" })
    .eq("business_id", context.businessId)
    .order("transaction_date", { ascending: false })
    .range(offset, offset + params.pageSize - 1);

  if (params.locationId) query = query.eq("location_id", params.locationId);
  if (params.source) query = query.eq("source", params.source);
  if (params.status) query = query.eq("status", params.status);
  if (params.dateFrom) query = query.gte("transaction_date", params.dateFrom);
  if (params.dateTo) query = query.lte("transaction_date", params.dateTo);

  const { data, error, count } = await query;

  if (error) return withDemoHeader(json({ error: error.message }, 422), context);

  return withDemoHeader(
    json({
      rows: (Array.isArray(data) ? data : []).map((row) => mapRawTransaction(row as Record<string, unknown>)),
      page: params.page,
      pageSize: params.pageSize,
      total: count ?? 0,
    }),
    context,
  );
}
