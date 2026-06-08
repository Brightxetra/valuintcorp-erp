import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import type { DailyTransactionSummary, ErpWorkspace, RawTransaction, SettlementRecord } from "@/lib/erp/types";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function paramsFromUrl(request: Request) {
  const search = new URL(request.url).searchParams;

  return {
    locationId: search.get("locationId") || undefined,
    source: search.get("source") || undefined,
    dateFrom: search.get("dateFrom") || undefined,
    dateTo: search.get("dateTo") || undefined,
  };
}

function summaryMatches(summary: DailyTransactionSummary, params: ReturnType<typeof paramsFromUrl>) {
  if (params.locationId && summary.locationId !== params.locationId) return false;
  if (params.source && summary.source !== params.source) return false;
  if (params.dateFrom && summary.date < params.dateFrom) return false;
  if (params.dateTo && summary.date > params.dateTo) return false;
  return true;
}

function rawMatchesSummary(raw: RawTransaction, summary: DailyTransactionSummary) {
  return (
    raw.businessId === summary.businessId &&
    raw.locationId === summary.locationId &&
    raw.source === summary.source &&
    raw.transactionDate === summary.date
  );
}

function settlementMatchesSummary(settlement: SettlementRecord, summary: DailyTransactionSummary) {
  return (
    settlement.businessId === summary.businessId &&
    settlement.locationId === summary.locationId &&
    settlement.source === summary.source &&
    settlement.settlementDate === summary.date
  );
}

function buildReconciliation(workspace: Pick<ErpWorkspace, "dailyTransactionSummaries" | "rawTransactions" | "settlementRecords" | "journals">, params: ReturnType<typeof paramsFromUrl>) {
  return workspace.dailyTransactionSummaries
    .filter((summary) => summaryMatches(summary, params))
    .map((summary) => {
      const rawTotal = workspace.rawTransactions
        .filter((raw) => rawMatchesSummary(raw, summary) && raw.status !== "duplicate" && raw.status !== "failed")
        .reduce((total, raw) => total + raw.netAmount, 0);
      const settlementTotal = workspace.settlementRecords
        .filter((settlement) => settlementMatchesSummary(settlement, summary))
        .reduce((total, settlement) => total + settlement.netAmount, 0);
      const journalTotal = workspace.journals
        .filter((journal) => journal.referenceId === summary.id && journal.status === "posted")
        .reduce((total, journal) => total + journal.lines.reduce((lineTotal, line) => lineTotal + line.debit, 0), 0);

      return {
        summaryId: summary.id,
        businessId: summary.businessId,
        locationId: summary.locationId,
        source: summary.source,
        date: summary.date,
        status: summary.status,
        rawTotal,
        summaryTotal: summary.netAmount,
        settlementTotal,
        journalTotal,
        rawDelta: rawTotal - summary.netAmount,
        settlementDelta: settlementTotal === 0 ? 0 : settlementTotal - summary.netAmount,
        journalDelta: journalTotal === 0 ? 0 : journalTotal - summary.netAmount,
      };
    });
}

function numberValue(row: Record<string, unknown>, key: string) {
  return Number(row[key] ?? 0);
}

function mapSummary(row: Record<string, unknown>): DailyTransactionSummary {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    locationId: String(row.location_id),
    source: String(row.source) as DailyTransactionSummary["source"],
    date: String(row.date),
    status: String(row.status) as DailyTransactionSummary["status"],
    transactionCount: numberValue(row, "transaction_count"),
    grossAmount: numberValue(row, "gross_amount"),
    discountAmount: numberValue(row, "discount_amount"),
    netAmount: numberValue(row, "net_amount"),
    taxAmount: numberValue(row, "tax_amount"),
    paymentBreakdown:
      row.payment_breakdown && typeof row.payment_breakdown === "object"
        ? (row.payment_breakdown as DailyTransactionSummary["paymentBreakdown"])
        : {},
    postedJournalEntryId: typeof row.posted_journal_entry_id === "string" ? row.posted_journal_entry_id : undefined,
    createdAt: String(row.created_at),
  };
}

function mapRaw(row: Record<string, unknown>): RawTransaction {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    locationId: String(row.location_id),
    batchId: typeof row.batch_id === "string" ? row.batch_id : undefined,
    source: String(row.source) as RawTransaction["source"],
    externalId: String(row.external_id),
    transactionDate: String(row.transaction_date),
    status: String(row.status) as RawTransaction["status"],
    grossAmount: numberValue(row, "gross_amount"),
    discountAmount: numberValue(row, "discount_amount"),
    netAmount: numberValue(row, "net_amount"),
    taxAmount: numberValue(row, "tax_amount"),
    paymentMethod: String(row.payment_method ?? "cash") as RawTransaction["paymentMethod"],
    customerName: typeof row.customer_name === "string" ? row.customer_name : undefined,
    createdAt: String(row.created_at),
  };
}

