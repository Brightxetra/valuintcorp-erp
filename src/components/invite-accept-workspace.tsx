"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { ActionButton, TextField } from "@/components/ui";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { clearServerSession, syncServerSession } from "@/lib/erp/client-api";

const MARKETING_SITE_URL = process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "https://valuintcorp.com";

type InvitePhase = "loading" | "password" | "success" | "error";

interface InviteSessionTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

function callbackParamsFromLocation() {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  return { url, hashParams, searchParams: url.searchParams };
}

function callbackErrorMessage(hashParams: URLSearchParams, searchParams: URLSearchParams) {
  return (
    hashParams.get("error_description") ||
    searchParams.get("error_description") ||
    hashParams.get("error") ||
    searchParams.get("error")
  );
}

async function waitForSession() {
  const supabase = createBrowserSupabaseClient();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  return null;
}

export function InviteAcceptWorkspace() {
  const [phase, setPhase] = useState<InvitePhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState<InviteSessionTokens | null>(null);
  const [pending, setPending] = useState(false);

  const title = useMemo(() => {
    if (phase === "success") return "Akun berhasil diverifikasi";
    if (phase === "password") return "Akun berhasil diverifikasi";
    if (phase === "error") return "Link invite tidak valid";
    return "Memverifikasi invite";
  }, [phase]);

  useEffect(() => {
    let cancelled = false;

    async function initializeInviteSession() {
      try {
        const { url, hashParams, searchParams } = callbackParamsFromLocation();
        const callbackError = callbackErrorMessage(hashParams, searchParams);

        if (callbackError) {
          throw new Error(callbackError);
        }

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const authCode = searchParams.get("code");

        if ((!accessToken || !refreshToken) && !authCode) {
          throw new Error("Token invite tidak ditemukan. Buka ulang link dari email atau minta owner mengirim ulang invite.");
        }

        const supabase = createBrowserSupabaseClient();

        await clearServerSession();

        let session = null;

        if (accessToken && refreshToken) {
          const { data, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setSessionError) throw setSessionError;
          session = data.session;
        } else if (authCode) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
          if (exchangeError) throw exchangeError;
          session = data.session;
        }

        session = session ?? await waitForSession();

        if (!session?.access_token || !session.refresh_token || !session.user?.id) {
          throw new Error("Sesi invite tidak bisa dibuat. Buka ulang link email atau minta owner mengirim ulang invite.");
        }

        if (!cancelled) {
          window.history.replaceState(null, "", url.pathname);
          setSessionTokens({
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            userId: session.user.id,
            email: session.user.email ?? "",
          });
          setPhase("password");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Invite gagal diproses.");
          setPhase("error");
        }
      }
    }

    void initializeInviteSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function savePassword(formData: FormData) {
    if (!sessionTokens) return;

    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    setError(null);

    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak sama.");
      return;
    }

    setPending(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) throw updateError;

      const synced = await syncServerSession(null, {
        accessToken: sessionTokens.accessToken,
        refreshToken: sessionTokens.refreshToken,
        userId: sessionTokens.userId,
      }, { rememberMe: false, freshLogin: true });

      if (!synced?.hasBusiness) {
        throw new Error("Password tersimpan, tetapi akses bisnis belum ditemukan. Minta owner mengirim ulang invite.");
      }

      setPhase("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password gagal disimpan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center overflow-x-clip px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="w-full">
        <a
          href={MARKETING_SITE_URL}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali ke website
        </a>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              {phase === "success" ? <CheckCircle2 className="size-6" aria-hidden /> : <ShieldCheck className="size-6" aria-hidden />}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {phase === "password"
                  ? "Buat password baru untuk menyelesaikan aktivasi akun staff."
                  : phase === "success"
                    ? "Password sudah dibuat dan akses bisnis sudah aktif."
                    : phase === "error"
                      ? "Link invite tidak bisa digunakan."
                      : "Mohon tunggu, kami sedang memproses link invite."}
              </p>
            </div>
          </div>

          {phase === "loading" ? (
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-950" aria-hidden />
              <p className="text-sm font-medium text-slate-700">Memproses invite...</p>
            </div>
          ) : null}

          {phase === "password" ? (
            <form action={savePassword} className="space-y-4">
              {sessionTokens?.email ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Email terverifikasi</p>
                  <p className="mt-1 truncate text-sm font-medium text-emerald-950">{sessionTokens.email}</p>
                </div>
              ) : null}
              <TextField name="password" label="Password baru" type="password" autoComplete="new-password" required minLength={8} />
              <TextField name="confirmPassword" label="Konfirmasi password" type="password" autoComplete="new-password" required minLength={8} />
              {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
              <ActionButton className="w-full" disabled={pending}>
                {pending ? "Menyimpan..." : "Simpan password dan aktifkan akun"}
              </ActionButton>
            </form>
          ) : null}

          {phase === "success" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                Akun staff siap digunakan. Anda sekarang bisa masuk ke dashboard sesuai akses yang diberikan owner.
              </div>
              <Link
                href="/dashboard"
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Masuk ke dashboard
              </Link>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="space-y-4">
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Kembali ke login
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
