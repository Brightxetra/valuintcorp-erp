"use client";

import type { BusinessIndustry, BusinessRole } from "@/lib/domain/types";
import {
  serverAccessTokenCookie,
  serverBusinessCookie,
  serverLastActivityCookie,
  serverRefreshTokenCookie,
  serverSessionIdCookie,
  serverSessionRememberCookie,
} from "@/lib/auth/runtime";
import type { WorkspaceLoadProfile } from "@/lib/erp/workspace-repository";
import type { ErpWorkspace } from "@/lib/erp/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";

const activeBusinessKey = "valuintcorp.activeBusinessId";
const browserSessionRememberKey = "valuintcorp.session.remember";
const browserSessionLastActivityKey = "valuintcorp.session.lastActivity";
const activityTouchIntervalMs = 60_000;
let lastActivityTouchAt = 0;

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

export interface SessionSyncTokens {
  accessToken: string;
  refreshToken?: string | null;
  userId?: string | null;
}

export interface SessionSyncOptions {
  rememberMe?: boolean;
  freshLogin?: boolean;
}

export function isSupabaseBrowserEnabled() {
  return hasSupabasePublicConfig();
}

export function isExplicitDemoModeBrowser() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function shouldUseDemoFallbackBrowser() {
  return !isSupabaseBrowserEnabled() || isExplicitDemoModeBrowser();
}

function idleSessionTimeoutMs() {
  const configured = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS);
  const seconds = Number.isFinite(configured) && configured >= 60 ? configured : 30 * 60;
  return seconds * 1000;
}

export function getStoredActiveBusinessId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(activeBusinessKey);
}

export function storeActiveBusinessId(businessId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(activeBusinessKey, businessId);
}

function clearStoredActiveBusinessId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(activeBusinessKey);
}

export function storeBrowserSessionPolicy(rememberMe: boolean, timestamp = Date.now()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(browserSessionRememberKey, rememberMe ? "1" : "0");
  window.localStorage.setItem(browserSessionLastActivityKey, String(timestamp));
}

export function clearBrowserSessionPolicy() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(browserSessionRememberKey);
  window.localStorage.removeItem(browserSessionLastActivityKey);
}

export function browserSessionRemembered() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(browserSessionRememberKey) === "1";
}

export function browserIdleSessionExpired(timestamp = Date.now()) {
  if (typeof window === "undefined" || browserSessionRemembered()) return false;
  const lastActivity = Number(window.localStorage.getItem(browserSessionLastActivityKey) ?? "");
  if (!Number.isFinite(lastActivity) || lastActivity <= 0) return false;
  return timestamp - lastActivity > idleSessionTimeoutMs();
}

export function markBrowserSessionActivity(timestamp = Date.now()) {
  if (typeof window === "undefined") return;
  if (browserSessionRemembered()) return;
  window.localStorage.setItem(browserSessionLastActivityKey, String(timestamp));
}

export function buildBrowserCookie(name: string, value: string, maxAge: number, secure: boolean) {
  return `${name}=${value}; Path=/; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure ? "; Secure" : ""}`;
}

function browserCookieSecure() {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

function writeBrowserCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  document.cookie = buildBrowserCookie(name, value, maxAge, browserCookieSecure());
}

function clearBrowserSessionCookies() {
  writeBrowserCookie(serverAccessTokenCookie, "", 0);
  writeBrowserCookie(serverRefreshTokenCookie, "", 0);
  writeBrowserCookie(serverBusinessCookie, "", 0);
  writeBrowserCookie(serverSessionIdCookie, "", 0);
  writeBrowserCookie(serverSessionRememberCookie, "", 0);
  writeBrowserCookie(serverLastActivityCookie, "", 0);
  clearStoredActiveBusinessId();
  clearBrowserSessionPolicy();
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

export async function syncServerSession(
  businessId?: string | null,
  explicitTokens?: SessionSyncTokens | null,
  options: SessionSyncOptions = {},
): Promise<SessionSyncResult | null> {
  const freshLogin = options.freshLogin === true;

  if (!freshLogin && browserIdleSessionExpired()) {
    await createBrowserSupabaseClient().auth.signOut().catch(() => undefined);
    clearBrowserSessionCookies();
    return null;
  }

  const session = explicitTokens ? null : await getBrowserSession();
  const accessToken = explicitTokens?.accessToken ?? session?.access_token;
  const refreshToken = explicitTokens?.refreshToken ?? session?.refresh_token;
  const rememberMe = options.rememberMe ?? browserSessionRemembered();

  if (!accessToken) return null;

  const payload: {
    accessToken: string;
    refreshToken?: string;
    businessId?: string;
    rememberMe?: boolean;
    freshLogin?: boolean;
  } = {
    accessToken,
  };

  if (refreshToken) {
    payload.refreshToken = refreshToken;
  }

  if (businessId) {
    payload.businessId = businessId;
  }

  payload.rememberMe = rememberMe;
  payload.freshLogin = freshLogin;

  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (response.ok) {
      const synced = (await response.json()) as SessionSyncResult;
      storeBrowserSessionPolicy(rememberMe);

      if (synced.defaultBusinessId) {
        storeActiveBusinessId(synced.defaultBusinessId);
      } else {
        clearStoredActiveBusinessId();
      }

      return synced;
    }

    if (response.status === 401) return null;
  } catch {
    return null;
  }

  return null;
}

export async function clearServerSession() {
  clearBrowserSessionCookies();

  await fetch("/api/auth/session", {
    method: "DELETE",
    cache: "no-store",
  }).catch(() => undefined);
}

export async function touchServerSessionActivity(force = false) {
  if (shouldUseDemoFallbackBrowser()) return true;
  if (browserIdleSessionExpired()) {
    await createBrowserSupabaseClient().auth.signOut().catch(() => undefined);
    clearBrowserSessionCookies();
    return false;
  }

  const now = Date.now();
  markBrowserSessionActivity(now);

  if (!force && now - lastActivityTouchAt < activityTouchIntervalMs) {
    return true;
  }

  lastActivityTouchAt = now;
  const token = await getAccessToken();
  const headers = new Headers();

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch("/api/auth/session/activity", {
    method: "POST",
    headers,
    cache: "no-store",
  }).catch(() => null);

  if (response?.status === 401) {
    await createBrowserSupabaseClient().auth.signOut().catch(() => undefined);
    clearBrowserSessionCookies();
    return false;
  }

  return true;
}

export async function erpApiFetch<T>(
  endpoint: string,
  options: RequestInit & { businessId?: string | null } = {},
): Promise<T> {
  if (!(await touchServerSessionActivity())) {
    if (typeof window !== "undefined") {
      window.location.assign("/login?reason=session-expired");
    }
    throw new Error("Sesi berakhir karena tidak aktif.");
  }

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
  if (!(await touchServerSessionActivity())) {
    if (typeof window !== "undefined") {
      window.location.assign("/login?reason=session-expired");
    }
    throw new Error("Sesi berakhir karena tidak aktif.");
  }

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
