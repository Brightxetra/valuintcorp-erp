import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { lockDemoPeriod } from "@/lib/erp/demo-store";
import { lockPeriodSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function periodLockErrorResponse(error: { code?: string }) {
  if (error.code?.toUpperCase() === "55P03") {
    return json(
      {
        error: "Periode sedang digunakan oleh proses posting. Coba lagi beberapa saat.",
        code: "PERIOD_LOCK_BUSY",
        retryable: true,
      },
      409,
    );
  }

  return json({ error: "Status periode gagal diperbarui." }, 422);
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = lockPeriodSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: lockDemoPeriod(parsed.data) }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await callActorServiceRpc(
    "set_report_period_lock",
    { ...parsed.data, businessId: context.businessId },
    context.userId,
  );

  if (error) {
    return withDemoHeader(periodLockErrorResponse(error), context);
  }

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }), context);
}
