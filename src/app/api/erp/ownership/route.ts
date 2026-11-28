import { z } from "zod";
import { isApiResponse, requireAuthenticatedUser } from "@/lib/auth/api";
import { createRequestSupabaseClient } from "@/lib/supabase/server";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";

const target = { businessId: z.string().uuid() };
const transferSchema = z.discriminatedUnion("action", [
  z.object({ ...target, action: z.literal("request"), recipientId: z.string().uuid() }),
  z.object({ ...target, action: z.enum(["accept", "decline", "cancel"]), transferId: z.string().uuid() }),
]);

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await requireAuthenticatedUser(request);
  if (isApiResponse(user)) return user;
  if (user.demoMode) return json({ transfers: [] });

  const { data, error } = await createRequestSupabaseClient(request).from("business_ownership_transfers")
    .select("id, business_id, requested_by, recipient_id, expires_at")
    .or(`requested_by.eq.${user.userId},recipient_id.eq.${user.userId}`)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at");

  if (error) return json({ error: "Permintaan transfer gagal dimuat." }, 422);
  return json({ transfers: data });
}

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser(request);
  if (isApiResponse(user)) return user;
  if (user.demoMode) return json({ error: "Transfer kepemilikan tidak tersedia dalam demo." }, 403);

  const parsed = transferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Permintaan transfer tidak lengkap." }, 400);

  const { data, error } = await callActorServiceRpc("change_business_ownership", parsed.data, user.userId);
  if (error?.code === "23505") return json({ error: "Perusahaan sudah memiliki permintaan transfer menunggu tanggapan." }, 409);
  if (error) return json({ error: error.message }, error.code === "42501" ? 403 : 422);
  return json({ transferId: data });
}
