import { createClient } from "@supabase/supabase-js";
import { permissionsForMember, permissionsForRole, type Permission } from "@/lib/security/permissions";
import type { BusinessRole } from "@/lib/domain/types";
import { isSupabaseEnvConfigured, shouldUseDemoFallback } from "@/lib/auth/runtime";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

export interface ApiContext {
  businessId: string;
  demoMode: boolean;
  role: BusinessRole;
  userId: string;
  userEmail?: string;
  userName?: string;
  permissions: Permission[];
  assignedLocationIds: string[];
  accessScope: "role" | "custom";
}

export interface AuthenticatedUserContext {
  demoMode: boolean;
  userId: string;
  userEmail?: string;
  userName?: string;
}

const demoContext: ApiContext = {
  businessId: "demo-business",
  demoMode: true,
  role: "owner",
  userId: "demo-user",
  permissions: permissionsForRole("owner"),
  assignedLocationIds: [],
  accessScope: "role",
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = Response.json(body, init);
  response.headers.set("cache-control", "no-store");
  return response;
}

export function isSupabaseConfigured() {
  return isSupabaseEnvConfigured();
}

function roleFromHeader(request: Request): BusinessRole {
  const raw = request.headers.get("x-demo-role");
  const roles: BusinessRole[] = [
    "owner",
    "finance_admin",
    "staff",
    "hr",
    "external_advisor",
    "system_admin",
  ];

  return roles.includes(raw as BusinessRole) ? (raw as BusinessRole) : demoContext.role;
}


function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function createAuthorizedSupabaseClient(authorization: string) {
  const { url, anonKey } = requireSupabasePublicConfig("Supabase API client");

  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

export async function requireApiPermission(
  request: Request,
  permission: Permission,
): Promise<ApiContext | Response> {
  const businessId = request.headers.get("x-business-id");

  if (shouldUseDemoFallback()) {
    const role = roleFromHeader(request);

    if (!permissionsForRole(role).includes(permission)) {
      return jsonNoStore(
        { error: `Role ${role} is not allowed to perform ${permission}.` },
        { status: 403 },
      );
    }

    return { ...demoContext, role, permissions: permissionsForRole(role) };
  }

  if (!businessId) {
    return jsonNoStore({ error: "x-business-id header is required." }, { status: 400 });
  }

  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return jsonNoStore({ error: "Authorization bearer token is required." }, { status: 401 });
  }

  const supabase = createAuthorizedSupabaseClient(authorization);
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return jsonNoStore({ error: "Invalid or expired Supabase token." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select("role, access_scope, access_permissions, location_ids")
    .eq("business_id", businessId)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (membershipError) {
    return jsonNoStore({ error: membershipError.message }, { status: 500 });
  }

  if (!membership?.role) {
    return jsonNoStore({ error: "User is not a member of this business." }, { status: 403 });
  }
  const accessScope = membership.access_scope === "custom" ? "custom" : "role";

  const role = membership.role as BusinessRole;

  const permissions = permissionsForMember(
    role,
    accessScope,
    stringArray(membership.access_permissions),
  );
  const assignedLocationIds = stringArray(membership.location_ids);
  if (!permissions.includes(permission)) {
    return jsonNoStore(

      { error: `Role ${role} is not allowed to perform ${permission}.` },
      { status: 403 },
    );
  }

  return {
    businessId,
    demoMode: false,
    permissions,
    assignedLocationIds,
    accessScope,
    role,
    userId: userData.user.id,
    userEmail: userData.user.email ?? undefined,
    userName:
      typeof userData.user.user_metadata?.name === "string"
        ? userData.user.user_metadata.name
        : userData.user.email ?? undefined,
  };
}

export function isApiResponse(value: ApiContext | AuthenticatedUserContext | Response): value is Response {
  return value instanceof Response;
}

export async function requireAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUserContext | Response> {
  if (shouldUseDemoFallback()) {
    return {
      demoMode: true,
      userId: demoContext.userId,
      userEmail: "demo@valuintcorp.test",
      userName: "Demo Owner",
    };
  }

  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return jsonNoStore({ error: "Authorization bearer token is required." }, { status: 401 });
  }

  const supabase = createAuthorizedSupabaseClient(authorization);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return jsonNoStore({ error: "Invalid or expired Supabase token." }, { status: 401 });
  }

  return {
    demoMode: false,
    userId: data.user.id,
    userEmail: data.user.email ?? undefined,
    userName:
      typeof data.user.user_metadata?.name === "string"
        ? data.user.user_metadata.name
        : data.user.email ?? undefined,
  };
}

export function withDemoHeader(response: Response, context: ApiContext) {
  if (!response.headers.has("cache-control")) {
    response.headers.set("cache-control", "no-store");
  }
  response.headers.set("x-valuintcorp-demo-mode", String(context.demoMode));
  return response;
}
