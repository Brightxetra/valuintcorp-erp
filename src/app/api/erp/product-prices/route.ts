import { z } from "zod";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { updateDemoProductPrice } from "@/lib/erp/demo-store";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

const priceUpdate = z.strictObject({
  productId: z.string().min(1),
  type: z.enum(["selling", "purchase"]),
  price: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export async function PATCH(request: Request) {
  const context = await requireApiPermission(request, "inventory:manage");
  if (isApiResponse(context)) return context;

  const respond = (data: unknown, status = 200) =>
    withDemoHeader(Response.json(data, { status, headers: { "cache-control": "no-store" } }), context);

  const input = priceUpdate.safeParse(await request.json().catch(() => null));
  if (!input.success) return respond({ error: "Produk, tipe harga, dan harga rupiah wajib diisi." }, 400);

  const { productId, type, price } = input.data;
  const changes = type === "selling" ? { sellingPrice: price } : { purchasePrice: price };
  if (context.demoMode) {
    if (!updateDemoProductPrice(productId, changes)) return respond({ error: "Produk aktif tidak ditemukan." }, 404);
    return respond({ productId, changes });
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("products")
    .update(type === "selling" ? { selling_price: price } : { purchase_price: price })
    .eq("business_id", context.businessId)
    .eq("id", productId)
    .eq("is_active", true)
    .select("id")
    .maybeSingle();

  if (error) return respond({ error: "Harga produk gagal disimpan." }, 422);
  if (!data) return respond({ error: "Produk aktif tidak ditemukan." }, 404);
  return respond({ productId, changes });
}
