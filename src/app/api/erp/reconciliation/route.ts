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

function mapRollupRow(row: Record<string, unknown>) {
  return {
    summaryId: String(row.summary_id),
    businessId: String(row.business_id),
    locationId: String(row.location_id),
    date: String(row.date),
    source: String(row.source) as RawTransaction["source"],
    status: String(row.status),
    rawTotal: Number(row.raw_total ?? 0),
    summaryTotal: Number(row.summary_total ?? 0),
    settlementTotal: Number(row.settlement_total ?? 0),
    journalTotal: Number(row.journal_total ?? 0),
    rawDelta: Number(row.raw_delta ?? 0),
    settlementDelta: Number(row.settlement_delta ?? 0),
    journalDelta: Number(row.journal_delta ?? 0),
  };
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "accounting:read");

  if (isApiResponse(context)) return context;

  const params = paramsFromUrl(request);

  if (context.demoMode) {
    return withDemoHeader(json({ rows: buildReconciliation(getDemoErpStore(), params) }), context);
  }

  const { data, error } = await createRequestSupabaseClient(request).rpc("reconciliation_rollup", {
    target_business_id: context.businessId,
    target_location_id: params.locationId ?? null,
    target_source: params.source ?? null,
    target_date_from: params.dateFrom ?? null,
    target_date_to: params.dateTo ?? null,
    result_limit: 500,
  });

  if (error) return withDemoHeader(json({ error: error.message }, 422), context);

  return withDemoHeader(json({ rows: (Array.isArray(data) ? data : []).map((row) => mapRollupRow(row as Record<string, unknown>)) }), context);
}
