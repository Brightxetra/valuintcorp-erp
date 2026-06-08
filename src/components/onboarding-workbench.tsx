"use client";

import { useMemo, useState } from "react";
import { accountCodes } from "@/lib/accounting/chart";
import { buildOpeningBalance, sumCredits, sumDebits } from "@/lib/accounting/engine";
import type { Business } from "@/lib/domain/types";
import { money } from "@/lib/format";

const openingRows = [
  ["Kas dan bank", accountCodes.cash, 25000000],
  ["Piutang usaha", accountCodes.accountsReceivable, 6000000],
  ["Persediaan", accountCodes.inventory, 18000000],
  ["Aset tetap", accountCodes.fixedAssets, 40000000],
  ["Utang usaha", accountCodes.accountsPayable, 7500000],
] as const;

export function OnboardingWorkbench({ business }: { business: Business }) {
  const [profile, setProfile] = useState(business);
  const [balances, setBalances] = useState(
    Object.fromEntries(openingRows.map(([, code, amount]) => [code, amount])) as Record<string, number>,
  );
  const openingJournal = useMemo(
    () =>
      buildOpeningBalance({
        businessId: profile.id,
        date: "2026-06-01",
        autoOffsetAccountCode: accountCodes.ownerCapital,
        balances: Object.entries(balances).map(([accountCode, amount]) => ({ accountCode, amount })),
      }),
    [balances, profile.id],
  );

  function updateProfile(formData: FormData) {
    setProfile((current) => ({
      ...current,
      displayName: String(formData.get("displayName")),
      legalName: String(formData.get("legalName")),
      ownerName: String(formData.get("ownerName")),
      taxId: String(formData.get("taxId")),
    }));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">Profil usaha</h2>
        <form action={updateProfile} className="mt-4 space-y-3">
          {[
            ["displayName", "Nama display", profile.displayName],
            ["legalName", "Nama legal", profile.legalName],
            ["ownerName", "Pemilik", profile.ownerName],
            ["taxId", "NPWP", profile.taxId ?? ""],
          ].map(([name, label, value]) => (
            <label key={name} className="block">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <input
                name={name}
                defaultValue={value}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          ))}
          <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
            Simpan profil
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">Saldo awal</h2>
        <p className="mt-1 text-sm text-gray-500">Saldo awal otomatis di-offset ke modal pemilik agar balance.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {openingRows.map(([label, code]) => (
            <label key={code} className="block">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <input
                type="number"
                value={balances[code]}
                onChange={(event) =>
                  setBalances((current) => ({ ...current, [code]: Number(event.target.value) }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-sm text-gray-500">Debit</p>
            <p className="font-semibold">{money(sumDebits(openingJournal.lines))}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-sm text-gray-500">Kredit</p>
            <p className="font-semibold">{money(sumCredits(openingJournal.lines))}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-semibold">Balance</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2">
        <h2 className="text-lg font-semibold">Preview jurnal saldo awal</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Akun</th>
                <th className="px-4 py-3 text-right font-medium">Debit</th>
                <th className="px-4 py-3 text-right font-medium">Kredit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {openingJournal.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{line.accountName}</p>
                    <p className="text-xs text-gray-500">{line.accountCode}</p>
                  </td>
                  <td className="px-4 py-3 text-right">{line.debit ? money(line.debit) : "-"}</td>
                  <td className="px-4 py-3 text-right">{line.credit ? money(line.credit) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
