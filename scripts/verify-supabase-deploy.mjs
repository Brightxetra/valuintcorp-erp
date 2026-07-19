import { createClient } from "@supabase/supabase-js";

const projectRefPattern = /^[a-z0-9]{20}$/;
const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]+$/;
const secretKeyPattern = /^sb_secret_[A-Za-z0-9_-]+$/;

function legacySupabaseJwtRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function assertSupabasePublicKey(publicKey, serviceRoleKey) {
  const normalizedPublicKey = publicKey?.trim() ?? "";
  const normalizedServiceRoleKey = serviceRoleKey?.trim() ?? "";

  if (!normalizedPublicKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required for the Supabase public API check.");
  }

  if (normalizedServiceRoleKey && normalizedPublicKey === normalizedServiceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY must not match SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (
    !publishableKeyPattern.test(normalizedPublicKey) &&
    legacySupabaseJwtRole(normalizedPublicKey) !== "anon"
  ) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY must be a publishable key or legacy anon key.");
  }

  return normalizedPublicKey;
}

export function assertSupabaseServiceRoleKey(serviceRoleKey) {
  const normalizedServiceRoleKey = serviceRoleKey?.trim() ?? "";

  if (
    !secretKeyPattern.test(normalizedServiceRoleKey) &&
    legacySupabaseJwtRole(normalizedServiceRoleKey) !== "service_role"
  ) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be a secret key or legacy service_role key.");
  }

  return normalizedServiceRoleKey;
}

export const requiredLiveSupabaseTables = Object.freeze([
  "businesses",
  "business_members",
  "member_invites",
  "locations",
  "transaction_sources",
  "demo_sandboxes",
  "customers",
  "suppliers",
  "products",
  "warehouses",
  "stock_movements",
  "sales_invoices",
  "sales_invoice_lines",
  "purchase_bills",
  "purchase_bill_lines",
  "payments",
  "chart_of_accounts",
  "journal_entries",
  "journal_lines",
  "report_periods",
  "tax_profiles",
  "fixed_assets",
  "raw_transactions",
  "daily_transaction_summaries",
  "settlement_records",
  "attachments",
  "branch_expenses",
  "user_login_sessions",
  "auth_security_events",
]);

export function resolveSupabaseProjectIdentity(supabaseUrl, projectRef) {
  const normalizedProjectRef = projectRef?.trim() ?? "";
  if (!projectRefPattern.test(normalizedProjectRef)) {
    throw new Error("SUPABASE_PROJECT_REF must be a 20-character lowercase project ref.");
  }

  let configuredUrl;
  try {
    configuredUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  if (configuredUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
  }

  if (
    configuredUrl.username ||
    configuredUrl.password ||
    configuredUrl.pathname !== "/" ||
    configuredUrl.search ||
    configuredUrl.hash
  ) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin without credentials, path, query, or hash.");
  }

  const canonicalOrigin = `https://${normalizedProjectRef}.supabase.co`;
  const configuredOrigin = configuredUrl.origin;

  if (
    configuredUrl.hostname.endsWith(".supabase.co") &&
    configuredUrl.hostname !== `${normalizedProjectRef}.supabase.co`
  ) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL does not match SUPABASE_PROJECT_REF.");
  }

  return {
    canonicalOrigin,
    configuredOrigin,
    probeOrigins: [...new Set([configuredOrigin, canonicalOrigin])],
  };
}

async function probeAuthSettings({ fetchImpl, origin, publicKey, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(`${origin}/auth/v1/settings`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: publicKey,
      },
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    throw new Error(`Supabase public API check could not reach ${origin}.`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Supabase public API check failed for ${origin} with HTTP ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Supabase public API check returned invalid JSON for ${origin}.`);
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !payload.external ||
    typeof payload.external !== "object" ||
    Array.isArray(payload.external)
  ) {
    throw new Error(`Supabase public API check returned an invalid Auth settings payload for ${origin}.`);
  }
}

export async function verifySupabasePublicApi({
  fetchImpl = fetch,
  projectRef,
  publicKey,
  supabaseUrl,
  timeoutMs = 10_000,
}) {
  const normalizedPublicKey = assertSupabasePublicKey(publicKey);

  const identity = resolveSupabaseProjectIdentity(supabaseUrl, projectRef);
  await Promise.all(
    identity.probeOrigins.map((origin) =>
      probeAuthSettings({ fetchImpl, origin, publicKey: normalizedPublicKey, timeoutMs }),
    ),
  );

  return identity;
}

export function createPinnedSupabaseFetch({
  expectedOrigin,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}) {
  let normalizedExpectedOrigin;

  try {
    const parsedExpectedOrigin = new URL(expectedOrigin);
    if (
      parsedExpectedOrigin.protocol !== "https:" ||
      parsedExpectedOrigin.username ||
      parsedExpectedOrigin.password ||
      parsedExpectedOrigin.pathname !== "/" ||
      parsedExpectedOrigin.search ||
      parsedExpectedOrigin.hash
    ) {
      throw new Error("invalid origin");
    }
    normalizedExpectedOrigin = parsedExpectedOrigin.origin;
  } catch {
    throw new Error("Supabase service request origin is invalid.");
  }

  return async function pinnedSupabaseFetch(input, init = {}) {
    let requestOrigin;

    try {
      const requestTarget =
        typeof input === "string" || input instanceof URL ? input : input.url;
      requestOrigin = new URL(requestTarget, normalizedExpectedOrigin).origin;
    } catch {
      throw new Error("Supabase service request origin is invalid.");
    }

    if (requestOrigin !== normalizedExpectedOrigin) {
      throw new Error("Supabase service request origin is invalid.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetchImpl(input, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export async function verifyLiveSupabaseSchema({
  createClientImpl = createClient,
  fetchImpl = fetch,
  projectRef,
  publicKey,
  serviceRoleKey,
  supabaseUrl,
  timeoutMs = 10_000,
}) {
  const normalizedServiceRoleKey = assertSupabaseServiceRoleKey(serviceRoleKey);
  const normalizedPublicKey = assertSupabasePublicKey(publicKey, normalizedServiceRoleKey);

  const identity = await verifySupabasePublicApi({
    fetchImpl,
    projectRef,
    publicKey: normalizedPublicKey,
    supabaseUrl,
    timeoutMs,
  });
  const supabase = createClientImpl(identity.canonicalOrigin, normalizedServiceRoleKey, {
    auth: { persistSession: false },
    global: {
      fetch: createPinnedSupabaseFetch({
        expectedOrigin: identity.canonicalOrigin,
        fetchImpl,
        timeoutMs,
      }),
    },
  });

  const tableIssues = await Promise.all(
    requiredLiveSupabaseTables.map(async (table) => {
      const { error } = await supabase.from(table).select("id", { head: true }).limit(1);
      return error ? `Live Supabase table check failed for public.${table}: ${error.message}` : null;
    }),
  );

  return {
    identity,
    tableIssues: tableIssues.filter(Boolean),
  };
}
