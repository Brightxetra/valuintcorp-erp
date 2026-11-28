import { z } from "zod";
import { isApiResponse, requireAuthenticatedUser, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createRequestSupabaseClient } from "@/lib/supabase/server";
import type { BusinessIndustry, BusinessRole } from "@/lib/domain/types";
import { canonicalIndustryTemplateId, industryForTemplate } from "@/lib/erp/industry-templates";

const createBusinessSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  displayName: z.string().trim().min(2).max(160),
  industry: z.enum(["umkm", "general"]),
  ownerName: z.string().trim().min(2).max(160),
  taxId: z.string().trim().max(40).optional(),
  firstBusiness: z.boolean().optional(),
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
    industry: canonicalIndustryTemplateId(businessRow.industry ?? "general"),
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
            industry: canonicalIndustryTemplateId(workspace.business.industry),
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
  const industry = industryForTemplate(parsed.data.industry);
  const { data, error } = await service.rpc(parsed.data.firstBusiness ? "bootstrap_first_business" : "create_business_with_owner_for_actor", {
    legal_name: parsed.data.legalName,
    display_name: parsed.data.displayName,
    industry,
    owner_name: parsed.data.ownerName,
    tax_id: parsed.data.taxId || null,
    actor_user_id: user.userId,
  });

  if (error) {
    return json({ error: error.message }, 422);
  }

  if (typeof data !== "string") return json({ error: "Identitas perusahaan belum tersedia." }, 500);

  return json({ businessId: data }, 201);
}
