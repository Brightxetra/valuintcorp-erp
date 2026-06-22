import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { createBranchExpenseSchema } from "@/lib/erp/schemas";
import { createDemoBranchExpense } from "@/lib/erp/demo-store";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";

function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "no-store" } }); }

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "pos:expenses");
  if (isApiResponse(context)) return context;
  const parsed = createBranchExpenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  const canAccessLocation = context.role === "owner" || context.role === "system_admin" || context.accessScope !== "custom" || context.assignedLocationIds.includes(parsed.data.locationId);
  if (!canAccessLocation) return withDemoHeader(json({ error: "Cabang ini tidak ditugaskan kepada Anda." }, 403), context);
  if (context.demoMode) {
    try {
      const result = createDemoBranchExpense({ ...parsed.data, date: parsed.data.date ?? new Date().toISOString().slice(0, 10) });
      return withDemoHeader(json(result, 201), context);
    } catch (caught) {
      return withDemoHeader(json({ error: caught instanceof Error ? caught.message : "Biaya cabang demo gagal diposting." }, 422), context);
    }
  }
  const { data, error } = await callActorServiceRpc("post_branch_expense", { ...parsed.data, businessId: context.businessId }, context.userId);
  if (error) return withDemoHeader(json({ error: error.message }, 422), context);
  return withDemoHeader(json({ expenseId: data }, 201), context);
}
