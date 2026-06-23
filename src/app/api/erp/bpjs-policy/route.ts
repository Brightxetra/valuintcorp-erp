import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { bpjsPolicySchema } from "@/lib/erp/schemas";
import type { BpjsPolicy } from "@/lib/erp/types";
import { defaultBpjsPolicyForBusiness } from "@/lib/hr/bpjs";
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

function toDb(policy: BpjsPolicy) {
  return {
    business_id: policy.businessId,
    effective_date: policy.effectiveDate,
    gross_salary_multiplier: policy.grossSalaryMultiplier,
    health_employee_rate: policy.healthEmployeeRate,
    health_employer_rate: policy.healthEmployerRate,
    health_salary_cap: policy.healthSalaryCap,
    jht_employee_rate: policy.jhtEmployeeRate,
    jht_employer_rate: policy.jhtEmployerRate,
    jht_salary_cap: policy.jhtSalaryCap,
    jpn_employee_rate: policy.jpnEmployeeRate,
    jpn_employer_rate: policy.jpnEmployerRate,
    jpn_salary_cap: policy.jpnSalaryCap,
    jkk_employer_rate: policy.jkkEmployerRate,
    jkm_employer_rate: policy.jkmEmployerRate,
  };
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
    return withDemoHeader(json({ error: error.message }, 422), context);
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

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("bpjs_policies")
    .upsert(toDb(policy), { onConflict: "business_id" })
    .select("*")
    .single();

  if (isMissingPolicyTable(error)) {
    return withDemoHeader(json({ error: "Tabel konfigurasi BPJS belum tersedia. Jalankan migration 022_employee_profiles_and_bpjs_policy.sql di Supabase." }, 422), context);
  }

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  return withDemoHeader(json({ policy: policyFromRow(data as Row, context.businessId) }), context);
}
