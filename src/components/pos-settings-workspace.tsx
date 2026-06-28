"use client";

import Link from "next/link";
import { CheckCircle2, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { useErpWorkspace } from "@/components/erp-context";
import { cn } from "@/components/ui";
import type { ErpWorkspace } from "@/lib/erp/types";
import { getAccessiblePosBranches } from "@/lib/pos/branches";
import { readStoredPosLocationId, writeStoredPosLocationId } from "@/lib/pos/preferences";
import { notify } from "@/lib/notify";

export function PosSettingsWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace } = useErpWorkspace(initialWorkspace);
  const branches = useMemo(() => getAccessiblePosBranches(workspace), [workspace]);
  const [selectedId, setSelectedId] = useState(() => {
    const storedId = readStoredPosLocationId();
    return branches.some((branch) => branch.id === storedId) ? storedId : branches[0]?.id ?? "";
  });

  function selectBranch(locationId: string) {
    const branch = branches.find((item) => item.id === locationId);
    if (!branch) return;

    setSelectedId(locationId);
    writeStoredPosLocationId(locationId);
    notify.success("Cabang POS dipilih", { description: branch.name });
  }

  if (branches.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Store className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-950">Cabang POS belum tersedia</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Tambahkan cabang atau hubungkan cabang ke gudang dari pengaturan bisnis utama.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pengaturan POS</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Pilih cabang kerja</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Cabang yang dipilih akan dipakai di halaman kasir sampai Anda menggantinya.
            </p>
          </div>
          <Link
            href="/pos"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Kembali ke kasir
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((branch) => {
          const active = branch.id === selectedId;

          return (
            <article
              key={branch.id}
              className={cn(
                "rounded-2xl border bg-white p-4 shadow-sm transition",
                active ? "border-slate-950 ring-1 ring-slate-950" : "border-slate-200",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950">{branch.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{branch.code}</p>
                </div>
                {active ? <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden /> : null}
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-medium text-slate-950">Gudang terhubung</p>
                <p className="mt-1 break-words">{branch.warehouseId ? "Siap dipakai untuk stok cabang." : "Belum ada gudang."}</p>
              </div>
              <button
                type="button"
                onClick={() => selectBranch(branch.id)}
                disabled={active}
                className={cn(
                  "mt-4 min-h-11 w-full rounded-xl px-4 text-sm font-semibold transition",
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-950 text-white hover:bg-slate-800",
                )}
              >
                {active ? "Sedang digunakan" : "Gunakan cabang ini"}
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
