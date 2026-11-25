import { z } from "zod";
import { isApiResponse, requireApiPermission } from "@/lib/auth/api";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";

const reportInput = z.object({
  companyIds: z.array(z.uuid()).min(2).max(25),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
}).refine((input) => input.startDate <= input.endDate && new Set(input.companyIds).size === input.companyIds.length);

function respond(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "reports:export");
  if (isApiResponse(context)) return context;
  if (context.demoMode) return respond({ error: "Ringkasan membutuhkan dua perusahaan aktif." }, 422);
  if (!context.permissions.includes("accounting:read")) return respond({ error: "Akses keuangan diperlukan." }, 403);

  const input = reportInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return respond({ error: "Pilih 2 sampai 25 perusahaan dan rentang tanggal yang valid." }, 400);

  const { data, error } = await callActorServiceRpc(
    "company_report_summary",
    { ...input.data, businessId: context.businessId },
    context.userId,
  );
  if (error?.code === "42501") return respond({ error: error.message }, 403);
  if (error?.code === "22023") return respond({ error: error.message }, 422);
  if (error) return respond({ error: "Ringkasan perusahaan gagal dimuat." }, 500);
  return respond(data);
}
