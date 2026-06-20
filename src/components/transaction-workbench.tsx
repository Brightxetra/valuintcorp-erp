"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileInput, Plus, RotateCcw } from "lucide-react";
import { FeedbackToast } from "@/components/feedback-toast";
import type { JournalEntry } from "@/lib/domain/types";
import { parseCsv } from "@/lib/import/csv";
import { money } from "@/lib/format";

type TransactionKind = "sale" | "expense" | "inventory_purchase" | "payroll";

const fieldLabels: Record<string, string> = {
  amount: "Nilai beban",
  cashReceived: "Kas diterima",
  cogs: "HPP",
  date: "Tanggal",
  description: "Deskripsi",
  grossPay: "Gaji bruto",
  inventoryAmount: "Nilai persediaan",
  inventoryCost: "Nilai persediaan keluar",
  netCashPaid: "Kas dibayarkan",
  otherDeductionsPayable: "Potongan lain",
  paidAmount: "Dibayar kas",
  payableAmount: "Masih terutang",
  receivableAmount: "Piutang",
  revenueAmount: "Omzet",
  salaryPayable: "Sisa gaji terutang",
  taxPayable: "Pajak terutang",
  taxWithheld: "Potongan pajak",
};

const defaults = {
  sale: {
    type: "sale",
    date: "2026-06-28",
    revenueAmount: 1500000,
    cashReceived: 1000000,
    receivableAmount: 500000,
    taxPayable: 0,
    cogs: 550000,
    inventoryCost: 550000,
  },
  expense: {
    type: "expense",
    date: "2026-06-28",
    amount: 275000,
    paidAmount: 275000,
    payableAmount: 0,
    description: "Beban operasional",
  },
  inventory_purchase: {
    type: "inventory_purchase",
    date: "2026-06-28",
    inventoryAmount: 1200000,
    paidAmount: 800000,
    payableAmount: 400000,
  },
  payroll: {
    type: "payroll",
    date: "2026-06-28",
    grossPay: 2000000,
    netCashPaid: 1700000,
    salaryPayable: 100000,
    taxWithheld: 100000,
    otherDeductionsPayable: 100000,
  },
} satisfies Record<TransactionKind, Record<string, string | number>>;

function numericValue(value: FormDataEntryValue | null): number {
  return Number(value ?? 0);
}

function payloadFromForm(kind: TransactionKind, formData: FormData) {
  if (kind === "sale") {
    return {
      type: kind,
      date: String(formData.get("date")),
      revenueAmount: numericValue(formData.get("revenueAmount")),
      cashReceived: numericValue(formData.get("cashReceived")),
      receivableAmount: numericValue(formData.get("receivableAmount")),
      taxPayable: numericValue(formData.get("taxPayable")),
      cogs: numericValue(formData.get("cogs")),
      inventoryCost: numericValue(formData.get("inventoryCost")),
    };
  }

  if (kind === "expense") {
    return {
      type: kind,
      date: String(formData.get("date")),
      amount: numericValue(formData.get("amount")),
      paidAmount: numericValue(formData.get("paidAmount")),
      payableAmount: numericValue(formData.get("payableAmount")),
      description: String(formData.get("description") || "Beban operasional"),
    };
  }

  if (kind === "inventory_purchase") {
    return {
      type: kind,
      date: String(formData.get("date")),
      inventoryAmount: numericValue(formData.get("inventoryAmount")),
      paidAmount: numericValue(formData.get("paidAmount")),
      payableAmount: numericValue(formData.get("payableAmount")),
    };
  }

  return {
    type: kind,
    date: String(formData.get("date")),
    grossPay: numericValue(formData.get("grossPay")),
    netCashPaid: numericValue(formData.get("netCashPaid")),
    salaryPayable: numericValue(formData.get("salaryPayable")),
    taxWithheld: numericValue(formData.get("taxWithheld")),
    otherDeductionsPayable: numericValue(formData.get("otherDeductionsPayable")),
  };
}

