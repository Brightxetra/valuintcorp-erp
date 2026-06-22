import { z } from "zod";
import { isApiResponse, requireAuthenticatedUser, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createRequestSupabaseClient } from "@/lib/supabase/server";
import type { BusinessIndustry, BusinessRole } from "@/lib/domain/types";

const createBusinessSchema = z.object({
  legalName: z.string().min(2),
  displayName: z.string().min(2),
  industry: z.enum(["service", "retail", "food_beverage", "online_seller", "manufacturing", "general"]),
  ownerName: z.string().min(2),
  taxId: z.string().optional(),
});

type BusinessRow = {
  id?: string;
  legal_name?: string;
  display_name?: string;
  industry?: BusinessIndustry;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function businessFromMembership(row: Record<string, unknown>) {
  const rawBusiness = row.businesses;
  const business = Array.isArray(rawBusiness) ? rawBusiness[0] : rawBusiness;
  const businessRow = (business && typeof business === "object" ? business : {}) as BusinessRow;

  return {
    id: String(row.business_id ?? businessRow.id ?? ""),
    displayName: String(businessRow.display_name ?? "Bisnis"),
    legalName: String(businessRow.legal_name ?? "Bisnis"),
    industry: (businessRow.industry ?? "general") as BusinessIndustry,
    role: String(row.role ?? "staff") as BusinessRole,
  };
}

export async function GET(request: Request) {
  const user = await requireAuthenticatedUser(request);

  if (isApiResponse(user)) {
    return user;
  }

  if (user.demoMode) {
    const workspace = getDemoErpStore();
    return withDemoHeader(
      json({
        businesses: [
          {
            id: workspace.business.id,
            displayName: workspace.business.displayName,
            legalName: workspace.business.legalName,
            industry: workspace.business.industry,
            role: workspace.user.role,
          },
        ],
        defaultBusinessId: workspace.business.id,
      }),
      {
        businessId: workspace.business.id,
        demoMode: true,
        role: workspace.user.role,
        userId: workspace.user.id,
        permissions: workspace.permissions,
        assignedLocationIds: workspace.assignedLocationIds ?? [],
        accessScope: "role",
      },
    );
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(id, legal_name, display_name, industry)")
    .eq("auth_user_id", user.userId)
    .order("created_at", { ascending: true });

  if (error) {
    return json({ error: error.message }, 500);
  }

  const businesses = (Array.isArray(data) ? data : []).map((row) =>
    businessFromMembership(row as Record<string, unknown>),
  );

  return json({
    businesses,
    defaultBusinessId: businesses[0]?.id ?? null,
  });
}

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser(request);

  if (isApiResponse(user)) {
    return user;
  }

  const payload = await request.json().catch(() => null);
  const parsed = createBusinessSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ errors: parsed.error.flatten() }, 400);
  }

  if (user.demoMode) {
    const workspace = getDemoErpStore();
    return withDemoHeader(
      json({ businessId: workspace.business.id }, 201),
      {
        businessId: workspace.business.id,
        demoMode: true,
        role: workspace.user.role,
        userId: workspace.user.id,
        permissions: workspace.permissions,
        assignedLocationIds: workspace.assignedLocationIds ?? [],
        accessScope: "role",
      },
    );
  }

  const service = createServiceSupabaseClient();
  const { data, error } = await service.rpc("create_business_with_owner_for_actor", {
    legal_name: parsed.data.legalName,
    display_name: parsed.data.displayName,
    industry: parsed.data.industry,
    owner_name: parsed.data.ownerName,
    tax_id: parsed.data.taxId || null,
    actor_user_id: user.userId,
  });

  if (error) {
    return json({ error: error.message }, 422);
  }

  if (typeof data === "string") {
    const { error: templateError } = await callActorServiceRpc(
      "apply_industry_template",
      { businessId: data, templateId: parsed.data.industry },
      user.userId,
    );

    if (templateError) {
      return json({ businessId: data, error: templateError.message }, 422);
    }
  }

  return json({ businessId: data }, 201);
}
