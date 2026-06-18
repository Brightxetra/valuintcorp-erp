"use client";

import type { BusinessIndustry, BusinessRole } from "@/lib/domain/types";
import type { WorkspaceLoadProfile } from "@/lib/erp/workspace-repository";
import type { ErpWorkspace } from "@/lib/erp/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const activeBusinessKey = "valuintcorp.activeBusinessId";

export interface BusinessOption {
  id: string;
  displayName: string;
  legalName: string;
  industry: BusinessIndustry;
  role: BusinessRole;
}

export interface SessionSyncResult {
  ok: boolean;
  defaultBusinessId: string | null;
  hasBusiness: boolean;
}

export function isSupabaseBrowserEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isExplicitDemoModeBrowser() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function shouldUseDemoFallbackBrowser() {
  return !isSupabaseBrowserEnabled() || isExplicitDemoModeBrowser();
}

export function getStoredActiveBusinessId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(activeBusinessKey);
}

export function storeActiveBusinessId(businessId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(activeBusinessKey, businessId);
}

async function getBrowserSession() {
  if (!isSupabaseBrowserEnabled()) return null;

  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();

  return data.session ?? null;
}

async function getAccessToken() {
  return (await getBrowserSession())?.access_token ?? null;
}

export async function syncServerSession(businessId?: string | null): Promise<SessionSyncResult | null> {
  const session = await getBrowserSession();

  if (!session?.access_token) return null;

  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      businessId: businessId || undefined,
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;

  return response.json() as Promise<SessionSyncResult>;
}

export async function clearServerSession() {
  await fetch("/api/auth/session", {
    method: "DELETE",
    cache: "no-store",
  }).catch(() => undefined);
}

export async function erpApiFetch<T>(
  endpoint: string,
  options: RequestInit & { businessId?: string | null } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = await getAccessToken();

  if (!headers.has("content-type") && options.body) {
    headers.set("content-type", "application/json");
  }

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  if (options.businessId) {
    headers.set("x-business-id", options.businessId);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const explicitMessage = body?.error ?? body?.errors?.formErrors?.[0];
    const message =
      typeof explicitMessage === "string"
        ? explicitMessage
        : body?.errors?.fieldErrors
          ? "Validasi form gagal. Periksa field yang wajib diisi."
          : "Aksi gagal diproses.";

    throw new Error(message);
  }

  return body as T;
}

export async function erpApiDownload(endpoint: string, businessId: string | null | undefined) {
  const headers = new Headers();
  const token = await getAccessToken();

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  if (businessId) {
    headers.set("x-business-id", businessId);
  }

  const response = await fetch(endpoint, { headers, cache: "no-store" });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Export gagal dibuat.");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? "valuintcorp-export";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function loadBusinessOptions() {
  return erpApiFetch<{ businesses: BusinessOption[]; defaultBusinessId: string | null }>("/api/erp/businesses");
}

export async function loadWorkspaceForBusiness(businessId: string, profile: WorkspaceLoadProfile = "full") {
  await syncServerSession(businessId);
  const query = profile === "full" ? "" : `?profile=${encodeURIComponent(profile)}`;
  return erpApiFetch<{ workspace: ErpWorkspace }>(`/api/erp/workspace${query}`, { businessId });
}
