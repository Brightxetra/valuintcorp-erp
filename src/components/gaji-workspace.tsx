"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calculator,
  ChevronRight,
  Check,
  Users,
  Download,
  Calendar,
  AlertCircle,
} from "lucide-react";
import {
  ActionButton,
  Panel,
  EmptyState,
} from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";
import { money } from "@/lib/format";

// ============================================
// KOMPONEN KARTU RINGKASAN GAJI
// ============================================
interface PayrollSummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  tone?: "emerald" | "amber" | "red" | "blue" | "purple";
}

function PayrollSummaryCard({ title, value, subtitle, icon: Icon, tone = "emerald" }: PayrollSummaryCardProps) {
  const toneClasses = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
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
// KOMPONEN DETAIL GAJI KARYAWAN
// ============================================
interface EmployeePayrollDetailProps {
  employeeName: string;
  employeeRole: string;
  baseSalary: number;
  onRemove: () => void;
}

function EmployeePayrollDetail({
  employeeName,
  employeeRole,
  baseSalary,
  onRemove,
}: EmployeePayrollDetailProps) {
  // Simulasi perhitungan
  const tunjanganTransport = 300_000;
  const tunjanganMakan = 200_000;
  const totalGaji = baseSalary + tunjanganTransport + tunjanganMakan;
  const bpjsKaryawan = Math.min(totalGaji * 0.01, 120_000);
  const bpjsPerusahaan = Math.min(totalGaji * 0.04, 120_000);
  const jhtKaryawan = Math.min(totalGaji * 0.037, 1_466_800);
  const jhtPerusahaan = Math.min(totalGaji * 0.037, 1_466_800);
  const pph21 = Math.max(totalGaji * 0.05 - 500_000, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
            {employeeName.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-slate-950">{employeeName}</p>
            <p className="text-sm text-slate-500">{employeeRole}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-sm text-red-600 hover:underline"
        >
          Hapus
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* PENDAPATAN */}
        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            💰 Pendapatan
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Gaji Pokok</span>
              <span className="font-medium">{money(baseSalary)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Tunjangan Transport</span>
              <span className="font-medium">{money(tunjanganTransport)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Tunjangan Makan</span>
              <span className="font-medium">{money(tunjanganMakan)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-950">
              <span>Total Pendapatan</span>
              <span className="text-emerald-700">{money(totalGaji)}</span>
            </div>
          </div>
        </div>

        {/* POTONGAN */}
        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            ➖ Potongan
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">BPJS Kesehatan (1%)</span>
              <span className="font-medium text-red-600">-{money(bpjsKaryawan)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">JHT Karyawan (3.7%)</span>
              <span className="font-medium text-red-600">-{money(jhtKaryawan)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">PPh 21 (5%)</span>
              <span className="font-medium text-red-600">-{money(pph21)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-950">
              <span>Total Potongan</span>
              <span className="text-red-600">-{money(bpjsKaryawan + jhtKaryawan + pph21)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* GAJI BERSIH */}
      <div className="mt-4 rounded-lg bg-emerald-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-emerald-800">GAJI BERSIH</span>
          <span className="text-2xl font-bold text-emerald-700">
            {money(totalGaji - bpjsKaryawan - jhtKaryawan - pph21)}
          </span>
        </div>
      </div>

      {/* IURAN BPJS PERUSAHAAN */}
      <div className="mt-4 rounded-lg bg-blue-50 p-3">
        <p className="text-sm font-medium text-blue-800">
          ℹ️ Iuran BPJS yang ditanggung perusahaan: {money(bpjsPerusahaan + jhtPerusahaan)}/bulan
        </p>
      </div>
    </div>
  );
}

// ============================================
// WORKSPACE UTAMA
// ============================================
export function GajiWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace } = useErpWorkspace(initialWorkspace);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("Juni 2026");
  const [showBreakdown, setShowBreakdown] = useState(false);

  const activeEmployees = workspace.employees.filter((e) => e.status === "active");

  function toggleEmployee(id: string) {
    setSelectedEmployees((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelectedEmployees(activeEmployees.map((e) => e.id));
  }

  function deselectAll() {
    setSelectedEmployees([]);
  }

  // Hitung total
  const totalGajiKotor = selectedEmployees.reduce((sum, id) => {
    const emp = workspace.employees.find((e) => e.id === id);
    return sum + (emp?.baseSalary ?? 0) * 1.1; // +10% tunjangan
  }, 0);

  const totalBpjsKaryawan = totalGajiKotor * 0.047; // 1% kesehatan + 3.7% JHT
  const totalGajiBersih = totalGajiKotor - totalBpjsKaryawan * 0.6; // estimasi

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/karyawan" className="hover:text-emerald-600">Karyawan</Link>
            <ChevronRight className="size-4" />
            <span>Hitung Gaji</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">💰 Hitung Gaji Karyawan</h1>
          <p className="mt-1 text-slate-600">Hitung dan catat gaji bulanan karyawan beserta BPJS</p>
        </div>
        <div className="flex gap-2">
          <ActionButton variant="secondary">
            <Download className="size-4" /> Export Slip
          </ActionButton>
          <ActionButton>
            <Calculator className="size-4" /> Hitung Gaji
          </ActionButton>
        </div>
      </div>

      {/* RINGKASAN */}
      <div className="grid gap-4 sm:grid-cols-4">
        <PayrollSummaryCard
          title="Total Gaji Pokok"
          value={money(workspace.employees.reduce((sum, e) => sum + e.baseSalary, 0))}
          subtitle="Semua karyawan aktif"
          icon={Users}
          tone="emerald"
        />
        <PayrollSummaryCard
          title="Karyawan Aktif"
          value={String(activeEmployees.length)}
          subtitle="Akan dihitung bulan ini"
          icon={Check}
          tone="blue"
        />
        <PayrollSummaryCard
          title="Total Gaji Kotor"
          value={money(totalGajiKotor)}
          subtitle="Sebelum potongan"
          icon={Calculator}
          tone="purple"
        />
        <PayrollSummaryCard
          title="Estimasi Gaji Bersih"
          value={money(totalGajiBersih)}
          subtitle="Setelah pajak & BPJS"
          icon={Check}
          tone="emerald"
        />
      </div>

      {/* LANGKAH 1: PILIH PERIODE & KARYAWAN */}
      <Panel
        title="Langkah 1: Pilih Periode & Karyawan"
        description="Pilih karyawan yang akan dihitung gajinya"
      >
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-slate-400" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="Mei 2026">Mei 2026</option>
              <option value="Juni 2026">Juni 2026</option>
              <option value="Juli 2026">Juli 2026</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Pilih Semua ({activeEmployees.length})
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Hapus Semua
            </button>
          </div>
        </div>

        {activeEmployees.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeEmployees.map((employee) => {
              const isSelected = selectedEmployees.includes(employee.id);
              return (
                <label
                  key={employee.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleEmployee(employee.id)}
                    className="size-4 rounded border-slate-300 text-emerald-600"
                  />
                  <div className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {employee.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-950">{employee.name}</p>
                    <p className="text-xs text-slate-500">{employee.role}</p>
                  </div>
                  <p className="text-sm font-medium text-slate-600">
                    {money(employee.baseSalary)}
                  </p>
                </label>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Belum ada karyawan aktif"
            description="Tambahkan karyawan terlebih dahulu di menu Data Karyawan"
          />
        )}
      </Panel>

      {/* LANGKAH 2: RINCIAN GAJI */}
      {selectedEmployees.length > 0 && (
        <Panel
          title="Langkah 2: Rincian Gaji"
          description={`Gaji untuk ${selectedEmployees.length} karyawan`}
          action={
            <button
              type="button"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              {showBreakdown ? "Sembunyikan" : "Tampilkan"} Detail
            </button>
          }
        >
          {showBreakdown ? (
            <div className="space-y-4">
              {selectedEmployees.map((id) => {
                const employee = workspace.employees.find((e) => e.id === id);
                if (!employee) return null;

                return (
                  <EmployeePayrollDetail
                    key={id}
                    employeeName={employee.name}
                    employeeRole={employee.role}
                    baseSalary={employee.baseSalary}
                    onRemove={() => toggleEmployee(id)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-600">Total Gaji Kotor</p>
                  <p className="text-xl font-bold text-slate-950">{money(totalGajiKotor)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Total Potongan (BPJS + PPh)</p>
                  <p className="text-xl font-bold text-red-600">-{money(totalBpjsKaryawan)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-sm text-slate-600">Total Gaji Bersih (Estimasi)</p>
                  <p className="text-2xl font-bold text-emerald-700">{money(totalGajiBersih)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-3">
            <ActionButton variant="secondary">
              Simpan sebagai Draft
            </ActionButton>
            <ActionButton>
              <Check className="size-4" /> Simpan & Catat Jurnal
            </ActionButton>
          </div>
        </Panel>
      )}

      {/* RIWAYAT GAJI */}
      <Panel
        title="Riwayat Gaji"
        description="Daftar proses gaji yang sudah disimpan"
      >
        {workspace.payrollRuns.length > 0 ? (
          <div className="space-y-2">
            {workspace.payrollRuns.slice(0, 5).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
              >
                <div>
                  <p className="font-medium text-slate-950">Gaji {run.period}</p>
                  <p className="text-sm text-slate-500">
                    Total periode ini
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-emerald-700">{money(run.netPay)}</p>
                  <p className="text-xs text-slate-500">{run.period}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Belum ada riwayat gaji"
            description="Gaji yang sudah dihitung akan muncul di sini"
          />
        )}
      </Panel>

      {/* INFO */}
      <div className="rounded-lg bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-blue-600" />
          <div>
            <p className="font-medium text-blue-800">Cara Kerja Perhitungan Gaji</p>
            <ul className="mt-2 space-y-1 text-sm text-blue-700">
              <li>• Gaji pokok + tunjangan transport & makan = Total Gaji Kotor</li>
              <li>• Potongan: BPJS Kesehatan (1% karyawan), JHT (3.7% karyawan), PPh 21</li>
              <li>• Gaji Bersih = Total Gaji Kotor - Total Potongan</li>
              <li>• Iuran BPJS perusahaan (4% kesehatan + 3.7% JHT) dihitung terpisah</li>
              <li>• Setelah disimpan, otomatis membuat jurnal di akun keuangan</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
