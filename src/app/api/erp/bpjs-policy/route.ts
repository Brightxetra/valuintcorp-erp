import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { bpjsPolicySchema } from "@/lib/erp/schemas";
import type { BpjsPolicy } from "@/lib/erp/types";
import { defaultBpjsPolicyForBusiness } from "@/lib/hr/bpjs";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
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

function textValue(row: Row, key: string, fallback = "") {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

function policyFromRow(row: Row, businessId: string): BpjsPolicy {
  const fallback = defaultBpjsPolicyForBusiness(businessId);
  return {
    id: textValue(row, "id", fallback.id),
    businessId,
    effectiveDate: textValue(row, "effective_date", fallback.effectiveDate),
    grossSalaryMultiplier: numberValue(row, "gross_salary_multiplier", fallback.grossSalaryMultiplier),
    healthEmployeeRate: numberValue(row, "health_employee_rate", fallback.healthEmployeeRate),
    healthEmployerRate: numberValue(row, "health_employer_rate", fallback.healthEmployerRate),
    healthSalaryCap: numberValue(row, "health_salary_cap", fallback.healthSalaryCap),
    jhtEmployeeRate: numberValue(row, "jht_employee_rate", fallback.jhtEmployeeRate),
    jhtEmployerRate: numberValue(row, "jht_employer_rate", fallback.jhtEmployerRate),
    jhtSalaryCap: numberValue(row, "jht_salary_cap", fallback.jhtSalaryCap),
    jpnEmployeeRate: numberValue(row, "jpn_employee_rate", fallback.jpnEmployeeRate),
    jpnEmployerRate: numberValue(row, "jpn_employer_rate", fallback.jpnEmployerRate),
    jpnSalaryCap: numberValue(row, "jpn_salary_cap", fallback.jpnSalaryCap),
    jkkEmployerRate: numberValue(row, "jkk_employer_rate", fallback.jkkEmployerRate),
    jkmEmployerRate: numberValue(row, "jkm_employer_rate", fallback.jkmEmployerRate),
    updatedAt: textValue(row, "updated_at") || undefined,
  };
}

function isMissingPolicyTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || /bpjs_policies/i.test(error?.message ?? "");
}

function isMissingPolicyCommand(error: { code?: string; message?: string } | null) {
  return error?.code === "42883"
    || error?.code === "PGRST202"
    || /upsert_bpjs_policy/i.test(error?.message ?? "");
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "payroll:run");
  if (isApiResponse(context)) return context;

  if (context.demoMode) {
    return withDemoHeader(json({ policy: defaultBpjsPolicyForBusiness(context.businessId) }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("bpjs_policies")
    .select("*")
    .eq("business_id", context.businessId)
    .maybeSingle();

  if (isMissingPolicyTable(error)) {
    return withDemoHeader(json({ policy: defaultBpjsPolicyForBusiness(context.businessId), migrationRequired: true }), context);
  }

  if (error) {
    return withDemoHeader(json({ error: "Konfigurasi BPJS gagal dimuat." }, 422), context);
  }

  return withDemoHeader(json({ policy: data ? policyFromRow(data as Row, context.businessId) : defaultBpjsPolicyForBusiness(context.businessId) }), context);
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "hr:manage");
  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = bpjsPolicySchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  const policy: BpjsPolicy = {
    ...defaultBpjsPolicyForBusiness(context.businessId),
    ...parsed.data,
  };

  if (context.demoMode) {
    return withDemoHeader(json({ policy }), context);
  }

  let rpcResult: Awaited<ReturnType<typeof callActorServiceRpc>>;

  try {
    rpcResult = await callActorServiceRpc(
      "upsert_bpjs_policy",
      { ...parsed.data, businessId: context.businessId },
      context.userId,
    );
  } catch {
    return withDemoHeader(
      json(
        {
          error: "Layanan konfigurasi BPJS sementara tidak tersedia.",
          code: "BPJS_POLICY_UNAVAILABLE",
        },
        503,
      ),
      context,
    );
  }

  const { data, error } = rpcResult;

  if (isMissingPolicyCommand(error)) {
    return withDemoHeader(json({ error: "Upgrade keamanan konfigurasi BPJS belum diterapkan." }, 422), context);
  }

  if (error) {
    return withDemoHeader(json({ error: "Konfigurasi BPJS gagal disimpan." }, 422), context);
  }

  if (
    !data
    || typeof data !== "object"
    || Array.isArray(data)
    || textValue(data as Row, "business_id") !== context.businessId
  ) {
    return withDemoHeader(json({ error: "Konfigurasi BPJS gagal disimpan." }, 422), context);
  }

  return withDemoHeader(json({ policy: policyFromRow(data as Row, context.businessId) }), context);
}
