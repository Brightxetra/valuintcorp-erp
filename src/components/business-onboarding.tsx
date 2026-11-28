"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, CalendarDays, Factory, Loader2, Package, Store, UserRound } from "lucide-react";
import { TextField } from "@/components/ui";
import { activateBusiness, erpApiFetch, takeBusinessNotice } from "@/lib/erp/client-api";
import { notify } from "@/lib/notify";

const setup = [
  { icon: CalendarDays, label: "Akun dan periode akuntansi" },
  { icon: Package, label: "Gudang dan lokasi awal" },
  { icon: UserRound, label: "Akses pemilik" },
];

const templates = [
  { id: "umkm", name: "UMKM", description: "Kas, penjualan, stok, dan laporan harian.", icon: Store },
  { id: "general", name: "General", description: "Produksi, multi-cabang, dan pajak bisnis.", icon: Factory },
];

export function BusinessOnboarding({ demoMode }: { demoMode: boolean }) {
  const submitted = useRef(false);
  const [createdId, setCreatedId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const message = takeBusinessNotice();
    if (message) notify.success(message);
  }, []);

  async function createBusiness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.current) return;
    submitted.current = true;
    setPending(true);
    setError("");

    try {
      if (demoMode) {
        window.location.replace("/dashboard");
        return;
      }
      const form = new FormData(event.currentTarget);
      let businessId = createdId;
      if (!businessId) {
        const created = await erpApiFetch<{ businessId: string }>("/api/erp/businesses", {
          method: "POST",
          businessId: null,
          body: JSON.stringify({ ...Object.fromEntries(form), firstBusiness: true }),
        });
        businessId = created.businessId;
        setCreatedId(businessId);
      }
      await activateBusiness(businessId, "Bisnis berhasil dibuat");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Bisnis gagal dibuat.");
      setPending(false);
      submitted.current = false;
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center overflow-x-clip bg-[#edf3f8] p-4 sm:p-8">
      <div className="onboarding-enter grid w-full max-w-[1120px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_45px_-30px_#334155] lg:grid-cols-[36%_64%]">
        <aside className="onboarding-aside px-6 py-7 text-white sm:p-9 lg:p-10">
          <div className="flex items-center gap-3 text-lg font-bold sm:text-xl">
            <div className="grid size-11 place-items-center rounded-xl bg-emerald-600"><Building2 className="size-6" aria-hidden /></div>
            Valuintcorp ERP
          </div>
          <h2 className="mt-6 max-w-md text-2xl font-bold leading-tight tracking-tight sm:text-4xl lg:mt-16">Siapkan bisnis pertama Anda</h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-300 sm:text-base">Pilih alur yang sesuai dengan cara bisnis Anda bekerja.</p>
          <ul className="mt-7 hidden space-y-4 border-t border-slate-500/60 pt-6 text-sm sm:grid lg:text-base">
            {setup.map(({ icon: Icon, label }) => <li key={label} className="flex items-center gap-3"><Icon className="size-5 shrink-0 text-emerald-200" aria-hidden />{label}</li>)}
          </ul>
        </aside>
        <section className="p-6 sm:p-9 lg:p-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Buat bisnis</h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">Isi identitas bisnis dan pilih template.</p>
          <form onSubmit={createBusiness} className="mt-6 space-y-6" aria-busy={pending}>
            <fieldset disabled={pending || Boolean(createdId)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <legend className="sr-only">Identitas bisnis</legend>
              <TextField name="displayName" label="Nama bisnis" minLength={2} maxLength={160} autoComplete="off" required />
              <TextField name="legalName" label="Nama legal" minLength={2} maxLength={160} autoComplete="off" required />
              <TextField name="ownerName" label="Nama pemilik" minLength={2} maxLength={160} autoComplete="off" required />
              <TextField name="taxId" label="NPWP (opsional)" maxLength={40} autoComplete="off" />
            </fieldset>
            <fieldset disabled={pending || Boolean(createdId)}>
              <legend className="text-xl font-bold text-slate-950">Template bisnis</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {templates.map(({ id, name, description, icon: Icon }) => (
                  <label key={id} className="group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-emerald-600 has-checked:border-emerald-700 has-checked:bg-emerald-50 motion-reduce:transition-none">
                    <input name="industry" value={id} type="radio" className="size-4 shrink-0 accent-emerald-700" required />
                    <Icon className="size-6 shrink-0 text-emerald-700" aria-hidden />
                    <span className="border-l border-slate-200 pl-3"><strong className="block text-slate-900">{name}</strong><span className="block text-xs leading-relaxed text-slate-600 sm:text-sm">{description}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{createdId ? `Bisnis sudah tersimpan. ${error}` : error}</p> : null}
            <button type="submit" disabled={pending} className="group flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-70 motion-reduce:transition-none">
              {pending ? <><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> {createdId ? "Membuka bisnis…" : "Menyiapkan bisnis…"}</> : <>{createdId ? "Buka bisnis" : "Buat bisnis"}<ArrowRight className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" aria-hidden /></>}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
