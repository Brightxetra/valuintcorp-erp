"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Calculator, Check, ChevronRight, Download, HeartPulse, Save, Settings, Users } from "lucide-react";
import { ActionButton, EmptyState, Panel, TextField } from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import type { BpjsPolicy, ErpWorkspace } from "@/lib/erp/types";
import { money } from "@/lib/format";
import { calculateBpjsContribution, defaultBpjsPolicyForBusiness, percentToRate, rateToPercent, type BpjsCalculation as BaseBpjsCalculation } from "@/lib/hr/bpjs";
import { notify } from "@/lib/notify";

interface BPJSCalculation extends BaseBpjsCalculation {
  employeeId: string;
  employeeName: string;
}

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
  }[tone];

  return (
    <div className={`rounded-lg border p-4 ${toneClasses}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="mt-1 text-xl font-bold">{value}</p>
          {subtitle ? <p className="mt-1 text-xs opacity-60">{subtitle}</p> : null}
        </div>
        <Icon className="size-6 opacity-50" aria-hidden />
      </div>
    </div>
  );
}

function RateField({ label, value, onChange }: { label: string; value: number; onChange: (rate: number) => void }) {
  return (
    <TextField
      label={label}
      type="number"
      min="0"
      step="0.0001"
      value={String(rateToPercent(value))}
      onChange={(event) => onChange(percentToRate(Number(event.target.value || 0)))}
    />
  );
}

function PolicyForm({ policy, setPolicy, onSave, saving }: {
  policy: BpjsPolicy;
  setPolicy: React.Dispatch<React.SetStateAction<BpjsPolicy>>;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  function update<K extends keyof BpjsPolicy>(key: K, value: BpjsPolicy[K]) {
    setPolicy((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="Berlaku sejak" type="date" value={policy.effectiveDate} onChange={(e) => update("effectiveDate", e.target.value)} />
        <TextField label="Pengali gaji bruto" type="number" min="0" step="0.01" value={String(policy.grossSalaryMultiplier)} onChange={(e) => update("grossSalaryMultiplier", Number(e.target.value || 0))} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <RateField label="Kesehatan karyawan (%)" value={policy.healthEmployeeRate} onChange={(rate) => update("healthEmployeeRate", rate)} />
        <RateField label="Kesehatan perusahaan (%)" value={policy.healthEmployerRate} onChange={(rate) => update("healthEmployerRate", rate)} />
        <TextField label="Cap gaji Kesehatan" type="number" min="0" value={String(policy.healthSalaryCap)} onChange={(e) => update("healthSalaryCap", Number(e.target.value || 0))} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <RateField label="JHT karyawan (%)" value={policy.jhtEmployeeRate} onChange={(rate) => update("jhtEmployeeRate", rate)} />
        <RateField label="JHT perusahaan (%)" value={policy.jhtEmployerRate} onChange={(rate) => update("jhtEmployerRate", rate)} />
        <TextField label="Cap gaji JHT" type="number" min="0" value={String(policy.jhtSalaryCap)} onChange={(e) => update("jhtSalaryCap", Number(e.target.value || 0))} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <RateField label="JPN karyawan (%)" value={policy.jpnEmployeeRate} onChange={(rate) => update("jpnEmployeeRate", rate)} />
        <RateField label="JPN perusahaan (%)" value={policy.jpnEmployerRate} onChange={(rate) => update("jpnEmployerRate", rate)} />
        <TextField label="Cap gaji JPN" type="number" min="0" value={String(policy.jpnSalaryCap)} onChange={(e) => update("jpnSalaryCap", Number(e.target.value || 0))} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RateField label="JKK perusahaan (%)" value={policy.jkkEmployerRate} onChange={(rate) => update("jkkEmployerRate", rate)} />
        <RateField label="JKM perusahaan (%)" value={policy.jkmEmployerRate} onChange={(rate) => update("jkmEmployerRate", rate)} />
      </div>

      <div className="flex justify-end border-t border-slate-200 pt-4">
        <ActionButton type="submit" disabled={saving}>
          <Save className="size-4" /> {saving ? "Menyimpan..." : "Simpan konfigurasi"}
        </ActionButton>
      </div>
    </form>
  );
}

function CalculationTable({ calculations, policy }: { calculations: BPJSCalculation[]; policy: BpjsPolicy }) {
  const totalKaryawan = calculations.reduce((sum, c) => sum + c.totalEmployee, 0);
  const totalPerusahaan = calculations.reduce((sum, c) => sum + c.totalEmployer, 0);
  const totalSemua = calculations.reduce((sum, c) => sum + c.totalContribution, 0);

  return (
    <div className="overflow-x-auto" role="region" aria-label="Perhitungan BPJS. Geser horizontal untuk melihat seluruh kolom." tabIndex={0}>
      <p className="mb-2 text-xs text-slate-500 sm:hidden">Geser tabel untuk melihat seluruh komponen iuran.</p>
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-50 text-xs">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-500">Karyawan</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Gaji bruto</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Kesehatan<br/>({rateToPercent(policy.healthEmployeeRate)}% + {rateToPercent(policy.healthEmployerRate)}%)</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">JHT<br/>({rateToPercent(policy.jhtEmployeeRate)}% + {rateToPercent(policy.jhtEmployerRate)}%)</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">JPN<br/>({rateToPercent(policy.jpnEmployeeRate)}% + {rateToPercent(policy.jpnEmployerRate)}%)</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Iuran karyawan</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Iuran perusahaan</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-500">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {calculations.map((calc) => (
            <tr key={calc.employeeId} className="hover:bg-slate-50">
              <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{calc.employeeName.charAt(0)}</div><span className="font-medium">{calc.employeeName}</span></div></td>
              <td className="px-4 py-3 text-right font-mono">{money(calc.grossSalary)}</td>
              <td className="px-4 py-3 text-right text-xs text-slate-500"><div>{money(calc.kesehatanEmployee)}</div><div className="text-emerald-600">+{money(calc.kesehatanEmployer)}</div></td>
              <td className="px-4 py-3 text-right text-xs text-slate-500"><div>{money(calc.jhtEmployee)}</div><div className="text-emerald-600">+{money(calc.jhtEmployer)}</div></td>
              <td className="px-4 py-3 text-right text-xs text-slate-500"><div>{money(calc.jpnEmployee)}</div><div className="text-emerald-600">+{money(calc.jpnEmployer)}</div></td>
              <td className="px-4 py-3 text-right font-medium text-emerald-700">{money(calc.totalEmployee)}</td>
              <td className="px-4 py-3 text-right font-medium text-blue-700">{money(calc.totalEmployer)}</td>
              <td className="px-4 py-3 text-right font-bold text-slate-950">{money(calc.totalContribution)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
          <tr>
            <td className="px-4 py-3">TOTAL</td>
            <td className="px-4 py-3 text-right">{money(calculations.reduce((sum, c) => sum + c.grossSalary, 0))}</td>
            <td className="px-4 py-3 text-right">{money(calculations.reduce((sum, c) => sum + c.kesehatanEmployee + c.kesehatanEmployer, 0))}</td>
            <td className="px-4 py-3 text-right">{money(calculations.reduce((sum, c) => sum + c.jhtEmployee + c.jhtEmployer, 0))}</td>
            <td className="px-4 py-3 text-right">{money(calculations.reduce((sum, c) => sum + c.jpnEmployee + c.jpnEmployer, 0))}</td>
            <td className="px-4 py-3 text-right text-emerald-700">{money(totalKaryawan)}</td>
            <td className="px-4 py-3 text-right text-blue-700">{money(totalPerusahaan)}</td>
            <td className="px-4 py-3 text-right text-slate-950">{money(totalSemua)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function BPJSWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, request } = useErpWorkspace(initialWorkspace);
  const selectedPeriod = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date());
  const [showDetail, setShowDetail] = useState(true);
  const [showPolicy, setShowPolicy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [policy, setPolicy] = useState<BpjsPolicy>(() => workspace.bpjsPolicy ?? defaultBpjsPolicyForBusiness(workspace.business.id));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await request<{ policy: BpjsPolicy; migrationRequired?: boolean }>("/api/erp/bpjs-policy");
        if (cancelled) return;
        setPolicy(body.policy);
        if (body.migrationRequired) {
          notify.warning("Konfigurasi BPJS memakai default", { description: "Jalankan migration 022 agar bisa disimpan permanen." });
        }
      } catch (caught) {
        notify.error("Konfigurasi BPJS gagal dimuat", { description: caught instanceof Error ? caught.message : "Default sementara dipakai." });
      }
    })();
    return () => { cancelled = true; };
  }, [request]);

  async function savePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const body = await request<{ policy: BpjsPolicy }>("/api/erp/bpjs-policy", {
        method: "POST",
        body: JSON.stringify(policy),
      });
      setPolicy(body.policy);
      notify.success("Konfigurasi BPJS disimpan", { description: `Berlaku sejak ${body.policy.effectiveDate}` });
    } catch (caught) {
      notify.error("Konfigurasi BPJS gagal disimpan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  const activeEmployees = workspace.employees.filter((e) => e.status === "active");
  const calculations: BPJSCalculation[] = activeEmployees.map((emp) => ({
    employeeId: emp.id,
    employeeName: emp.name,
    ...calculateBpjsContribution(emp.baseSalary, policy),
  }));

  const totalKaryawan = calculations.reduce((sum, c) => sum + c.totalEmployee, 0);
  const totalPerusahaan = calculations.reduce((sum, c) => sum + c.totalEmployer, 0);
  const totalSemua = calculations.reduce((sum, c) => sum + c.totalContribution, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500"><Link href="/karyawan" className="hover:text-emerald-600">Karyawan</Link><ChevronRight className="size-4" /><span>BPJS</span></div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Kalkulator BPJS</h1>
          <p className="mt-1 text-slate-600">Hitung iuran berdasarkan konfigurasi tarif dan cap yang bisa diubah per bisnis.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="secondary"><Download className="size-4" /> Export Laporan</ActionButton>
          <ActionButton variant="secondary" onClick={() => setShowPolicy((value) => !value)}><Settings className="size-4" /> {showPolicy ? "Tutup konfigurasi" : "Konfigurasi tarif"}</ActionButton>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard title="Karyawan tertanggung" value={String(calculations.length)} subtitle="Status aktif" icon={Users} tone="emerald" />
        <SummaryCard title="Iuran karyawan" value={money(totalKaryawan)} subtitle="Potongan dari gaji" icon={HeartPulse} tone="blue" />
        <SummaryCard title="Iuran perusahaan" value={money(totalPerusahaan)} subtitle="Ditanggung perusahaan" icon={HeartPulse} tone="purple" />
        <SummaryCard title="Total semua" value={money(totalSemua)} subtitle="Iuran bulanan" icon={Calculator} tone="emerald" />
      </div>

      {showPolicy ? (
        <Panel title="Konfigurasi tarif BPJS" description="Angka ini disimpan per bisnis. Ubah ketika ada perubahan aturan atau kebijakan internal payroll.">
          <PolicyForm policy={policy} setPolicy={setPolicy} onSave={savePolicy} saving={saving} />
        </Panel>
      ) : null}

      <Panel title="Tarif aktif" description={`Berlaku sejak ${policy.effectiveDate}. Semua persentase tampil dalam format persen.`}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg bg-blue-50 p-4"><h4 className="font-semibold text-blue-800">BPJS Kesehatan</h4><div className="mt-2 space-y-1 text-sm text-blue-700"><p>Karyawan: <strong>{rateToPercent(policy.healthEmployeeRate)}%</strong></p><p>Perusahaan: <strong>{rateToPercent(policy.healthEmployerRate)}%</strong></p><p>Cap gaji: <strong>{money(policy.healthSalaryCap)}</strong></p></div></div>
          <div className="rounded-lg bg-emerald-50 p-4"><h4 className="font-semibold text-emerald-800">JHT</h4><div className="mt-2 space-y-1 text-sm text-emerald-700"><p>Karyawan: <strong>{rateToPercent(policy.jhtEmployeeRate)}%</strong></p><p>Perusahaan: <strong>{rateToPercent(policy.jhtEmployerRate)}%</strong></p><p>Cap gaji: <strong>{money(policy.jhtSalaryCap)}</strong></p></div></div>
          <div className="rounded-lg bg-purple-50 p-4"><h4 className="font-semibold text-purple-800">JPN/JKK/JKM</h4><div className="mt-2 space-y-1 text-sm text-purple-700"><p>JPN: <strong>{rateToPercent(policy.jpnEmployeeRate)}% + {rateToPercent(policy.jpnEmployerRate)}%</strong></p><p>JKK perusahaan: <strong>{rateToPercent(policy.jkkEmployerRate)}%</strong></p><p>JKM perusahaan: <strong>{rateToPercent(policy.jkmEmployerRate)}%</strong></p></div></div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /><p className="text-sm text-amber-800">Validasi regulasi tetap tanggung jawab operator. Sistem menyediakan konfigurasi agar perubahan aturan bisa langsung dicatat tanpa perubahan kode.</p></div>
      </Panel>

      <Panel title="Perhitungan BPJS bulan ini" description={`Periode: ${selectedPeriod}`} action={<label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600"><input type="checkbox" checked={showDetail} onChange={() => setShowDetail(!showDetail)} className="size-4 rounded border-slate-300 text-emerald-600" />Tampilkan Detail</label>}>
        {calculations.length > 0 ? (
          showDetail ? <CalculationTable calculations={calculations} policy={policy} /> : <div className="grid gap-4 sm:grid-cols-3">{calculations.map((calc) => <div key={calc.employeeId} className="rounded-lg border border-slate-200 p-4"><p className="font-medium text-slate-950">{calc.employeeName}</p><p className="text-xs text-slate-500">Gaji bruto: {money(calc.grossSalary)}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded bg-blue-50 p-2 text-center"><p className="text-xs text-blue-600">Karyawan</p><p className="font-semibold text-blue-700">{money(calc.totalEmployee)}</p></div><div className="rounded bg-purple-50 p-2 text-center"><p className="text-xs text-purple-600">Perusahaan</p><p className="font-semibold text-purple-700">{money(calc.totalEmployer)}</p></div></div></div>)}</div>
        ) : <EmptyState title="Belum ada karyawan aktif" description="Tambahkan karyawan terlebih dahulu di menu Data Karyawan." />}
      </Panel>

      <div className="flex justify-end gap-3">
        <ActionButton variant="secondary">Simpan sebagai Draft</ActionButton>
        <ActionButton><Check className="size-4" /> Simpan & Catat Jurnal</ActionButton>
      </div>
    </div>
  );
}
