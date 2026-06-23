import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { createDemoStockReceipt } from "@/lib/erp/demo-store";
import { createStockReceiptSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "inventory:manage");
  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = createStockReceiptSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    try {
      return withDemoHeader(json({ workspace: createDemoStockReceipt(parsed.data) }, 201), context);
    } catch (error) {
      return withDemoHeader(json({ error: error instanceof Error ? error.message : "Stok masuk gagal dicatat." }, 422), context);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, sku, name, unit, track_stock, is_active, is_purchasable")
    .eq("business_id", context.businessId)
    .eq("id", parsed.data.itemId)
    .maybeSingle();

  if (productError) {
    return withDemoHeader(json({ error: productError.message }, 422), context);
  }

  if (!product || product.is_active === false || product.track_stock === false || product.is_purchasable === false) {
    return withDemoHeader(json({ error: "Produk stok tidak ditemukan atau tidak bisa dibeli." }, 422), context);
  }

  const { data: warehouse, error: warehouseError } = await supabase
    .from("warehouses")
    .select("id, name, is_active")
    .eq("business_id", context.businessId)
    .eq("id", parsed.data.warehouseId)
    .maybeSingle();

  if (warehouseError) {
    return withDemoHeader(json({ error: warehouseError.message }, 422), context);
  }

  if (!warehouse || warehouse.is_active === false) {
    return withDemoHeader(json({ error: "Gudang tidak ditemukan atau tidak aktif." }, 422), context);
  }

  const value = parsed.data.quantity * parsed.data.unitCost;
  const memo = parsed.data.memo ?? "Stok masuk manual";
  const { error } = await supabase.from("stock_movements").insert({
    business_id: context.businessId,
    item_id: parsed.data.itemId,
    warehouse_id: parsed.data.warehouseId,
    date: parsed.data.date,
    type: "purchase",
    quantity: parsed.data.quantity,
    value,
    memo,
  });

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  await supabase.from("activity_events").insert({
    business_id: context.businessId,
    actor_user_id: context.userId,
    actor_name: context.userName ?? context.userEmail ?? context.userId,
    module: "inventory",
    action: "stock receipt",
    description: `${product.sku} stok masuk ${parsed.data.quantity} ${product.unit ?? "unit"}.`,
  });

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context, { profile: "inventory" }) }, 201), context);
}
