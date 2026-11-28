"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import { activateBusiness, loadBusinessOptions, type BusinessOption } from "@/lib/erp/client-api";

export function CompanySwitcher({ activeId, name, onOpen }: { activeId: string; name: string; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessOption[]>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    onOpen?.();
    setError("");
    setBusinesses(undefined);
    setOpen(true);
    try {
      setBusinesses((await loadBusinessOptions()).businesses);
    } catch {
      setError("Daftar perusahaan gagal dimuat.");
    }
  }

  async function selectCompany(company: BusinessOption) {
    if (pending || company.id === activeId) return;
    setPending(true);
    setError("");
    try {
      await activateBusiness(company.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Perusahaan gagal diaktifkan.");
      setPending(false);
    }
  }

  return (
    <div ref={panel} className="relative min-w-0" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
      <button ref={trigger} type="button" aria-label={`Ganti perusahaan, aktif ${name}`} aria-expanded={open} onClick={() => void toggle()} className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm hover:bg-slate-50 lg:px-3">
        <Building2 className="size-4 shrink-0 text-slate-500" aria-hidden />
        <span className="hidden max-w-32 truncate lg:block xl:max-w-40">{name}</span>
        <ChevronDown className="hidden size-4 shrink-0 text-slate-500 lg:block" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(17rem,calc(100vw-5rem))] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <p className="px-2 py-1 text-xs font-semibold text-slate-600">Pilih perusahaan</p>
          {error ? <p role="alert" className="px-2 py-2 text-sm text-red-700">{error}</p> : null}
          {!businesses && !error && <p role="status" className="px-2 py-2 text-sm text-slate-500">Memuat perusahaan…</p>}
          <ul className="max-h-64 overflow-y-auto">
            {businesses?.map((company) => (
              <li key={company.id}>
                <button type="button" disabled={pending || activeId === company.id} aria-current={activeId === company.id ? "true" : undefined} onClick={() => void selectCompany(company)} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 disabled:text-slate-600">
                  <span className="break-words">{company.displayName}</span>
                  {activeId === company.id && <Check className="size-4 shrink-0 text-emerald-700" aria-label="Aktif" />}
                </button>
              </li>
            ))}
          </ul>
          <Link href="/perusahaan" onClick={() => setOpen(false)} className="mt-1 block border-t border-slate-100 px-2 py-2 text-sm font-medium text-emerald-700">Perusahaan Saya</Link>
        </div>
      )}
    </div>
  );
}