function mapSettlement(row: Record<string, unknown>): SettlementRecord {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    locationId: typeof row.location_id === "string" ? row.location_id : undefined,
    source: String(row.source) as SettlementRecord["source"],
    settlementDate: String(row.settlement_date),
    method: String(row.method ?? "cash") as SettlementRecord["method"],
    grossAmount: numberValue(row, "gross_amount"),
    feeAmount: numberValue(row, "fee_amount"),
    netAmount: numberValue(row, "net_amount"),
    status: String(row.status ?? "pending") as SettlementRecord["status"],
  };
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "accounting:read");

  if (isApiResponse(context)) return context;

  const params = paramsFromUrl(request);

  if (context.demoMode) {
    return withDemoHeader(json({ rows: buildReconciliation(getDemoErpStore(), params) }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  let summariesQuery = supabase
    .from("daily_transaction_summaries")
    .select("*")
    .eq("business_id", context.businessId)
    .order("date", { ascending: false })
    .limit(500);
  let rawQuery = supabase.from("raw_transactions").select("*").eq("business_id", context.businessId).limit(10_000);
  let settlementQuery = supabase.from("settlement_records").select("*").eq("business_id", context.businessId).limit(5_000);

  if (params.locationId) {
    summariesQuery = summariesQuery.eq("location_id", params.locationId);
    rawQuery = rawQuery.eq("location_id", params.locationId);
    settlementQuery = settlementQuery.eq("location_id", params.locationId);
  }
  if (params.source) {
    summariesQuery = summariesQuery.eq("source", params.source);
    rawQuery = rawQuery.eq("source", params.source);
    settlementQuery = settlementQuery.eq("source", params.source);
  }
  if (params.dateFrom) {
    summariesQuery = summariesQuery.gte("date", params.dateFrom);
    rawQuery = rawQuery.gte("transaction_date", params.dateFrom);
    settlementQuery = settlementQuery.gte("settlement_date", params.dateFrom);
  }
  if (params.dateTo) {
    summariesQuery = summariesQuery.lte("date", params.dateTo);
    rawQuery = rawQuery.lte("transaction_date", params.dateTo);
    settlementQuery = settlementQuery.lte("settlement_date", params.dateTo);
  }

  const [summaries, rawTransactions, settlements] = await Promise.all([summariesQuery, rawQuery, settlementQuery]);
  const firstError = summaries.error ?? rawTransactions.error ?? settlements.error;

  if (firstError) return withDemoHeader(json({ error: firstError.message }, 422), context);

  const summaryRows = (Array.isArray(summaries.data) ? summaries.data : []).map((row) => mapSummary(row as Record<string, unknown>));
  const rawRows = (Array.isArray(rawTransactions.data) ? rawTransactions.data : []).map((row) => mapRaw(row as Record<string, unknown>));
  const settlementRows = (Array.isArray(settlements.data) ? settlements.data : []).map((row) => mapSettlement(row as Record<string, unknown>));
  const summaryIds = summaryRows.map((summary) => summary.id);
  const journals =
    summaryIds.length > 0
      ? await supabase
          .from("journal_entries")
          .select("id, business_id, reference_id, status, journal_lines(debit, credit)")
          .eq("business_id", context.businessId)
          .in("reference_id", summaryIds)
      : { data: [], error: null };

  if (journals.error) return withDemoHeader(json({ error: journals.error.message }, 422), context);

  const journalRows = (Array.isArray(journals.data) ? journals.data : []).map((row) => {
    const journal = row as Record<string, unknown>;
    const lines = Array.isArray(journal.journal_lines) ? journal.journal_lines : [];

    return {
      id: String(journal.id),
      businessId: String(journal.business_id),
      referenceId: typeof journal.reference_id === "string" ? journal.reference_id : undefined,
      status: String(journal.status),
      lines: lines.map((line) => ({
        debit: Number((line as Record<string, unknown>).debit ?? 0),
        credit: Number((line as Record<string, unknown>).credit ?? 0),
      })),
    };
  });

  return withDemoHeader(
    json({
      rows: buildReconciliation(
        {
          dailyTransactionSummaries: summaryRows,
          rawTransactions: rawRows,
          settlementRecords: settlementRows,
          journals: journalRows as ErpWorkspace["journals"],
        },
        params,
      ),
    }),
    context,
  );
}
