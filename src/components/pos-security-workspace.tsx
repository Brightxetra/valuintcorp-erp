"use client";

import Link from "next/link";
import { Laptop, Power, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useErpWorkspace } from "@/components/erp-context";
import { cn } from "@/components/ui";
import type { ErpWorkspace } from "@/lib/erp/types";
import type { LoginSessionDevice } from "@/lib/auth/login-sessions";
import { clearServerSession } from "@/lib/erp/client-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { notify } from "@/lib/notify";

function formatSessionDate(value: string | null) {
  if (!value) return "Tidak tersedia";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak tersedia";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "emerald" | "amber" | "cyan" | "slate" }) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  }[tone];

  return <span className={cn("rounded-full px-2 py-1 text-xs font-semibold ring-1", toneClass)}>{children}</span>;
}

export function PosSecurityWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { request, demoMode } = useErpWorkspace(initialWorkspace);
  const [sessions, setSessions] = useState<LoginSessionDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);

    try {
      const body = await request<{ sessions: LoginSessionDevice[] }>("/api/auth/sessions", {
        businessId: null,
      });
      setSessions(body.sessions);
    } catch (caught) {
      notify.error("Daftar perangkat gagal dimuat", {
        description: caught instanceof Error ? caught.message : "Coba lagi.",
      });
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSessions();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSessions]);

  async function revokeSession(session: LoginSessionDevice) {
    setRevokingId(session.id);

    try {
      const body = await request<{ current: boolean }>("/api/auth/sessions", {
        method: "DELETE",
        businessId: null,
        body: JSON.stringify({ sessionId: session.id }),
      });

      notify.success(body.current ? "Perangkat ini dikeluarkan" : "Perangkat dikeluarkan", {
        description: session.deviceLabel,
      });

      if (body.current) {
        await createBrowserSupabaseClient().auth.signOut().catch(() => undefined);
        await clearServerSession();
        window.location.assign("/login?reason=session-revoked");
        return;
      }

      await loadSessions();
    } catch (caught) {
      notify.error("Perangkat gagal dikeluarkan", {
        description: caught instanceof Error ? caught.message : "Coba lagi.",
      });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Security</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Perangkat aktif</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Lihat perangkat yang masih login dan keluarkan perangkat yang tidak dipakai.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void loadSessions()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
              Refresh
            </button>
            <Link
              href="/pos"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Kembali ke kasir
            </Link>
          </div>
        </div>
      </section>

      {demoMode ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Mode demo memakai perangkat simulasi. Data perangkat asli tersedia saat production aktif.
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950">Daftar perangkat login</h2>
            <p className="text-sm text-slate-500">Hanya sesi yang masih aktif yang ditampilkan.</p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Memuat perangkat login...</div>
        ) : (
          <div className="space-y-3">
            {sessions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Belum ada sesi aktif yang tercatat.</div>
            ) : null}
            {sessions.map((session) => (
              <article key={session.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Laptop className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">{session.deviceLabel}</p>
                        {session.current ? <StatusPill tone="emerald">Perangkat ini</StatusPill> : null}
                        <StatusPill tone="emerald">Aktif</StatusPill>
                        {session.rememberMe ? <StatusPill tone="cyan">Tetap login</StatusPill> : <StatusPill tone="amber">Idle timeout</StatusPill>}
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">IP</dt>
                          <dd>{session.ipAddress ?? "Tidak tersedia"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Lokasi</dt>
                          <dd>{session.location ?? "Tidak tersedia"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Terakhir aktif</dt>
                          <dd>{formatSessionDate(session.lastSeenAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Kadaluarsa</dt>
                          <dd>{session.rememberMe ? "Persistent" : formatSessionDate(session.expiresAt)}</dd>
                        </div>
                      </dl>
                      {session.userAgent ? (
                        <p className="mt-3 break-words rounded-lg bg-slate-50 p-2 text-xs text-slate-500">{session.userAgent}</p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revokeSession(session)}
                    disabled={revokingId === session.id}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Power className="size-4" aria-hidden />
                    {session.current ? "Logout perangkat ini" : "Force logout"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
