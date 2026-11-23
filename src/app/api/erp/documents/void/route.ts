import { isApiResponse, requireApiMembership, withDemoHeader } from "@/lib/auth/api";
import { voidDemoDocument } from "@/lib/erp/demo-store";
import { voidDocumentSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiMembership(request);

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = voidDocumentSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  const requiredPermission = ["stock_adjustment", "stock_transfer"].includes(
    parsed.data.documentType,
  )
    ? "inventory:manage"
    : "accounting:write";

  if (!context.permissions.includes(requiredPermission)) {
    return withDemoHeader(
      json(
        {
          error: `Role ${context.role} is not allowed to perform ${requiredPermission}.`,
        },
        403,
      ),
      context,
    );
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: voidDemoDocument(parsed.data) }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await callActorServiceRpc(
    "void_document",
    { ...parsed.data, businessId: context.businessId },
    context.userId,
  );

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }), context);
}
