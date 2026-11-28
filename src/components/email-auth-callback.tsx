"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { emailCallbackDestination, readEmailCallback, redeemEmailCallback } from "@/lib/auth/email-callback";
import { syncServerSession } from "@/lib/erp/client-api";
import { destinationAfterLogin } from "@/lib/erp/login-routing";

export function EmailAuthCallback({ destination }: { destination?: string }) {
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const callbackLocation = emailCallbackDestination(url);
    if (callbackLocation && new URL(callbackLocation, url.origin).pathname !== url.pathname) {
      window.location.replace(callbackLocation);
      return;
    }
    if (destination && !callbackLocation) {
      window.location.replace(destination);
      return;
    }

    const next = url.searchParams.get("next");
    const callback = readEmailCallback(url);
    window.history.replaceState(null, "", url.pathname);

    void (async () => {
      try {
        const { data, error } = await redeemEmailCallback(callback, ["email", "signup", "magiclink"]);
        if (error || !data.session) throw new Error("Tautan masuk tidak valid atau sudah digunakan. Minta tautan baru.");

        const session = await syncServerSession(null, {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          userId: data.session.user.id,
        }, { rememberMe: false, freshLogin: true });
        if (!session) throw new Error("Sesi gagal disimpan. Silakan masuk kembali.");

        window.location.replace(destinationAfterLogin(next, session.hasBusiness, session.defaultPath ?? undefined));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Tautan masuk gagal diproses.");
      }
    })();
  }, [destination]);

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <section className="w-full max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{error ? "Tautan gagal dibuka" : "Memeriksa sesi akun"}</h1>
        {error ? <><p role="alert" className="text-sm text-red-700">{error}</p><Link href="/login" className="text-sm font-medium text-emerald-700 underline">Kembali ke halaman masuk</Link></> : <p role="status" className="text-sm text-slate-600">Mohon tunggu…</p>}
      </section>
    </main>
  );
}
