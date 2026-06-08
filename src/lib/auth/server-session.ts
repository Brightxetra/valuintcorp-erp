import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { BusinessIndustry, BusinessRole } from "@/lib/domain/types";
import { serverAccessTokenCookie, serverBusinessCookie, shouldUseDemoFallback } from "@/lib/auth/runtime";
import type { WorkspaceLoadContext } from "@/lib/erp/workspace-repository";

interface MembershipRow {
  business_id?: string;
  role?: BusinessRole;
  businesses?: {
    id?: string;
    legal_name?: string;
    display_name?: string;
    industry?: BusinessIndustry;
  } | Array<{
    id?: string;
    legal_name?: string;
    display_name?: string;
    industry?: BusinessIndustry;
  }>;
}

export interface ServerBusinessOption {
  id: string;
  displayName: string;
  legalName: string;
  industry: BusinessIndustry;
  role: BusinessRole;
}

function createCookieSupabaseClient(accessToken: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function businessOptionFromMembership(row: MembershipRow): ServerBusinessOption {
  const rawBusiness = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;

  return {
    id: String(row.business_id ?? rawBusiness?.id ?? ""),
    displayName: String(rawBusiness?.display_name ?? "Bisnis"),
    legalName: String(rawBusiness?.legal_name ?? "Bisnis"),
    industry: (rawBusiness?.industry ?? "general") as BusinessIndustry,
    role: (row.role ?? "staff") as BusinessRole,
  };
}

export async function getServerAccessToken() {
  if (shouldUseDemoFallback()) return null;

  const cookieStore = await cookies();
  return cookieStore.get(serverAccessTokenCookie)?.value ?? null;
}

export async function getServerWorkspaceContext(): Promise<WorkspaceLoadContext | null> {
  const accessToken = await getServerAccessToken();

  if (!accessToken) return null;

  const cookieStore = await cookies();
  const requestedBusinessId = cookieStore.get(serverBusinessCookie)?.value;
  const supabase = createCookieSupabaseClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) return null;

  const membershipQuery = supabase
    .from("business_members")
    .select("business_id, role, businesses(id, legal_name, display_name, industry)")
    .eq("auth_user_id", userData.user.id)
    .order("created_at", { ascending: true });
  const { data: memberships, error: membershipError } = requestedBusinessId
    ? await membershipQuery.eq("business_id", requestedBusinessId)
    : await membershipQuery.limit(1);

  if (membershipError || !Array.isArray(memberships) || memberships.length === 0) {
    return null;
  }

  const membership = memberships[0] as MembershipRow;
  const role = (membership.role ?? "staff") as BusinessRole;

  return {
    businessId: String(membership.business_id),
    role,
    userId: userData.user.id,
    userEmail: userData.user.email ?? undefined,
    userName:
      typeof userData.user.user_metadata?.name === "string"
        ? userData.user.user_metadata.name
        : userData.user.email ?? undefined,
  };
}

export async function getServerAuthenticatedUser() {
  const accessToken = await getServerAccessToken();

  if (!accessToken) return null;

  const supabase = createCookieSupabaseClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) return null;

  return {
    userId: userData.user.id,
    userEmail: userData.user.email ?? undefined,
    userName:
      typeof userData.user.user_metadata?.name === "string"
        ? userData.user.user_metadata.name
        : userData.user.email ?? undefined,
  };
}

export async function loadServerBusinessOptions(): Promise<ServerBusinessOption[]> {
  const accessToken = await getServerAccessToken();

  if (!accessToken) return [];

  const supabase = createCookieSupabaseClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) return [];

  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(id, legal_name, display_name, industry)")
    .eq("auth_user_id", userData.user.id)
    .order("created_at", { ascending: true });

  if (error || !Array.isArray(data)) return [];

  return data.map((row) => businessOptionFromMembership(row as MembershipRow)).filter((business) => business.id);
}

export function createServerSupabaseClient(accessToken: string) {
  return createCookieSupabaseClient(accessToken);
}
