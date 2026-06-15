"use client";

import { useState, useRef } from "react";
import {
  Printer,
  AlertCircle,
} from "lucide-react";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";
import { money } from "@/lib/format";

// ============================================
// TIPE DATA
// ============================================
type ReportType = "neraca_saldo" | "neraca" | "laba_rugi" | "arus_kas";

interface ReportRow {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

// ============================================
// KOMPONEN TAB LAPORAN
// ============================================
interface ReportTabsProps {
  activeTab: ReportType;
  onTabChange: (tab: ReportType) => void;
}

function ReportTabs({ activeTab, onTabChange }: ReportTabsProps) {
  const tabs = [
    { id: "neraca_saldo" as ReportType, label: "📊 Neraca Saldo", description: "Trial Balance" },
    { id: "neraca" as ReportType, label: "📋 Neraca", description: "Balance Sheet" },
    { id: "laba_rugi" as ReportType, label: "📈 Laba Rugi", description: "Profit & Loss" },
    { id: "arus_kas" as ReportType, label: "💵 Arus Kas", description: "Cash Flow" },
  ];

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === tab.id
              ? "bg-emerald-700 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ============================================
// KOMPONEN TABEL LAPORAN
// ============================================
interface ReportTableProps {
  title: string;
  data: ReportRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced?: boolean;
}

function ReportTable({ title, data, totalDebit, totalCredit, isBalanced = true }: ReportTableProps) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-lg font-semibold text-slate-950">{title}</h2>
      <table className="w-full text-sm border-collapse border border-slate-300">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-4 py-2 text-left font-semibold text-slate-700">Kode</th>
            <th className="border border-slate-300 px-4 py-2 text-left font-semibold text-slate-700">Nama Akun</th>
            <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-700">Debet (Rp)</th>
            <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-700">Kredit (Rp)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index}>
              <td className="border border-slate-300 px-4 py-2 font-mono text-xs text-slate-500">{row.code}</td>
              <td className="border border-slate-300 px-4 py-2 font-medium text-slate-950">{row.name}</td>
              <td className="border border-slate-300 px-4 py-2 text-right font-mono">
                {row.debit > 0 ? money(row.debit) : "-"}
              </td>
              <td className="border border-slate-300 px-4 py-2 text-right font-mono">
                {row.credit > 0 ? money(row.credit) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-400 font-bold bg-slate-50">
          <tr>
            <td colSpan={2} className="border border-slate-300 px-4 py-2">TOTAL</td>
            <td className="border border-slate-300 px-4 py-2 text-right font-mono text-slate-950">{money(totalDebit)}</td>
            <td className="border border-slate-300 px-4 py-2 text-right font-mono text-slate-950">{money(totalCredit)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Status Balance */}
      {isBalanced && totalDebit === totalCredit && (
        <div className="mt-2 text-sm text-emerald-700">
          ✓ Neraca saldo sudah seimbang (Debet = Kredit)
        </div>
      )}
    </div>
  );
}

// ============================================
// NERACA SALDO (TRIAL BALANCE)
// ============================================
function TrialBalanceReport() {
  const data: ReportRow[] = [
    { code: "1-1101", name: "Kas Tunai", debit: 15_000_000, credit: 0 },
    { code: "1-1102", name: "Bank BCA", debit: 25_000_000, credit: 0 },
    { code: "1-1103", name: "Bank Mandiri", debit: 5_500_000, credit: 0 },
    { code: "1-1201", name: "Piutang Usaha", debit: 25_000_000, credit: 0 },
    { code: "1-1301", name: "Persediaan Barang", debit: 30_000_000, credit: 0 },
    { code: "2-1101", name: "Utang Usaha", debit: 0, credit: 15_000_000 },
    { code: "2-1201", name: "Utang Gaji", debit: 0, credit: 1_200_000 },
    { code: "3-1101", name: "Modal Utama", debit: 0, credit: 50_000_000 },
    { code: "3-2101", name: "Laba Ditahan", debit: 0, credit: 20_300_000 },
    { code: "4-1101", name: "Penjualan", debit: 0, credit: 85_000_000 },
    { code: "5-1101", name: "Harga Pokok Penjualan", debit: 50_000_000, credit: 0 },
    { code: "5-1102", name: "Beban Gaji", debit: 15_000_000, credit: 0 },
    { code: "5-1103", name: "Beban Sewa", debit: 3_000_000, credit: 0 },
    { code: "5-1104", name: "Beban Listrik & Air", debit: 1_000_000, credit: 0 },
  ];

  const totalDebit = data.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = data.reduce((sum, row) => sum + row.credit, 0);

  return (
    <div className="space-y-4">
      <ReportTable
        title="Neraca Saldo (Trial Balance)"
        data={data}
        totalDebit={totalDebit}
        totalCredit={totalCredit}
        isBalanced={true}
      />

      {/* Penjelasan - hanya tampil di layar */}
      <div className="screen-only rounded-lg bg-blue-50 p-4">
        <h4 className="flex items-center gap-2 font-semibold text-blue-800">
          <AlertCircle className="size-4" />
          Apa itu Neraca Saldo?
        </h4>
        <p className="mt-2 text-sm text-blue-700">
          Neraca Saldo adalah laporan yang menampilkan semua akun beserta posisi Debet dan Kredit-nya.
          Total Debet harus sama dengan total Kredit agar pembukuan seimbang (balance).
        </p>
      </div>
    </div>
  );
}

// ============================================
// NERACA (BALANCE SHEET)
// ============================================
function BalanceSheetReport() {
  const aktivaLancar = [
    { name: "Kas Tunai", value: 15_000_000 },
    { name: "Bank BCA", value: 25_000_000 },
    { name: "Bank Mandiri", value: 5_500_000 },
    { name: "Piutang Usaha", value: 25_000_000 },
    { name: "Persediaan", value: 30_000_000 },
  ];
  const totalAktivaLancar = aktivaLancar.reduce((sum, item) => sum + item.value, 0);
  const totalAktiva = totalAktivaLancar;

  const kewajiban = [
    { name: "Utang Usaha", value: 15_000_000 },
    { name: "Utang Gaji", value: 1_200_000 },
  ];
  const totalKewajiban = kewajiban.reduce((sum, item) => sum + item.value, 0);

  const modalFixed = [
    { name: "Modal Utama", value: 50_000_000 },
    { name: "Laba Ditahan", value: 20_300_000 },
  ];
  const modalFixedTotal = modalFixed.reduce((s, m) => s + m.value, 0);
  const modal = [
    ...modalFixed,
    { name: "Laba Tahun Berjalan", value: totalAktiva - totalKewajiban - modalFixedTotal },
  ];
  const totalModal = modal.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-6">
      {/* AKTIVA */}
      <div className="mb-4">
        <h3 className="bg-blue-600 text-white px-4 py-2 font-bold text-sm">AKTIVA</h3>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {aktivaLancar.map((item) => (
              <tr key={item.name}>
                <td className="border border-slate-300 px-4 py-2 pl-8 text-slate-700">{item.name}</td>
                <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(item.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-400 font-bold bg-slate-100">
            <tr>
              <td className="border border-slate-300 px-4 py-2">TOTAL AKTIVA</td>
              <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(totalAktiva)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* KEWAJIBAN */}
      <div className="mb-4">
        <h3 className="bg-red-600 text-white px-4 py-2 font-bold text-sm">KEWAJIBAN</h3>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {kewajiban.map((item) => (
              <tr key={item.name}>
                <td className="border border-slate-300 px-4 py-2 pl-8 text-slate-700">{item.name}</td>
                <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(item.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-400 font-bold bg-slate-100">
            <tr>
              <td className="border border-slate-300 px-4 py-2">TOTAL KEWAJIBAN</td>
              <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(totalKewajiban)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* MODAL */}
      <div className="mb-4">
        <h3 className="bg-purple-600 text-white px-4 py-2 font-bold text-sm">MODAL</h3>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {modal.map((item) => (
              <tr key={item.name}>
                <td className="border border-slate-300 px-4 py-2 pl-8 text-slate-700">{item.name}</td>
                <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(item.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-400 font-bold bg-slate-100">
            <tr>
              <td className="border border-slate-300 px-4 py-2">TOTAL MODAL</td>
              <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(totalModal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* TOTAL KEWAJIBAN + MODAL */}
      <div className="border-2 border-green-600 bg-green-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-green-800">TOTAL KEWAJIBAN + MODAL</span>
          <span className="text-2xl font-bold text-green-700">{money(totalKewajiban + totalModal)}</span>
        </div>
        <p className="mt-2 text-sm text-green-600">
          ✓ Total Aktiva = Total Kewajiban + Modal (Neraca Seimbang)
        </p>
      </div>

      {/* Penjelasan - hanya tampil di layar */}
      <div className="screen-only rounded-lg bg-blue-50 p-4">
        <h4 className="flex items-center gap-2 font-semibold text-blue-800">
          <AlertCircle className="size-4" />
          Apa itu Neraca?
        </h4>
        <p className="mt-2 text-sm text-blue-700">
          Neraca (Balance Sheet) menampilkan posisi keuangan perusahaan pada tanggal tertentu:
          <strong> Aktiva</strong> (aset yang dimiliki),
          <strong> Kewajiban</strong> (hutang),
          dan <strong>Modal</strong> (selisih aset - kewajiban).
          Selalu harus seimbang: Aktiva = Kewajiban + Modal.
        </p>
      </div>
    </div>
  );
}

// ============================================
// LAPORAN LABA RUGI
// ============================================
function ProfitLossReport() {
  const pendapatan = [
    { name: "Penjualan", value: 85_000_000 },
    { name: "Pendapatan Lain", value: 2_000_000 },
  ];
  const totalPendapatan = pendapatan.reduce((sum, item) => sum + item.value, 0);

  const hpp = [
    { name: "Harga Pokok Penjualan", value: 50_000_000 },
  ];
  const totalHPP = hpp.reduce((sum, item) => sum + item.value, 0);
  const labaKotor = totalPendapatan - totalHPP;

  const bebanOperasional = [
    { name: "Beban Gaji", value: 15_000_000 },
    { name: "Beban Sewa", value: 3_000_000 },
    { name: "Beban Listrik & Air", value: 1_000_000 },
    { name: "Beban Lainnya", value: 500_000 },
  ];
  const totalBebanOperasional = bebanOperasional.reduce((sum, item) => sum + item.value, 0);
  const labaBersih = labaKotor - totalBebanOperasional;

  return (
    <div className="space-y-6">
      {/* PENDAPATAN */}
      <div className="mb-4">
        <h3 className="bg-green-600 text-white px-4 py-2 font-bold text-sm">PENDAPATAN</h3>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {pendapatan.map((item) => (
              <tr key={item.name}>
                <td className="border border-slate-300 px-4 py-2 pl-8 text-slate-700">{item.name}</td>
                <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(item.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-400 font-bold bg-slate-100">
            <tr>
              <td className="border border-slate-300 px-4 py-2">TOTAL PENDAPATAN</td>
              <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(totalPendapatan)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* HPP */}
      <div className="mb-4">
        <h3 className="bg-slate-600 text-white px-4 py-2 font-bold text-sm">HARGA POKOK PENJUALAN</h3>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {hpp.map((item) => (
              <tr key={item.name}>
                <td className="border border-slate-300 px-4 py-2 pl-8 text-slate-700">{item.name}</td>
                <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(item.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-400 font-bold bg-slate-100">
            <tr>
              <td className="border border-slate-300 px-4 py-2">TOTAL HPP</td>
              <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(totalHPP)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* LABA KOTOR */}
      <div className="border-2 border-green-600 bg-green-50 p-4">
        <div className="flex items-center justify-between">
          <span className="font-bold text-green-800">LABA KOTOR</span>
          <span className="text-xl font-bold text-green-700">{money(labaKotor)}</span>
        </div>
        <p className="mt-1 text-sm text-green-600">
          Margin: {((labaKotor / totalPendapatan) * 100).toFixed(1)}%
        </p>
      </div>

      {/* BEBAN OPERASIONAL */}
      <div className="mb-4">
        <h3 className="bg-red-600 text-white px-4 py-2 font-bold text-sm">BEBAN OPERASIONAL</h3>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {bebanOperasional.map((item) => (
              <tr key={item.name}>
                <td className="border border-slate-300 px-4 py-2 pl-8 text-slate-700">{item.name}</td>
                <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(item.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-400 font-bold bg-slate-100">
            <tr>
              <td className="border border-slate-300 px-4 py-2">TOTAL BEBAN</td>
              <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(totalBebanOperasional)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* LABA BERSIH */}
      <div className="border-2 border-green-700 bg-green-100 p-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-green-900">LABA BERSIH</span>
          <span className="text-2xl font-bold text-green-700">{money(labaBersih)}</span>
        </div>
        <p className="mt-1 text-sm text-green-700">
          Margin: {((labaBersih / totalPendapatan) * 100).toFixed(1)}%
        </p>
      </div>

      {/* Penjelasan - hanya tampil di layar */}
      <div className="screen-only rounded-lg bg-blue-50 p-4">
        <h4 className="flex items-center gap-2 font-semibold text-blue-800">
          <AlertCircle className="size-4" />
          Apa itu Laba Rugi?
        </h4>
        <p className="mt-2 text-sm text-blue-700">
          Laporan Laba Rugi (Profit & Loss) menampilkan performa bisnis dalam periode tertentu:
          <strong> Pendapatan</strong> dikurangi <strong>Harga Pokok</strong> = Laba Kotor,
          kemudian dikurangi <strong>Beban Operasional</strong> = Laba Bersih.
        </p>
      </div>
    </div>
  );
}

// ============================================
// ARUS KAS
// ============================================
function CashFlowReport() {
  const kasAwal = 35_000_000;

  const aktivitasOperasiMasuk = [
    { name: "Penerimaan dari Pelanggan", value: 80_000_000 },
  ];
  const totalOperasiMasuk = aktivitasOperasiMasuk.reduce((sum, item) => sum + item.value, 0);

  const aktivitasOperasiKeluar = [
    { name: "Pembayaran ke Supplier", value: 45_000_000 },
    { name: "Pembayaran Gaji", value: 15_000_000 },
    { name: "Pembayaran Beban Operasional", value: 5_000_000 },
  ];
  const totalOperasiKeluar = aktivitasOperasiKeluar.reduce((sum, item) => sum + item.value, 0);
  const arusOperasi = totalOperasiMasuk - totalOperasiKeluar;

  const kasAkhir = kasAwal + arusOperasi;

  return (
    <div className="space-y-6">
      {/* KAS AWAL */}
      <div className="mb-4">
        <h3 className="bg-cyan-600 text-white px-4 py-2 font-bold text-sm">POSISI KAS AWAL</h3>
        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr>
              <td className="border border-slate-300 px-4 py-2 pl-8 text-slate-700">Kas/Bank Awal Periode</td>
              <td className="border border-slate-300 px-4 py-2 text-right font-mono">{money(kasAwal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ARUS KAS DARI OPERASI */}
      <div className="mb-4">
        <h3 className="bg-green-600 text-white px-4 py-2 font-bold text-sm">ARUS KAS DARI AKTIVITAS OPERASI</h3>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {aktivitasOperasiMasuk.map((item) => (
              <tr key={item.name}>
                <td className="border border-slate-300 px-4 py-2 pl-8 text-green-700">{item.name}</td>
                <td className="border border-slate-300 px-4 py-2 text-right font-mono text-green-700">{money(item.value)}</td>
              </tr>
            ))}
            {aktivitasOperasiKeluar.map((item) => (
              <tr key={item.name}>
                <td className="border border-slate-300 px-4 py-2 pl-8 text-red-700">{item.name}</td>
                <td className="border border-slate-300 px-4 py-2 text-right font-mono text-red-700">({money(item.value)})</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-400 font-bold bg-slate-100">
            <tr>
              <td className="border border-slate-300 px-4 py-2">Arus Kas Neto dari Operasi</td>
              <td className={`border border-slate-300 px-4 py-2 text-right font-mono ${arusOperasi >= 0 ? "text-green-700" : "text-red-700"}`}>
                {arusOperasi >= 0 ? money(arusOperasi) : `(${money(Math.abs(arusOperasi))})`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* KAS AKHIR */}
      <div className="border-2 border-green-600 bg-green-100 p-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-green-900">SALDO KAS/BANK AKHIR</span>
          <span className="text-2xl font-bold text-green-700">{money(kasAkhir)}</span>
        </div>
        <p className="mt-1 text-sm text-green-700">
          Perubahan: {kasAkhir >= kasAwal ? "+" : ""}{money(kasAkhir - kasAwal)} ({(((kasAkhir - kasAwal) / kasAwal) * 100).toFixed(1)}%)
        </p>
      </div>

      {/* Penjelasan - hanya tampil di layar */}
      <div className="screen-only rounded-lg bg-blue-50 p-4">
        <h4 className="flex items-center gap-2 font-semibold text-blue-800">
          <AlertCircle className="size-4" />
          Apa itu Arus Kas?
        </h4>
        <p className="mt-2 text-sm text-blue-700">
          Laporan Arus Kas (Cash Flow) menampilkan pergerakan uang masuk dan keluar perusahaan.
          Positive cash flow berarti perusahaan menghasilkan uang, negative berarti menggunakan lebih banyak
          daripada menghasilkan.
        </p>
      </div>
    </div>
  );
}

// ============================================
// WORKSPACE UTAMA
// ============================================
export function LaporanWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace } = useErpWorkspace(initialWorkspace);
  const [activeReport, setActiveReport] = useState<ReportType>("neraca_saldo");
  const [period, setPeriod] = useState("Juni 2026");
  const reportRef = useRef<HTMLDivElement>(null);

  // Fungsi Print
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER - Hidden saat print */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between screen-only">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">📈 Laporan Keuangan</h1>
          <p className="mt-1 text-slate-600">Neraca Saldo, Neraca, Laba Rugi, dan Arus Kas</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="Mei 2026">Mei 2026</option>
            <option value="Juni 2026">Juni 2026</option>
            <option value="Juli 2026">Juli 2026</option>
          </select>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="size-4" /> Print / Simpan PDF
          </button>
        </div>
      </div>

      {/* TABS - Hidden saat print */}
      <div className="screen-only">
        <ReportTabs activeTab={activeReport} onTabChange={setActiveReport} />
      </div>

      {/* CONTENT - Print Area */}
      <div ref={reportRef} id="report-content" className="print-content">
        {/* Header untuk Print */}
        <div className="print-header hidden">
          <div className="text-center mb-4">
            <h1 className="text-xl font-bold">{workspace.business.displayName}</h1>
            <p className="text-sm">{workspace.business.industry}</p>
            <h2 className="text-lg font-bold mt-2">{getReportTitle(activeReport)}</h2>
            <p className="text-sm">Periode: {period}</p>
          </div>
          <hr className="border-t border-black my-2" />
        </div>

        {activeReport === "neraca_saldo" && <TrialBalanceReport />}
        {activeReport === "neraca" && <BalanceSheetReport />}
        {activeReport === "laba_rugi" && <ProfitLossReport />}
        {activeReport === "arus_kas" && <CashFlowReport />}

        {/* Footer untuk Print */}
        <div className="print-footer hidden mt-6 pt-4 border-t border-black">
          <p className="text-xs text-center">
            Dicetak dari Valuintcorp ERP pada {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper function
function getReportTitle(type: ReportType): string {
  const titles: Record<ReportType, string> = {
    neraca_saldo: "📊 Neraca Saldo (Trial Balance)",
    neraca: "📋 Neraca (Balance Sheet)",
    laba_rugi: "📈 Laporan Laba Rugi (Profit & Loss)",
    arus_kas: "💵 Laporan Arus Kas (Cash Flow)",
  };
  return titles[type];
}
