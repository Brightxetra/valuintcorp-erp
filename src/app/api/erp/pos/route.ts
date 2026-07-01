import { z } from "zod";
import { isApiResponse, requireApiPermission, type ApiContext, withDemoHeader } from "@/lib/auth/api";
import { createDemoPayment, createDemoSalesInvoice, getDemoBranchExpenses, getDemoErpStore } from "@/lib/erp/demo-store";
import { postPosSaleSchema } from "@/lib/erp/schemas";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type Row = Record<string, unknown>;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const posLocationTypes = new Set(["branch", "outlet", "store"]);

function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "no-store" } }); }

function numberValue(value: unknown) { return typeof value === "number" ? value : Number(value ?? 0); }
function rowArray(value: unknown): Row[] { return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object") : []; }
function nonNegativeMoney(value: number) { return Math.max(0, Math.round(value)); }
function canAccessLocation(context: ApiContext, locationId: string) {
  return context.role === "owner" || context.role === "system_admin" || context.accessScope !== "custom" || context.assignedLocationIds.includes(locationId);
}
function stockQuantity(movements: Row[], productId: string) {
  return movements.filter((movement) => String(movement.item_id ?? movement.itemId) === productId).reduce((total, movement) => total + (["purchase", "transfer_in", "adjustment_in"].includes(String(movement.type)) ? numberValue(movement.quantity) : -numberValue(movement.quantity)), 0);
}
function recipeAvailability(product: Row, products: Row[], structures: Row[], movements: Row[]) {
  if (String(product.fulfillment_method ?? product.fulfillmentMethod) !== "recipe_on_sale") {
    return Boolean(product.track_stock ?? product.trackStock) ? stockQuantity(movements, String(product.id)) : null;
  }

  const structure = structures.find((item) => String(item.parent_product_id ?? item.parentProductId) === String(product.id) && Boolean(item.is_active ?? item.isActive ?? true));
  const lines = rowArray(structure?.product_structure_lines ?? structure?.lines);
  if (!structure || lines.length === 0) return Boolean(product.track_stock ?? product.trackStock) ? stockQuantity(movements, String(product.id)) : null;

  const outputQuantity = Math.max(numberValue(structure.output_quantity ?? structure.outputQuantity), 1);
  const yieldFactor = Math.max(numberValue(structure.yield_percent ?? structure.yieldPercent), 1) / 100;
  const availability = lines
    .map((line) => {
      const componentId = String(line.component_product_id ?? line.componentProductId);
      const component = products.find((item) => String(item.id) === componentId);
      if (component && !(component.track_stock ?? component.trackStock)) return Number.POSITIVE_INFINITY;
      const requiredPerUnit = numberValue(line.quantity) * (1 + numberValue(line.waste_percent ?? line.wastePercent) / 100) / outputQuantity / yieldFactor;
      return requiredPerUnit > 0 ? stockQuantity(movements, componentId) / requiredPerUnit : Number.POSITIVE_INFINITY;
    });

  const maxFromIngredients = Math.floor(Math.min(...availability));
  return Number.isFinite(maxFromIngredients) ? Math.max(maxFromIngredients, 0) : null;
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "pos:read");
  if (isApiResponse(context)) return context;
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? "";
  const parsedDate = dateSchema.safeParse(url.searchParams.get("date") ?? undefined);
  const date = parsedDate.success && parsedDate.data ? parsedDate.data : new Date().toISOString().slice(0, 10);
  if (!locationId) return withDemoHeader(json({ error: "locationId wajib diisi." }, 400), context);
  if (!canAccessLocation(context, locationId)) return withDemoHeader(json({ error: "Cabang ini tidak ditugaskan kepada Anda." }, 403), context);

  if (context.demoMode) {
    const workspace = getDemoErpStore();
    const location = workspace.locations.find((item) => item.id === locationId);
    if (!location) return withDemoHeader(json({ error: "Cabang tidak ditemukan." }, 404), context);
    if (!posLocationTypes.has(location.type) || !location.warehouseId) return withDemoHeader(json({ error: "Cabang aktif dengan gudang diperlukan untuk POS." }, 422), context);
    const movements = workspace.stockMovements.filter((movement) => movement.warehouseId === location.warehouseId && movement.date <= date);
    const products = workspace.products.filter((product) => product.isActive !== false && product.isSellable).map((product) => ({
      id: product.id, sku: product.sku, name: product.name, unit: product.unit, sellingPrice: product.sellingPrice,
      availableQuantity: recipeAvailability(product as unknown as Row, workspace.products as unknown as Row[], workspace.productStructures as unknown as Row[], movements as unknown as Row[]), trackStock: product.trackStock,
    }));
    const sales = workspace.salesInvoices.filter((invoice) => invoice.source === "pos" && invoice.locationId === locationId && invoice.date === date && invoice.status !== "void").map((invoice) => ({ id: invoice.id, invoiceNo: invoice.invoiceNo, date: invoice.date, total: invoice.total, cogs: invoice.lines.reduce((total, line) => total + line.quantity * line.cogs, 0) }));
    const stockValueAt = (beforeDate: boolean) => nonNegativeMoney(movements
      .filter((movement) => !beforeDate || movement.date < date)
      .reduce((total, movement) => total + movement.value * (
        ["purchase", "transfer_in", "adjustment_in"].includes(movement.type) ? 1 : -1
      ), 0));
    const expenses = getDemoBranchExpenses(locationId, date);
    return withDemoHeader(json({ location, date, products, recap: { revenue: sales.reduce((total, sale) => total + sale.total, 0), cogs: sales.reduce((total, sale) => total + sale.cogs, 0), miscExpenses: expenses.reduce((total, expense) => total + expense.amount, 0), openingStock: stockValueAt(true), closingStock: stockValueAt(false), sales, expenses } }), context);
  }

  const service = createServiceSupabaseClient();
  const { data: location, error: locationError } = await service.from("locations").select("id, code, name, type, warehouse_id").eq("id", locationId).eq("business_id", context.businessId).eq("is_active", true).maybeSingle();
  if (locationError) return withDemoHeader(json({ error: locationError.message }, 422), context);
  if (!location?.warehouse_id || !posLocationTypes.has(String(location.type))) return withDemoHeader(json({ error: "Cabang aktif dengan gudang diperlukan untuk POS." }, 422), context);

  const [productsResult, allProductsResult, structuresResult, movementsResult, salesResult, expensesResult] = await Promise.all([
    service.from("products").select("*").eq("business_id", context.businessId).eq("is_active", true).eq("is_sellable", true).order("name"),
    service.from("products").select("*").eq("business_id", context.businessId).eq("is_active", true),
    service.from("product_structures").select("id, parent_product_id, output_quantity, yield_percent, is_active, product_structure_lines(component_product_id, quantity, waste_percent)").eq("business_id", context.businessId).eq("is_active", true),
    service.from("stock_movements").select("item_id, type, quantity, value, date").eq("business_id", context.businessId).eq("warehouse_id", location.warehouse_id).lte("date", date),
    service.from("sales_invoices").select("id, invoice_no, date, total, sales_invoice_lines(quantity, cogs)").eq("business_id", context.businessId).eq("location_id", locationId).eq("source", "pos").eq("date", date).neq("status", "void").order("created_at", { ascending: false }),
    service.from("branch_expenses").select("id, date, amount, category, memo").eq("business_id", context.businessId).eq("location_id", locationId).eq("date", date).order("created_at", { ascending: false }),
  ]);
  const queryError = productsResult.error ?? movementsResult.error ?? salesResult.error ?? expensesResult.error;
  if (queryError) return withDemoHeader(json({ error: queryError.message }, 422), context);

  const movements = rowArray(movementsResult.data);
  const allProducts = rowArray(allProductsResult.data).length ? rowArray(allProductsResult.data) : rowArray(productsResult.data);
  const structures = structuresResult.error ? [] : rowArray(structuresResult.data);
  const products = rowArray(productsResult.data).map((product) => ({
    id: String(product.id), sku: String(product.sku), name: String(product.name), unit: String(product.unit), sellingPrice: numberValue(product.selling_price), trackStock: Boolean(product.track_stock),
    availableQuantity: recipeAvailability(product, allProducts, structures, movements),
  }));
  const sales = rowArray(salesResult.data).map((sale) => ({
    id: String(sale.id), invoiceNo: String(sale.invoice_no), date: String(sale.date), total: numberValue(sale.total),
    cogs: rowArray(sale.sales_invoice_lines).reduce((total, line) => total + numberValue(line.quantity) * numberValue(line.cogs), 0),
  }));
  const expenses = rowArray(expensesResult.data).map((expense) => ({ id: String(expense.id), date: String(expense.date), amount: numberValue(expense.amount), category: String(expense.category), memo: typeof expense.memo === "string" ? expense.memo : undefined }));
  const stockValueAt = (beforeDate: boolean) => nonNegativeMoney(movements.filter((movement) => !beforeDate || String(movement.date) < date).reduce((total, movement) => total + numberValue(movement.value) * (["purchase", "transfer_in", "adjustment_in"].includes(String(movement.type)) ? 1 : -1), 0));

  return withDemoHeader(json({
    location: { id: location.id, code: location.code, name: location.name, warehouseId: location.warehouse_id }, date, products,
    recap: { revenue: sales.reduce((total, sale) => total + sale.total, 0), cogs: sales.reduce((total, sale) => total + sale.cogs, 0), miscExpenses: expenses.reduce((total, expense) => total + expense.amount, 0), openingStock: stockValueAt(true), closingStock: stockValueAt(false), sales, expenses },
  }), context);
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "pos:sell");
  if (isApiResponse(context)) return context;
  const parsed = postPosSaleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  if (!canAccessLocation(context, parsed.data.locationId)) return withDemoHeader(json({ error: "Cabang ini tidak ditugaskan kepada Anda." }, 403), context);
  if (context.demoMode) {
    const workspace = getDemoErpStore();
    const location = workspace.locations.find((item) => item.id === parsed.data.locationId && item.isActive && item.warehouseId);
    const customer = workspace.customers.find((item) => item.isActive && item.creditLimit > 0);
    if (!location?.warehouseId) return withDemoHeader(json({ error: "Cabang POS aktif dengan gudang diperlukan." }, 422), context);
    if (!customer) return withDemoHeader(json({ error: "Customer demo dengan limit kredit diperlukan untuk membuat transaksi POS." }, 422), context);
    const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
    try {
      const invoiceWorkspace = createDemoSalesInvoice({
        customerId: customer.id,
        date,
        dueDate: date,
        items: parsed.data.items.map((item) => ({ ...item, warehouseId: location.warehouseId })),
      }, { locationId: location.id, source: "pos" });
      const invoice = invoiceWorkspace.salesInvoices[0];
      if (!invoice) return withDemoHeader(json({ error: "Invoice POS demo tidak dapat dibuat." }, 422), context);
      const nextWorkspace = createDemoPayment({ direction: "inbound", documentType: "sales_invoice", documentId: invoice.id, amount: invoice.total, method: parsed.data.paymentMethod, date });
      return withDemoHeader(json({ saleId: invoice.id, workspace: nextWorkspace }, 201), context);
    } catch (caught) {
      return withDemoHeader(json({ error: caught instanceof Error ? caught.message : "Transaksi POS demo gagal diposting." }, 422), context);
    }
  }
  const { data, error } = await callActorServiceRpc("post_pos_sale", { ...parsed.data, businessId: context.businessId }, context.userId);
  if (error) return withDemoHeader(json({ error: error.message }, 422), context);
  return withDemoHeader(json({ saleId: data }, 201), context);
}
