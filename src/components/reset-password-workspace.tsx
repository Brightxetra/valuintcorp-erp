"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { ActionButton, TextField } from "@/components/ui";
import { passwordMinimumLength } from "@/lib/auth/password-policy";
import { signOutLocalBrowserSession, syncServerSession } from "@/lib/erp/client-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { readEmailCallback, redeemEmailCallback } from "@/lib/auth/email-callback";
import { isPasswordRecoveryAuthentication, verifiedSupabaseSessionIdentity } from "@/lib/auth/token";

type ResetPhase = "loading" | "password" | "success" | "error";
const maxResetAttempts = 5;

interface ResetSessionTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

function tokensFromSession(session: Session): ResetSessionTokens {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    userId: session.user.id,
    email: session.user.email ?? "",
  };
}

async function postResetEvent(status: "invalid_callback" | "limited_attempt" | "completed", email?: string, reason?: string) {
  await fetch("/api/auth/password/reset-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status,
      ...(email ? { email } : {}),
      ...(reason ? { reason } : {}),
    }),
  }).catch(() => undefined);
}

export function ResetPasswordWorkspace() {
  const [phase, setPhase] = useState<ResetPhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState<ResetSessionTokens | null>(null);
  const [pending, setPending] = useState(false);
  const [nextPath, setNextPath] = useState("/login");
  const [attemptCount, setAttemptCount] = useState(0);
  const started = useRef(false);

  const title = useMemo(() => {
    if (phase === "success") return "Password berhasil direset";
    if (phase === "password") return "Reset password";
    if (phase === "error") return "Link reset password tidak valid";
    return "Memverifikasi link reset";
  }, [phase]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const callback = readEmailCallback(url);
    window.history.replaceState(null, "", url.pathname);

    async function initializeRecoverySession() {
      try {
        if (!callback.error && !callback.tokenHash && !callback.code && !callback.accessToken) {
          throw new Error("Link reset password tidak ditemukan. Minta tautan baru dari halaman masuk.");
        }
        const { data, error } = await redeemEmailCallback(callback, ["recovery"]);
        const session = data.session;
        const identity = session && verifiedSupabaseSessionIdentity(session.access_token, session.user.id);
        if (error || !session || !isPasswordRecoveryAuthentication(identity?.authenticationMethod, callback.type === "recovery")) {
          throw new Error("Tautan reset tidak valid atau sudah digunakan. Minta tautan baru dari halaman masuk.");
        }
        setSessionTokens(tokensFromSession(session));
        setPhase("password");
      } catch (caught) {
        void postResetEvent("invalid_callback", undefined, "recovery_callback_failed");
        setError(caught instanceof Error ? caught.message : "Reset password gagal diproses.");
        setPhase("error");
      }
    }

    void initializeRecoverySession();

  }, []);

  async function savePassword(formData: FormData) {
    if (!sessionTokens) return;
    const activeResetTokens = sessionTokens;

    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    setError(null);

    if (attemptCount >= maxResetAttempts) {
      setError("Terlalu banyak percobaan. Minta link reset baru dari halaman login.");
      void postResetEvent("limited_attempt", activeResetTokens.email, "attempt_limit_reached");
      return;
    }

    function registerFailedAttempt(reason: string) {
      setAttemptCount((current) => {
        const next = current + 1;
        if (next >= maxResetAttempts) {
          void postResetEvent("limited_attempt", activeResetTokens.email, reason);
        }
        return next;
      });
    }

    if (password.length < passwordMinimumLength) {
      registerFailedAttempt("password_too_short");
      setError(`Password minimal ${passwordMinimumLength} karakter.`);
      return;
    }

    if (password !== confirmPassword) {
      registerFailedAttempt("password_confirmation_mismatch");
      setError("Konfirmasi password tidak sama.");
      return;
    }

    setPending(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: current } = await supabase.auth.getSession();
      const resetIdentity = verifiedSupabaseSessionIdentity(activeResetTokens.accessToken, activeResetTokens.userId);
      const currentIdentity = current.session ? verifiedSupabaseSessionIdentity(current.session.access_token, activeResetTokens.userId) : null;
      if (!resetIdentity || currentIdentity?.sessionId !== resetIdentity.sessionId) {
        setPhase("error");
        throw new Error("Sesi reset sudah berubah. Minta tautan reset baru.");
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) throw updateError;

      const { data } = await supabase.auth.getSession();
      const activeSession = data.session;
      const syncTokens = activeSession ? tokensFromSession(activeSession) : activeResetTokens;

      const synced = await syncServerSession(null, syncTokens, { rememberMe: false, freshLogin: true, passwordResetCompleted: true });
      void postResetEvent("completed", syncTokens.email);
      if (!synced) {
        await signOutLocalBrowserSession();
        setError("Password tersimpan. Silakan masuk lagi untuk melanjutkan.");
      }
      setNextPath(synced ? synced.defaultPath || (synced.hasBusiness ? "/dashboard" : "/onboarding") : "/login");
      setPhase("success");
    } catch (caught) {
      registerFailedAttempt("supabase_update_failed");
      setError(caught instanceof Error ? caught.message : "Password gagal direset.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center overflow-x-clip px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="w-full">
        <Link
          href="/login"
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali ke login
        </Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              {phase === "success" ? <CheckCircle2 className="size-6" aria-hidden /> : <ShieldCheck className="size-6" aria-hidden />}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {phase === "password"
                  ? "Buat password baru untuk akun ini dari link reset yang dikirim ke email."
                  : phase === "success"
                      ? "Password baru sudah tersimpan."
                    : phase === "error"
                      ? "Link reset tidak bisa digunakan atau sudah kedaluwarsa."
                      : "Mohon tunggu, kami sedang memproses link reset password."}
              </p>
            </div>
          </div>

          {phase === "loading" ? (
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-950" aria-hidden />
              <p className="text-sm font-medium text-slate-700">Memproses link reset...</p>
            </div>
          ) : null}

          {phase === "password" ? (
            <form action={savePassword} className="space-y-4">
              {sessionTokens?.email ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Email akun</p>
                  <p className="mt-1 truncate text-sm font-medium text-emerald-950">{sessionTokens.email}</p>
                </div>
              ) : null}
              <TextField name="password" label="Password baru" type="password" autoComplete="new-password" required minLength={passwordMinimumLength} />
              <TextField name="confirmPassword" label="Konfirmasi password" type="password" autoComplete="new-password" required minLength={passwordMinimumLength} />
              {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
              <ActionButton className="w-full" disabled={pending || attemptCount >= maxResetAttempts}>
                <KeyRound className="size-4" aria-hidden />
                {pending ? "Menyimpan..." : attemptCount >= maxResetAttempts ? "Minta link baru" : "Reset password"}
              </ActionButton>
            </form>
          ) : null}

          {phase === "success" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                {error || "Gunakan password baru untuk masuk di perangkat lain."}
              </div>
              <Link
                href={nextPath}
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Lanjutkan
              </Link>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="space-y-4">
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
              <Link
                href="/login?mode=forgot"
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Minta tautan reset baru
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
