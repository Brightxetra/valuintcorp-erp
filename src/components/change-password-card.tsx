"use client";

import { useRef, useState } from "react";
import { KeyRound, Mail, Save, ShieldCheck } from "lucide-react";
import { ActionButton, TextField, cn } from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { syncServerSession } from "@/lib/erp/client-api";
import { passwordMinimumLength } from "@/lib/auth/password-policy";
import { notify } from "@/lib/notify";

interface ChangePasswordResponse {
  ok: boolean;
  revokedOtherSessions: number;
  session?: {
    accessToken: string;
    refreshToken: string;
    userId: string;
  };
}

export function ChangePasswordCard({ className }: { className?: string }) {
  const { request, demoMode } = useErpWorkspace();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function adoptFreshSession(session: NonNullable<ChangePasswordResponse["session"]>) {
    const supabase = createBrowserSupabaseClient();
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    if (setSessionError) {
      throw setSessionError;
    }

    const synced = await syncServerSession(null, session, { freshLogin: true });

    if (!synced) {
      throw new Error("Sesi baru belum tersinkron. Silakan login ulang jika sesi berakhir.");
    }
  }

  async function changePassword(formData: FormData) {
    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    setError(null);

    if (demoMode) {
      setError("Mode demo fallback tidak memiliki akun Supabase nyata.");
      return;
    }

    if (!currentPassword) {
      setError("Password lama wajib diisi.");
      return;
    }

    if (newPassword.length < passwordMinimumLength) {
      setError(`Password baru minimal ${passwordMinimumLength} karakter.`);
      return;
    }

    if (newPassword === currentPassword) {
      setError("Password baru harus berbeda dari password lama.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak sama.");
      return;
    }

    setPending(true);

    try {
      const body = await request<ChangePasswordResponse>("/api/auth/password", {
        method: "POST",
        businessId: null,
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (body.session) {
        await adoptFreshSession(body.session).catch((caught) => {
          notify.warning("Password berubah, sesi perlu disinkronkan ulang", {
            description: caught instanceof Error ? caught.message : "Silakan login ulang jika sesi berakhir.",
          });
        });
      }

      formRef.current?.reset();
      notify.success("Password berhasil diubah", {
        description:
          body.revokedOtherSessions > 0
            ? `${body.revokedOtherSessions} sesi perangkat lain dikeluarkan.`
            : "Tidak ada sesi perangkat lain yang aktif.",
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Coba lagi.";
      setError(message);
      notify.error("Password gagal diubah", { description: message });
    } finally {
      setPending(false);
    }
  }

  async function requestPasswordReset() {
    setError(null);

    if (demoMode) {
      setError("Mode demo fallback tidak bisa mengirim email reset password.");
      return;
    }

    setResetPending(true);

    try {
      const body = await request<{ ok: boolean; email?: string }>("/api/auth/password/reset-request", {
        method: "POST",
        businessId: null,
      });

      notify.success("Link reset password dikirim", {
        description: body.email ? `Cek inbox ${body.email}.` : "Cek inbox email akun ini.",
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Coba lagi.";
      setError(message);
      notify.error("Link reset password gagal dikirim", { description: message });
    } finally {
      setResetPending(false);
    }
  }

  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold text-slate-950">Ubah password</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Masukkan password lama sebelum membuat password baru untuk akun ini.
          </p>
        </div>
      </div>

      {demoMode ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Mode demo fallback tidak menyimpan password akun Supabase. Fitur ini aktif di production atau akun demo Supabase.
        </div>
      ) : null}

      <form ref={formRef} action={changePassword} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <TextField
            name="currentPassword"
            label="Password lama"
            type="password"
            autoComplete="current-password"
            disabled={pending || demoMode}
            required
          />
          <TextField
            name="newPassword"
            label="Password baru"
            type="password"
            autoComplete="new-password"
            disabled={pending || demoMode}
            minLength={passwordMinimumLength}
            required
          />
          <TextField
            name="confirmPassword"
            label="Konfirmasi password baru"
            type="password"
            autoComplete="new-password"
            disabled={pending || demoMode}
            minLength={passwordMinimumLength}
            required
          />
        </div>

        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <KeyRound className="size-4" aria-hidden />
            Password baru minimal {passwordMinimumLength} karakter.
          </p>
          <ActionButton disabled={pending || demoMode}>
            <Save className="size-4" aria-hidden />
            {pending ? "Menyimpan..." : "Simpan password"}
          </ActionButton>
        </div>
      </form>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Lupa password lama?</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Minta link reset password ke email akun ini, lalu buat password baru dari link tersebut.
            </p>
          </div>
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => void requestPasswordReset()}
            disabled={resetPending || demoMode}
            className="shrink-0"
          >
            <Mail className="size-4" aria-hidden />
            {resetPending ? "Mengirim..." : "Kirim link reset password"}
          </ActionButton>
        </div>
      </div>
    </section>
  );
}
