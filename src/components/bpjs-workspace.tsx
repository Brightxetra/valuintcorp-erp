"use client";

import { useState } from "react";
import Link from "next/link";
import {
  HeartPulse,
  ChevronRight,
  Calculator,
  Download,
  Info,
  AlertTriangle,
  TrendingUp,
  Users,
  Check,
} from "lucide-react";
import {
  ActionButton,
  Panel,
  StatusPill,
  SelectField,
  TextField,
  EmptyState,
} from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";
import { money } from "@/lib/format";

// ============================================
// TIPE DATA
// ============================================
interface BPJSCalculation {
  employeeId: string;
  employeeName: string;
  grossSalary: number;
  kesehatanEmployee: number;
  kesehatanEmployer: number;
  jhtEmployee: number;
  jhtEmployer: number;
  jpnEmployee: number;
  jpnEmployer: number;
  jkk: number;
  jkm: number;
  totalEmployee: number;
  totalEmployer: number;
  totalContribution: number;
}

// ============================================
// KOMPONEN KARTU RINGKASAN
// ============================================
interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  tone?: "emerald" | "amber" | "blue" | "purple";
}

function SummaryCard({ title, value, subtitle, icon: Icon, tone = "emerald" }: SummaryCardProps) {
  const toneClasses = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };

  return (
    <div className={`rounded-lg border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="mt-1 text-xl font-bold">{value}</p>
          {subtitle && <p className="mt-1 text-xs opacity-60">{subtitle}</p>}
        </div>
        <Icon className="size-6 opacity-50" />
      </div>
    </div>
  );
}

// ============================================
// KOMPONEN TABEL PERHITUNGAN
// ============================================
function CalculationTable({ calculations }: { calculations: BPJSCalculation[] }) {
  const totalKaryawan = calculations.reduce((sum, c) => sum + c.totalEmployee, 0);
  const totalPerusahaan = calculations.reduce((sum, c) => sum + c.totalEmployer, 0);
  const totalSemua = calculations.reduce((sum, c) => sum + c.totalContribution, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-500">Karyawan</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Gaji (Max 12jt)</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Kesehatan<br/>(1%)</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">JHT<br/>(3.7%)</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">JPN<br/>(2%)</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Iuran Saya<br/>(Total)</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Iuran Perusahaan<br/>(Total)</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Total<br/>(Semua)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {calculations.map((calc) => (
            <tr key={calc.employeeId} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                    {calc.employeeName.charAt(0)}
                  </div>
                  <span className="font-medium">{calc.employeeName}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-mono">{money(calc.grossSalary)}</td>
              <td className="px-4 py-3 text-right">
                <div className="text-xs text-slate-500">
                  <div>{money(calc.kesehatanEmployee)}</div>
                  <div className="text-emerald-600">+{money(calc.kesehatanEmployer)}</div>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="text-xs text-slate-500">
                  <div>{money(calc.jhtEmployee)}</div>
                  <div className="text-emerald-600">+{money(calc.jhtEmployer)}</div>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="text-xs text-slate-500">
                  <div>{money(calc.jpnEmployee)}</div>
                  <div className="text-emerald-600">+{money(calc.jpnEmployer)}</div>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-medium text-emerald-700">
                {money(calc.totalEmployee)}
              </td>
              <td className="px-4 py-3 text-right font-medium text-blue-700">
                {money(calc.totalEmployer)}
              </td>
              <td className="px-4 py-3 text-right font-bold text-slate-950">
                {money(calc.totalContribution)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
          <tr>
            <td className="px-4 py-3">TOTAL</td>
            <td className="px-4 py-3 text-right">
              {money(calculations.reduce((sum, c) => sum + c.grossSalary, 0))}
            </td>
            <td className="px-4 py-3 text-right">
              <div>
                {money(calculations.reduce((sum, c) => sum + c.kesehatanEmployee, 0))}
              </div>
              <div className="text-emerald-600">
                +{money(calculations.reduce((sum, c) => sum + c.kesehatanEmployer, 0))}
              </div>
            </td>
            <td className="px-4 py-3 text-right">
              <div>
                {money(calculations.reduce((sum, c) => sum + c.jhtEmployee, 0))}
              </div>
              <div className="text-emerald-600">
                +{money(calculations.reduce((sum, c) => sum + c.jhtEmployer, 0))}
              </div>
            </td>
            <td className="px-4 py-3 text-right">
              <div>
                {money(calculations.reduce((sum, c) => sum + c.jpnEmployee, 0))}
              </div>
              <div className="text-emerald-600">
                +{money(calculations.reduce((sum, c) => sum + c.jpnEmployer, 0))}
              </div>
            </td>
            <td className="px-4 py-3 text-right text-emerald-700">
              {money(totalKaryawan)}
            </td>
            <td className="px-4 py-3 text-right text-blue-700">
              {money(totalPerusahaan)}
            </td>
            <td className="px-4 py-3 text-right text-slate-950">
              {money(totalSemua)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ============================================
// KALKULATOR UTAMA
// ============================================
function calculateBPJS(grossSalary: number): Omit<BPJSCalculation, "employeeId" | "employeeName"> {
  // Maksimal gaji untuk BPJS Kesehatan: 12.000.000
  const maxGajiKesehatan = 12_000_000;
  // Maksimal gaji untuk JHT & JPN: 1.466.800 * 12 = 17.601.600, tapi hitung per bulan
  const maxGajiJht = 1_466_800 * 12 / 12; // per bulan
  const maxGajiJpn = 1_466_800 * 12 / 12;

  const basisKesehatan = Math.min(grossSalary, maxGajiKesehatan);
  const basisJht = Math.min(grossSalary, maxGajiJht);
  const basisJpn = Math.min(grossSalary, maxGajiJpn);

  // BPJS Kesehatan: 1% employee, 4% employer
  const kesehatanEmployee = Math.round(basisKesehatan * 0.01);
  const kesehatanEmployer = Math.round(basisKesehatan * 0.04);

  // JHT: 3.7% employee, 3.7% employer
  const jhtEmployee = Math.round(basisJht * 0.037);
  const jhtEmployer = Math.round(basisJht * 0.037);

  // JPN: 2% employee, 2% employer
  const jpnEmployee = Math.round(basisJpn * 0.02);
  const jpnEmployer = Math.round(basisJpn * 0.02);

  // JKK & JKM: hanya perusahaan (bervariasi, gunakan rata-rata 0.54% + 0.3%)
  const jkk = Math.round(grossSalary * 0.0054); // 0.54% rata-rata
  const jkm = Math.round(grossSalary * 0.003); // 0.3%

  const totalEmployee = kesehatanEmployee + jhtEmployee + jpnEmployee;
  const totalEmployer = kesehatanEmployer + jhtEmployer + jpnEmployer + jkk + jkm;
  const totalContribution = totalEmployee + totalEmployer;

  return {
    grossSalary,
    kesehatanEmployee,
    kesehatanEmployer,
    jhtEmployee,
    jhtEmployer,
    jpnEmployee,
    jpnEmployer,
    jkk,
    jkm,
    totalEmployee,
    totalEmployer,
    totalContribution,
  };
}

// ============================================
// WORKSPACE UTAMA
// ============================================
export function BPJSWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace } = useErpWorkspace(initialWorkspace);
  const [selectedPeriod, setSelectedPeriod] = useState("Juni 2026");
  const [showDetail, setShowDetail] = useState(true);

  const activeEmployees = workspace.employees.filter((e) => e.status === "active");

  // Hitung BPJS untuk semua karyawan aktif
  const calculations: BPJSCalculation[] = activeEmployees.map((emp) => {
    const grossSalary = emp.baseSalary * 1.1; // +10% tunjangan
    const bpjsData = calculateBPJS(grossSalary);
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      ...bpjsData,
    };
  });

  const totalKaryawan = calculations.reduce((sum, c) => sum + c.totalEmployee, 0);
  const totalPerusahaan = calculations.reduce((sum, c) => sum + c.totalEmployer, 0);
  const totalSemua = calculations.reduce((sum, c) => sum + c.totalContribution, 0);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/karyawan" className="hover:text-emerald-600">Karyawan</Link>
            <ChevronRight className="size-4" />
            <span>BPJS Kesehatan</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">🏥 Kalkulator BPJS Kesehatan</h1>
          <p className="mt-1 text-slate-600">
            Hitung iuran BPJS Kesehatan dan Ketenagakerjaan karyawan per bulan
          </p>
        </div>
        <div className="flex gap-2">
          <ActionButton variant="secondary">
            <Download className="size-4" /> Export Laporan
          </ActionButton>
        </div>
      </div>

      {/* RINGKASAN */}
      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard
          title="Karyawan Tertanggung"
          value={String(calculations.length)}
          subtitle="Aktif di BPJS"
          icon={Users}
          tone="emerald"
        />
        <SummaryCard
          title="Total Iuran Saya"
          value={money(totalKaryawan)}
          subtitle="Potongan dari gaji"
          icon={HeartPulse}
          tone="blue"
        />
        <SummaryCard
          title="Total Iuran Perusahaan"
          value={money(totalPerusahaan)}
          subtitle="Ditanggung perusahaan"
          icon={HeartPulse}
          tone="purple"
        />
        <SummaryCard
          title="Total Semua"
          value={money(totalSemua)}
          subtitle="Iuran bulanan"
          icon={Calculator}
          tone="emerald"
        />
      </div>

      {/* INFO TARIF */}
      <Panel title="📊 Tarif BPJS 2024" description="Dasar hukum: PP No. 36 Tahun 2023">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg bg-blue-50 p-4">
            <h4 className="font-semibold text-blue-800">BPJS Kesehatan</h4>
            <div className="mt-2 space-y-1 text-sm text-blue-700">
              <p>• Karyawan: <strong>1%</strong> dari gaji</p>
              <p>• Perusahaan: <strong>4%</strong> dari gaji</p>
              <p>• Maksimal: <strong>Rp 120.000/bulan</strong></p>
            </div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-4">
            <h4 className="font-semibold text-emerald-800">JHT (Jaminan Hari Tua)</h4>
            <div className="mt-2 space-y-1 text-sm text-emerald-700">
              <p>• Karyawan: <strong>3.7%</strong> dari gaji</p>
              <p>• Perusahaan: <strong>3.7%</strong> dari gaji</p>
              <p>• Maksimal: <strong>Rp 1.466.800/bulan</strong></p>
            </div>
          </div>
          <div className="rounded-lg bg-purple-50 p-4">
            <h4 className="font-semibold text-purple-800">JPN (Jaminan Pensiun)</h4>
            <div className="mt-2 space-y-1 text-sm text-purple-700">
              <p>• Karyawan: <strong>2%</strong> dari gaji</p>
              <p>• Perusahaan: <strong>2%</strong> dari gaji</p>
              <p>• Maksimal: <strong>Rp 1.466.800/bulan</strong></p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            JKK dan JKM hanya ditanggung perusahaan. JKK: 0.54% (risiko rendah) - 1.10% (risiko tinggi),
            JKM: 0.30%.
          </p>
        </div>
      </Panel>

      {/* TABEL PERHITUNGAN */}
      <Panel
        title="Perhitungan BPJS Bulan Ini"
        description={`Periode: ${selectedPeriod}`}
        action={
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={showDetail}
              onChange={() => setShowDetail(!showDetail)}
              className="size-4 rounded border-slate-300 text-emerald-600"
            />
            Tampilkan Detail
          </label>
        }
      >
        {calculations.length > 0 ? (
          showDetail ? (
            <CalculationTable calculations={calculations} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {calculations.map((calc) => (
                <div key={calc.employeeId} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                      {calc.employeeName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-slate-950">{calc.employeeName}</p>
                      <p className="text-xs text-slate-500">Gaji: {money(calc.grossSalary)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded bg-blue-50 p-2 text-center">
                      <p className="text-xs text-blue-600">Iuran Saya</p>
                      <p className="font-semibold text-blue-700">{money(calc.totalEmployee)}</p>
                    </div>
                    <div className="rounded bg-purple-50 p-2 text-center">
                      <p className="text-xs text-purple-600">Iuran Perusahaan</p>
                      <p className="font-semibold text-purple-700">{money(calc.totalEmployer)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <EmptyState
            title="Belum ada karyawan aktif"
            description="Tambahkan karyawan terlebih dahulu di menu Data Karyawan"
          />
        )}
      </Panel>

      {/* RINGKASAN BREAKDOWN */}
      <Panel title="📋 Ringkasan per Program" description="Total iuran per jenis BPJS">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-500">BPJS Kesehatan</p>
            <p className="mt-1 text-lg font-bold text-blue-700">
              {money(calculations.reduce((sum, c) => sum + c.kesehatanEmployee + c.kesehatanEmployer, 0))}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {money(calculations.reduce((sum, c) => sum + c.kesehatanEmployee, 0))} (saya) +
              {money(calculations.reduce((sum, c) => sum + c.kesehatanEmployer, 0))} (perusahaan)
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-500">JHT</p>
            <p className="mt-1 text-lg font-bold text-emerald-700">
              {money(calculations.reduce((sum, c) => sum + c.jhtEmployee + c.jhtEmployer, 0))}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {money(calculations.reduce((sum, c) => sum + c.jhtEmployee, 0))} (saya) +
              {money(calculations.reduce((sum, c) => sum + c.jhtEmployer, 0))} (perusahaan)
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-500">JPN</p>
            <p className="mt-1 text-lg font-bold text-purple-700">
              {money(calculations.reduce((sum, c) => sum + c.jpnEmployee + c.jpnEmployer, 0))}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {money(calculations.reduce((sum, c) => sum + c.jpnEmployee, 0))} (saya) +
              {money(calculations.reduce((sum, c) => sum + c.jpnEmployer, 0))} (perusahaan)
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-500">JKK</p>
            <p className="mt-1 text-lg font-bold text-amber-700">
              {money(calculations.reduce((sum, c) => sum + c.jkk, 0))}
            </p>
            <p className="mt-1 text-xs text-slate-500">Hanya perusahaan</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-500">JKM</p>
            <p className="mt-1 text-lg font-bold text-red-700">
              {money(calculations.reduce((sum, c) => sum + c.jkm, 0))}
            </p>
            <p className="mt-1 text-xs text-slate-500">Hanya perusahaan</p>
          </div>
        </div>
      </Panel>

      {/* AKSI */}
      <div className="flex justify-end gap-3">
        <ActionButton variant="secondary">
          Simpan sebagai Draft
        </ActionButton>
        <ActionButton>
          <Check className="size-4" /> Simpan & Catat Jurnal
        </ActionButton>
      </div>
    </div>
  );
}