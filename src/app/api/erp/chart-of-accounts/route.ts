import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { archiveDemoChartOfAccount, saveDemoChartOfAccount } from "@/lib/erp/demo-store";
import { chartOfAccountSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function toDb(values: Record<string, unknown>, businessId: string) {
  return {
    business_id: businessId,
    code: values.code,
    name: values.name,
    type: values.type,
    normal_balance: values.normalBalance,
    category: values.category,
    is_active: values.isActive,
  };
}

async function reloadWorkspace(request: Request, context: Awaited<ReturnType<typeof requireApiPermission>>) {
  if (isApiResponse(context)) return context;
  const supabase = createRequestSupabaseClient(request);
  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context, { profile: "accounting" }) }), context);
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");
  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const id = typeof payload?.id === "string" && payload.id.length > 0 ? payload.id : undefined;
  const parsed = chartOfAccountSchema.safeParse(payload?.values ?? payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: saveDemoChartOfAccount(id, parsed.data) }, id ? 200 : 201), context);
  }

  const supabase = createRequestSupabaseClient(request);

  if (id) {
    const { data: existing, error: existingError } = await supabase
      .from("chart_of_accounts")
      .select("id, is_system")
      .eq("business_id", context.businessId)
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return withDemoHeader(json({ error: existingError.message }, 422), context);
    }

    if (!existing) {
      return withDemoHeader(json({ error: "Akun tidak ditemukan." }, 404), context);
    }

    if (existing.is_system) {
      return withDemoHeader(json({ error: "Akun sistem tidak bisa diedit dari UI. Buat akun turunan/custom untuk kebutuhan bisnis." }, 422), context);
    }
  }

  const result = id
    ? await supabase
        .from("chart_of_accounts")
        .update(toDb(parsed.data, context.businessId))
        .eq("business_id", context.businessId)
        .eq("id", id)
    : await supabase.from("chart_of_accounts").insert(toDb(parsed.data, context.businessId));

  if (result.error) {
    return withDemoHeader(json({ error: result.error.message }, 422), context);
  }

  return reloadWorkspace(request, context);
}

export async function DELETE(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");
  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const id = typeof payload?.id === "string" ? payload.id : "";

  if (!id) {
    return withDemoHeader(json({ error: "ID akun wajib diisi." }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: archiveDemoChartOfAccount(id) }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { data: existing, error: existingError } = await supabase
    .from("chart_of_accounts")
    .select("id, is_system")
    .eq("business_id", context.businessId)
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return withDemoHeader(json({ error: existingError.message }, 422), context);
  }

  if (!existing) {
    return withDemoHeader(json({ error: "Akun tidak ditemukan." }, 404), context);
  }

  if (existing.is_system) {
    return withDemoHeader(json({ error: "Akun sistem tidak bisa dinonaktifkan." }, 422), context);
  }

  const { error } = await supabase
    .from("chart_of_accounts")
    .update({ is_active: false })
    .eq("business_id", context.businessId)
    .eq("id", id);

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  return reloadWorkspace(request, context);
}
