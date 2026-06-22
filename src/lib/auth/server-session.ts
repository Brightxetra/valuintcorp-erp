import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { BusinessIndustry, BusinessRole } from "@/lib/domain/types";
import {
  serverAccessTokenCookie,
  serverBusinessCookie,
  serverLastActivityCookie,
  serverSessionIdCookie,
  serverSessionRememberCookie,
  shouldUseDemoFallback,
} from "@/lib/auth/runtime";
import { getLoginSessionStatus } from "@/lib/auth/login-sessions";
import { isIdleSessionExpired } from "@/lib/auth/session-policy";
import { permissionsForMember } from "@/lib/security/permissions";
import type { WorkspaceLoadContext } from "@/lib/erp/workspace-repository";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

interface MembershipRow {
  business_id?: string;
  role?: BusinessRole;
  access_scope?: "role" | "custom";
  access_permissions?: unknown;
  location_ids?: unknown;
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
  const { url, anonKey } = requireSupabasePublicConfig("Supabase cookie client");
  return createClient(url, anonKey, {
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


function memberWorkspaceAccess(row: MembershipRow) {
  const locationIds = Array.isArray(row.location_ids)
    ? row.location_ids.filter((locationId): locationId is string => typeof locationId === "string")
    : [];
  const permissions = permissionsForMember(
    (row.role ?? "staff") as BusinessRole,
    row.access_scope === "custom" ? "custom" : "role",
    Array.isArray(row.access_permissions) ? row.access_permissions.filter((permission): permission is string => typeof permission === "string") : [],
  );
  return { permissions, assignedLocationIds: locationIds, accessScope: row.access_scope === "custom" ? "custom" as const : "role" as const };
}
export async function getServerAccessToken() {

  if (shouldUseDemoFallback()) return null;
  const cookieStore = await cookies();
  const rememberMe = cookieStore.get(serverSessionRememberCookie)?.value === "1";
  const lastActivity = Number(cookieStore.get(serverLastActivityCookie)?.value ?? "");

  if (isIdleSessionExpired(Number.isFinite(lastActivity) ? lastActivity : null, rememberMe)) {
    return null;
  }

  const sessionStatus = await getLoginSessionStatus(cookieStore.get(serverSessionIdCookie)?.value ?? null);

  if (sessionStatus !== "active" && sessionStatus !== "missing") {
    return null;
  }

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

  const baseMembershipQuery = supabase
    .from("business_members")
    .select("business_id, role, access_scope, access_permissions, location_ids, businesses(id, legal_name, display_name, industry)")
    .eq("auth_user_id", userData.user.id)
    .order("created_at", { ascending: true });

  const { data: memberships, error: membershipError } = requestedBusinessId
    ? await baseMembershipQuery.eq("business_id", requestedBusinessId)
    : await baseMembershipQuery.limit(1);

  if (requestedBusinessId && !membershipError && Array.isArray(memberships) && memberships.length === 0) {
    const { data: fallbackMemberships, error: fallbackError } = await supabase
      .from("business_members")
      .select("business_id, role, access_scope, access_permissions, location_ids, businesses(id, legal_name, display_name, industry)")
      .eq("auth_user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (!fallbackError && Array.isArray(fallbackMemberships) && fallbackMemberships.length > 0) {
      const fallbackMembership = fallbackMemberships[0] as MembershipRow;
      const fallbackRole = (fallbackMembership.role ?? "staff") as BusinessRole;

      return {
        businessId: String(fallbackMembership.business_id),
        role: fallbackRole,
        ...memberWorkspaceAccess(fallbackMembership),
        userId: userData.user.id,
        userEmail: userData.user.email ?? undefined,
        userName:
          typeof userData.user.user_metadata?.name === "string"
            ? userData.user.user_metadata.name
            : userData.user.email ?? undefined,
      };
    }
  }

  if (membershipError || !Array.isArray(memberships) || memberships.length === 0) {
    return null;
  }

  const membership = memberships[0] as MembershipRow;
  const role = (membership.role ?? "staff") as BusinessRole;

  return {
    businessId: String(membership.business_id),
    role,
    ...memberWorkspaceAccess(membership),
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