function Field({
  name,
  label,
  type = "number",
  defaultValue,
}: {
  name: string;
  label: string;
  type?: "number" | "date" | "text";
  defaultValue: string | number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

export function TransactionWorkbench({ initialEntries }: { initialEntries: JournalEntry[] }) {
  const [kind, setKind] = useState<TransactionKind>("sale");
  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries);
  const [preview, setPreview] = useState<JournalEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [csvText, setCsvText] = useState("date,amount,description,reference\n2026-06-28,250000,GoFood settlement,TRX-001\n2026-06-28,250000,GoFood settlement,TRX-001");

  const csvResult = useMemo(() => parseCsv(csvText, ["date", "amount", "description"]), [csvText]);

  async function previewJournal(formData: FormData) {
    setError(null);
    setSuccess(null);
    setPreview(null);
    setPending(true);

    try {
      const response = await fetch("/api/journals/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payloadFromForm(kind, formData)),
      });
      const body = await response.json();

      if (!response.ok) {
        const fieldErrors = body.errors?.fieldErrors
          ? Object.entries(body.errors.fieldErrors)
              .flatMap(([field, messages]) =>
                Array.isArray(messages) ? messages.map((message) => `${field}: ${message}`) : [],
              )
              .join("; ")
          : "";
        setError((body.errors?.formErrors?.[0] ?? fieldErrors) || body.error || "Input tidak valid.");
        return;
      }

      setPreview(body.journalEntry);
      setSuccess("Preview jurnal berhasil dibuat. Review debit/kredit sebelum posting.");
    } catch {
      setError("Gagal menghubungi API preview. Periksa koneksi atau jalankan ulang dev server.");
    } finally {
      setPending(false);
    }
  }

  function postPreview() {
    if (!preview) return;
    setEntries((current) => [preview, ...current]);
    setPreview(null);
    setSuccess("Jurnal dipost ke daftar lokal. Persistence database akan aktif setelah Supabase terhubung.");
  }

  const fields = defaults[kind];

  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Input transaksi</h2>
          <p className="mt-1 text-sm text-gray-500">Form ini memanggil API preview dan membuat jurnal debit-kredit.</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["sale", "Penjualan"],
            ["expense", "Beban"],
            ["inventory_purchase", "Pembelian stok"],
            ["payroll", "Payroll"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setKind(value as TransactionKind);
                setPreview(null);
                setError(null);
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                kind === value
                  ? "border-gray-950 bg-gray-950 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form action={previewJournal} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(fields)
              .filter(([name]) => name !== "type")
              .map(([name, value]) => (
                <Field
                  key={`${kind}-${name}`}
                  name={name}
                  label={fieldLabels[name] ?? name}
                  type={name === "date" ? "date" : name === "description" ? "text" : "number"}
                  defaultValue={value}
                />
              ))}
          </div>
          <FeedbackToast error={error} success={success} />
          <div className="flex flex-wrap gap-2">
            <button
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {pending ? "Membuat preview..." : "Preview jurnal"}
            </button>
            <button
              type="button"
              onClick={postPreview}
              disabled={!preview}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden />
              Post ke daftar lokal
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">Preview jurnal</h2>
        {preview ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Akun</th>
                  <th className="px-3 py-2 text-right font-medium">Debit</th>
                  <th className="px-3 py-2 text-right font-medium">Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{line.accountName}</p>
                      <p className="text-xs text-gray-500">{line.accountCode}</p>
                    </td>
                    <td className="px-3 py-2 text-right">{line.debit ? money(line.debit) : "-"}</td>
                    <td className="px-3 py-2 text-right">{line.credit ? money(line.credit) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
            Isi form lalu klik Preview jurnal.
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Daftar jurnal</h2>
            <p className="mt-1 text-sm text-gray-500">Data yang dipost dari form akan muncul di atas secara lokal.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEntries(initialEntries);
              setPreview(null);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium"
          >
            <RotateCcw className="size-4" aria-hidden />
            Reset demo
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Deskripsi</th>
                <th className="px-4 py-3 font-medium">Sumber</th>
                <th className="px-4 py-3 text-right font-medium">Total debit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-gray-500">{entry.date}</td>
                  <td className="px-4 py-3 font-medium">{entry.description}</td>
                  <td className="px-4 py-3">{entry.source}</td>
                  <td className="px-4 py-3 text-right">
                    {money(entry.lines.reduce((total, line) => total + line.debit, 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-lg bg-cyan-50 p-3 text-cyan-700">
            <FileInput className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Import CSV preview</h2>
            <p className="text-sm text-gray-500">Menguji header wajib dan deteksi duplikat sebelum commit.</p>
          </div>
        </div>
        <textarea
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          rows={5}
          className="w-full rounded-lg border border-gray-300 p-3 font-mono text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">Valid rows: {csvResult.rows.length}</div>
          <div className="rounded-lg bg-gray-50 p-3 text-sm">Duplikat: {csvResult.duplicates.length}</div>
          <div className="rounded-lg bg-gray-50 p-3 text-sm">Error: {csvResult.errors.length}</div>
        </div>
      </section>
    </div>
  );
}
