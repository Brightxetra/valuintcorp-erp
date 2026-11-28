import type { EmailOtpType } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export const emailCallbackPath = "/auth/callback";
export const passwordRecoveryPath = "/auth/reset-password";

export function readEmailCallback(url: URL) {
  const hash = new URLSearchParams(url.hash.slice(1));
  const query = url.searchParams;
  return {
    type: hash.get("type") ?? query.get("type"),
    code: query.get("code"),
    tokenHash: query.get("token_hash"),
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    error: hash.has("error") || hash.has("error_code") || query.has("error") || query.has("error_code"),
  };
}

type EmailCallback = ReturnType<typeof readEmailCallback>;

export function emailCallbackDestination(url: URL) {
  const callback = readEmailCallback(url);
  if (!callback.code && !callback.tokenHash && !callback.accessToken && !callback.refreshToken && !callback.error) return null;

  const pathname = callback.type === "recovery" ? passwordRecoveryPath
    : callback.type === "invite" ? "/auth/invite"
      : emailCallbackPath;
  return `${pathname}${url.search}${url.hash}`;
}

export async function redeemEmailCallback(callback: EmailCallback, allowedTypes: readonly EmailOtpType[]) {
  const type = allowedTypes.find((value) => value === callback.type);
  if (callback.error || (callback.type && !type)) throw new Error("Tautan email tidak valid atau sudah kedaluwarsa.");

  const { auth } = createBrowserSupabaseClient();
  if (callback.tokenHash && type) return auth.verifyOtp({ token_hash: callback.tokenHash, type });
  if (callback.code) return auth.exchangeCodeForSession(callback.code);
  if (callback.accessToken && callback.refreshToken) {
    return auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken });
  }
  throw new Error("Tautan email tidak lengkap. Minta tautan baru dari halaman masuk.");
}
