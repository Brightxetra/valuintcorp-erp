"use client";

import { useEffect, useState } from "react";
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
import type { BpjsPolicy, ErpWorkspace } from "@/lib/erp/types";
import type { Employee, PayrollComponent } from "@/lib/domain/types";
import { money } from "@/lib/format";
import { defaultBpjsPolicyForBusiness } from "@/lib/hr/bpjs";
import { calculateEmployeePayroll } from "@/lib/hr/payroll";
import { notify } from "@/lib/notify";
import { downloadCsvFile } from "@/lib/exports/csv";

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
  preview: PayrollPreview;
  onRemove: () => void;
}

type PayrollPreview = {
  employee: Employee;
  components: PayrollComponent[];
  grossPay: number;
  deductions: number;
  taxWithheld: number;
  bpjsEmployee: number;
  bpjsEmployer: number;
  netPay: number;
};

function periodEndDate(period: string) {
  const [year, month] = period.split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(day).padStart(2, "0")}`;
}

function payrollPreview(employee: Employee, policy: BpjsPolicy): PayrollPreview {
  const calculation = calculateEmployeePayroll(employee, policy);
  return {
    employee,
    components: calculation.components,
    grossPay: calculation.grossPay,
    deductions: calculation.deductions,
    taxWithheld: calculation.taxWithheld,
    bpjsEmployee: calculation.bpjs.totalEmployee,
    bpjsEmployer: calculation.bpjs.totalEmployer,
    netPay: calculation.netPay,
  };
}

function EmployeePayrollDetail({
  preview,
  onRemove,
}: EmployeePayrollDetailProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
            {preview.employee.name.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-slate-950">{preview.employee.name}</p>
            <p className="text-sm text-slate-500">{preview.employee.role}</p>
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
              <span className="text-slate-600">Gaji pokok</span>
              <span className="font-medium">{money(preview.employee.baseSalary)}</span>
            </div>
            {preview.components.filter((component) => component.type === "earning" && component.name !== "Gaji pokok").map((component) => <div className="flex justify-between text-sm" key={component.id ?? component.name}><span className="text-slate-600">{component.name}</span><span className="font-medium">{money(component.amount)}</span></div>)}
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-950">
              <span>Total Pendapatan</span>
              <span className="text-emerald-700">{money(preview.grossPay)}</span>
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
              <span className="text-slate-600">Komponen potongan</span>
              <span className="font-medium text-red-600">-{money(preview.deductions - preview.bpjsEmployee)}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">BPJS karyawan</span><span className="font-medium text-red-600">-{money(preview.bpjsEmployee)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">PPh 21</span><span className="font-medium text-red-600">-{money(preview.taxWithheld)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-950">
              <span>Total Potongan</span>
              <span className="text-red-600">-{money(preview.deductions + preview.taxWithheld)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* GAJI BERSIH */}
      <div className="mt-4 rounded-lg bg-emerald-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-emerald-800">GAJI BERSIH</span>
          <span className="text-2xl font-bold text-emerald-700">
            {money(preview.netPay)}
          </span>
        </div>
      </div>

      {/* IURAN BPJS PERUSAHAAN */}
      <div className="mt-4 rounded-lg bg-blue-50 p-3">
        <p className="text-sm font-medium text-blue-800">
          Iuran BPJS yang ditanggung perusahaan: {money(preview.bpjsEmployer)}/bulan
        </p>
      </div>
    </div>
  );
}

// ============================================
// WORKSPACE UTAMA
// ============================================
export function GajiWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, request, setWorkspace } = useErpWorkspace(initialWorkspace);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(initialWorkspace.period.startDate.slice(0, 7));
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [posting, setPosting] = useState(false);
  const [policy, setPolicy] = useState<BpjsPolicy>();
  const [policyError, setPolicyError] = useState("");

  useEffect(() => {
    let active = true;
    void request<{ policy: BpjsPolicy }>("/api/erp/bpjs-policy")
      .then((body) => { if (active) setPolicy(body.policy); })
      .catch(() => { if (active) setPolicyError(workspace.business.id); });
    return () => { active = false; };
  }, [request, workspace.business.id]);

  const activeEmployees = workspace.employees.filter((employee) =>
    employee.status !== "inactive" && employee.contractType !== "daily",
  );
  const currentPolicy = policy?.businessId === workspace.business.id ? policy : workspace.bpjsPolicy;
  const postedRuns = workspace.payrollRuns.filter((run) => run.period === selectedPeriod);

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
  const selected = activeEmployees.filter((employee) => selectedEmployees.includes(employee.id));
  const previewErrors: string[] = [];
  const previews = selected.flatMap((employee) => {
    try {
      return [payrollPreview(employee, currentPolicy ?? defaultBpjsPolicyForBusiness(workspace.business.id))];
    } catch (error) {
      previewErrors.push(`${employee.name} · ${error instanceof Error ? error.message : "Gaji gagal dihitung."}`);
      return [];
    }
  });
  const canPost = Boolean(currentPolicy && selectedPeriod && previews.length && previewErrors.length === 0 && previews.length <= 100);
  const totalGajiKotor = previews.reduce((sum, preview) => sum + preview.grossPay, 0);
  const totalPotongan = previews.reduce((sum, preview) => sum + preview.deductions + preview.taxWithheld, 0);
  const totalGajiBersih = previews.reduce((sum, preview) => sum + preview.netPay, 0);

  async function postSelectedPayroll() {
    if (!canPost) return;
    setPosting(true);
    try {
      const body = await request<{ workspace: ErpWorkspace }>("/api/erp/payroll-runs", {
        method: "POST",
        body: JSON.stringify({
          employeeIds: previews.map((preview) => preview.employee.id),
          date: periodEndDate(selectedPeriod),
        }),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSelectedEmployees([]);
      notify.success("Payroll berhasil diposting", { description: `${previews.length} karyawan diproses.` });
    } catch (caught) {
      notify.error("Payroll gagal diposting", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setPosting(false);
    }
  }

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
          <ActionButton variant="secondary" disabled={!postedRuns.length} onClick={() => downloadCsvFile(
            `gaji-${selectedPeriod}.csv`,
            ["Periode", "Karyawan", "Gaji bruto", "Potongan", "PPh", "Gaji bersih"],
            postedRuns.map((run) => [run.period, workspace.employees.find((employee) => employee.id === run.employeeId)?.name ?? "Karyawan", run.grossPay, run.deductions, run.taxWithheld, run.netPay]),
          )}>
            <Download className="size-4" /> Ekspor Gaji CSV
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
          subtitle="Setelah komponen, BPJS, dan PPh 21"
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
            <input aria-label="Periode gaji"
              type="month"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
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
                const preview = previews.find((item) => item.employee.id === id);
                if (!preview) return null;

                return (
                  <EmployeePayrollDetail
                    key={id}
                    preview={preview}
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
                  <p className="text-sm text-slate-600">Total potongan komponen, BPJS, dan PPh 21</p>
                  <p className="text-xl font-bold text-red-600">-{money(totalPotongan)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-sm text-slate-600">Total Gaji Bersih (Estimasi)</p>
                  <p className="text-2xl font-bold text-emerald-700">{money(totalGajiBersih)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-3">
            <ActionButton disabled={posting || !canPost} onClick={() => void postSelectedPayroll()}>
              <Check className="size-4" /> {posting ? "Memproses..." : "Catat Pembayaran Gaji"}
            </ActionButton>
          </div>
          {policyError === workspace.business.id && !currentPolicy && <p role="alert">Tarif BPJS gagal dimuat. Muat ulang halaman untuk melanjutkan.</p>}
          {previewErrors.map((error) => <p className="text-sm text-red-700" key={error} role="alert">{error}</p>)}
          {previews.length > 100 && <p role="alert">Pilih maksimal 100 karyawan per proses.</p>}
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
              <li>• Gaji pokok dan komponen pendapatan membentuk gaji kotor</li>
              <li>• Potongan mencakup komponen karyawan, BPJS, dan nominal PPh 21 pada Data Karyawan</li>
              <li>• Gaji Bersih = Total Gaji Kotor - Total Potongan</li>
              <li>• Iuran BPJS perusahaan dihitung terpisah sesuai policy bisnis</li>
              <li>• Setelah disimpan, otomatis membuat jurnal di akun keuangan</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
