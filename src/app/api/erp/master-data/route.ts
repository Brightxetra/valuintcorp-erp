import type { Permission } from "@/lib/security/permissions";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import {
  archiveDemoMasterData,
  saveDemoMasterData,
} from "@/lib/erp/demo-store";
import {
  businessUpdateSchema,
  customerSchema,
  employeeSchema,
  masterDataMutationSchema,
  masterResourceSchema,
  productSchema,
  supplierSchema,
  taxProfileUpdateSchema,
  warehouseSchema,
} from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

type MasterResource = ReturnType<typeof masterResourceSchema.parse>;

const permissions: Record<MasterResource, Permission> = {
  customer: "accounting:write",
  supplier: "accounting:write",
  product: "inventory:manage",
  warehouse: "inventory:manage",
  employee: "hr:manage",
  business: "business:update",
  tax_profile: "tax:prepare",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function parseValues(resource: MasterResource, values: Record<string, unknown>) {
  const schemas = {
    customer: customerSchema,
    supplier: supplierSchema,
    product: productSchema,
    warehouse: warehouseSchema,
    employee: employeeSchema,
    business: businessUpdateSchema,
    tax_profile: taxProfileUpdateSchema,
  };

  return schemas[resource].safeParse(values);
}

function toDb(resource: MasterResource, values: Record<string, unknown>, businessId: string) {
  if (resource === "customer") {
    return {
      business_id: businessId,
      code: values.code,
      name: values.name,
      phone: values.phone ?? null,
      email: values.email ?? null,
      address: values.address ?? null,
      credit_limit: values.creditLimit,
      is_active: values.isActive,
    };
  }

  if (resource === "supplier") {
    return {
      business_id: businessId,
      code: values.code,
      name: values.name,
      phone: values.phone ?? null,
      email: values.email ?? null,
      address: values.address ?? null,
      is_active: values.isActive,
    };
  }

  if (resource === "product") {
    return {
      business_id: businessId,
      sku: values.sku,
      name: values.name,
      variant: values.variant ?? null,
      product_type: values.productType,
      category: values.category,
      unit: values.unit,
      track_stock: values.trackStock,
      default_warehouse_id: values.defaultWarehouseId ?? null,
      selling_price: values.sellingPrice,
      purchase_price: values.purchasePrice,
      reorder_point: values.reorderPoint,
      is_sellable: values.isSellable,
      is_purchasable: values.isPurchasable,
      is_active: values.isActive,
    };
  }

  if (resource === "warehouse") {
    return {
      business_id: businessId,
      code: values.code,
      name: values.name,
      location: values.location ?? "",
      is_active: values.isActive,
    };
  }

  if (resource === "employee") {
    return {
      business_id: businessId,
      employee_no: values.employeeNo,
      name: values.name,
      role: values.role,
      contract_type: values.contractType,
      status: values.status,
      base_salary: values.baseSalary,
      daily_rate: values.dailyRate ?? null,
      joined_at: values.joinedAt,
    };
  }

  if (resource === "business") {
    return {
      legal_name: values.legalName,
      display_name: values.displayName,
      owner_name: values.ownerName,
      industry: values.industry,
      tax_id: values.taxId ?? null,
      logo_url: values.logoUrl ?? null,
      period_start_month: values.periodStartMonth,
    };
  }

  return {
    business_id: businessId,
    taxpayer_type: values.taxpayerType,
    uses_final_umkm_rate: values.usesFinalUmkmRate,
    final_umkm_rate: values.finalUmkmRate,
    coretax_status: values.coretaxStatus,
  };
}

function tableFor(resource: Exclude<MasterResource, "business" | "tax_profile">) {
  return {
    customer: "customers",
    supplier: "suppliers",
    product: "products",
    warehouse: "warehouses",
    employee: "employees",
  }[resource];
}

async function reloadWorkspace(request: Request, context: Awaited<ReturnType<typeof requireApiPermission>>) {
  if (isApiResponse(context)) return context;
  const supabase = createRequestSupabaseClient(request);
  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }), context);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const resource = masterResourceSchema.safeParse(payload?.resource);

  if (!resource.success) {
    return json({ error: "Resource master data tidak valid." }, 400);
  }

  const context = await requireApiPermission(request, permissions[resource.data]);

  if (isApiResponse(context)) {
    return context;
  }

  const parsed = masterDataMutationSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  const values = parseValues(parsed.data.resource, parsed.data.values);

  if (!values.success) {
    return withDemoHeader(json({ errors: values.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(
      json({ workspace: saveDemoMasterData(parsed.data.resource, parsed.data.id, values.data) }, parsed.data.id ? 200 : 201),
      context,
    );
  }

  const supabase = createRequestSupabaseClient(request);
  const dbValues = toDb(parsed.data.resource, values.data, context.businessId);
  const dbPayload = dbValues as never;
  const result =
    parsed.data.resource === "business"
      ? await supabase.from("businesses").update(dbPayload).eq("id", context.businessId)
      : parsed.data.resource === "tax_profile"
        ? await supabase.from("tax_profiles").upsert(dbPayload, { onConflict: "business_id" })
        : parsed.data.id
          ? await supabase
              .from(tableFor(parsed.data.resource))
              .update(dbPayload)
              .eq("business_id", context.businessId)
              .eq("id", parsed.data.id)
          : await supabase.from(tableFor(parsed.data.resource)).insert(dbPayload);

  if (result.error) {
    return withDemoHeader(json({ error: result.error.message }, 422), context);
  }

  return reloadWorkspace(request, context);
}

export async function DELETE(request: Request) {
  const payload = await request.json().catch(() => null);
  const resource = masterResourceSchema.safeParse(payload?.resource);
  const id = typeof payload?.id === "string" ? payload.id : "";

  if (!resource.success || !id) {
    return json({ error: "Resource dan id wajib diisi." }, 400);
  }

  if (resource.data === "business" || resource.data === "tax_profile") {
    return json({ error: "Business dan tax profile tidak bisa diarsip lewat endpoint ini." }, 400);
  }

  const context = await requireApiPermission(request, permissions[resource.data]);

  if (isApiResponse(context)) {
    return context;
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: archiveDemoMasterData(resource.data, id) }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const inactiveValue =
    resource.data === "employee"
      ? { status: "inactive" }
      : { is_active: false };
  const { error } = await supabase
    .from(tableFor(resource.data))
    .update(inactiveValue)
    .eq("business_id", context.businessId)
    .eq("id", id);

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  return reloadWorkspace(request, context);
}
