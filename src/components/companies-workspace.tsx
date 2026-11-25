"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Download, Plus } from "lucide-react";
import { useErpWorkspace } from "@/components/erp-context";
import { MobileDialog } from "@/components/mobile-dialog";
import { ActionButton, PageHeader, SelectField, StatusPill, TextField } from "@/components/ui";
import { loadBusinessOptions, syncServerSession, type BusinessOption } from "@/lib/erp/client-api";
import { canonicalIndustryLabel, canonicalIndustryTemplateId } from "@/lib/erp/industry-templates";
import { downloadCsvFile } from "@/lib/exports/csv";
import { money } from "@/lib/format";

type CompanyReport = {
  startDate: string;
  endDate: string;
  companies: Array<{
    id: string;
    name: string;
    revenue: number;
    expenses: number;
    assets: number;
    liabilities: number;
    equity: number;
  }>;
};

function CompanyReportSection({ businesses }: { businesses: BusinessOption[] }) {
  const { workspace, request } = useErpWorkspace();
  const [report, setReport] = useState<CompanyReport>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function loadReport(formData: FormData) {
    setPending(true);
    setError("");
    setReport(undefined);
    try {
      setReport(await request<CompanyReport>("/api/erp/company-report", {
        method: "POST",
        body: JSON.stringify({
          companyIds: formData.getAll("companyIds"),
          startDate: formData.get("startDate"),
          endDate: formData.get("endDate"),
        }),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ringkasan gagal dimuat.");
    } finally {
      setPending(false);
    }
  }

  const columns = ["Perusahaan", "Pendapatan", "Beban", "Laba bersih", "Aset", "Liabilitas", "Ekuitas"];
  const rows = report?.companies.map((company) => ({
    id: company.id,
    name: company.name,
    amounts: [company.revenue, company.expenses, company.revenue - company.expenses, company.assets, company.liabilities, company.equity],
  })) ?? [];
  const totals = columns.slice(1).map((_, index) => rows.reduce((sum, row) => sum + row.amounts[index], 0));

  return (
    <section className="space-y-4 border-t border-slate-200 pt-5">
      <h2 className="text-lg font-semibold">Ringkasan gabungan sebelum eliminasi</h2>
      <form action={loadReport} className="grid gap-4 sm:grid-cols-2">
        <TextField name="startDate" label="Tanggal awal" type="date" defaultValue={workspace.period.startDate} required />
        <TextField name="endDate" label="Tanggal akhir" type="date" defaultValue={workspace.period.endDate} required />
        <fieldset className="sm:col-span-2" disabled={pending}>
          <legend className="text-sm font-semibold">Perusahaan</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {businesses.map((company) => (
              <label key={company.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="companyIds" value={company.id} defaultChecked={company.id === workspace.business.id} />
                {company.displayName}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2"><ActionButton disabled={pending}>{pending ? "Memuat..." : "Tampilkan ringkasan"}</ActionButton></div>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {report && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">{report.startDate} sampai {report.endDate} · IDR</p>
            <ActionButton type="button" variant="secondary" onClick={() => downloadCsvFile(
              `ringkasan-perusahaan-${report.startDate}-${report.endDate}.csv`, columns,
              [...rows.map((row) => [row.name, ...row.amounts]), ["Total gabungan", ...totals]],
            )}><Download className="size-4" /> Ekspor CSV</ActionButton>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-slate-50"><tr>{columns.map((column, index) => <th key={column} scope="col" className={`px-3 py-2 ${index ? "text-right" : "text-left"}`}>{column}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => <tr key={row.id}><th scope="row" className="px-3 py-2 text-left font-medium">{row.name}</th>{row.amounts.map((amount, index) => <td key={columns[index + 1]} className="px-3 py-2 text-right tabular-nums">{money(amount)}</td>)}</tr>)}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
                <tr><th scope="row" className="px-3 py-2 text-left">Total gabungan</th>{totals.map((amount, index) => <td key={columns[index + 1]} className="px-3 py-2 text-right tabular-nums">{money(amount)}</td>)}</tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function CompaniesWorkspace() {
  const { workspace, request, demoMode } = useErpWorkspace();
  const router = useRouter();
  const [businesses, setBusinesses] = useState<BusinessOption[]>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const canCreate = !demoMode && (workspace.user.role === "owner" || workspace.user.role === "system_admin");
  const canReport = canonicalIndustryTemplateId(workspace.business.industry) === "general"
    && workspace.permissions.includes("reports:export") && workspace.permissions.includes("accounting:read");

  useEffect(() => {
    let active = true;
    void loadBusinessOptions()
      .then(({ businesses }) => { if (active) setBusinesses(businesses); })
      .catch(() => { if (active) setError("Daftar perusahaan gagal dimuat."); });
    return () => { active = false; };
  }, []);

  async function switchCompany(businessId: string) {
    const session = await syncServerSession(businessId);
    if (session?.defaultBusinessId !== businessId) {
      throw new Error("Perusahaan gagal diaktifkan.");
    }
    if (session.defaultPath) router.replace(session.defaultPath);
    router.refresh();
  }

  async function openCompany(businessId: string) {
    setPending(true);
    setError("");
    try {
      await switchCompany(businessId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Perusahaan gagal diaktifkan.");
      setPending(false);
    }
  }

  async function createCompany(formData: FormData) {
    setPending(true);
    setError("");
    try {
      const { businessId } = await request<{ businessId: string }>("/api/erp/businesses", {
        method: "POST",
        businessId: null,
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      setEditorOpen(false);
      await switchCompany(businessId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Perusahaan gagal dibuat.");
      setPending(false);
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader title="Perusahaan Saya" description={workspace.business.displayName} action={canCreate && (
        <ActionButton type="button" disabled={pending} onClick={() => { setError(""); setEditorOpen(true); }}>
          <Plus className="size-4" /> Tambah perusahaan
        </ActionButton>
      )} />
      {!editorOpen && error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!businesses && !error && <p role="status" className="text-sm text-slate-500">Memuat perusahaan…</p>}
      {businesses && !businesses.length && <p className="text-sm text-slate-500">Belum ada perusahaan yang dapat diakses.</p>}
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {businesses?.map((business) => (
          <li className="flex flex-wrap items-center gap-3 p-4" key={business.id}>
            <Building2 className="size-5 shrink-0 text-slate-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold">{business.displayName}</p>
              <p className="break-words text-sm text-slate-500">{business.legalName} · {canonicalIndustryLabel(business.industry)} · {business.role}</p>
            </div>
            {business.id === workspace.business.id ? <StatusPill tone="emerald">Aktif</StatusPill> : (
              <ActionButton variant="secondary" type="button" disabled={pending} onClick={() => void openCompany(business.id)}>
                Buka <ArrowRight className="size-4" />
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
      {canReport && businesses && businesses.length >= 2 && <CompanyReportSection businesses={businesses} />}
      <MobileDialog isOpen={editorOpen} title="Tambah perusahaan" onClose={() => { if (!pending) setEditorOpen(false); }}>
        <form className="grid gap-4" action={createCompany}>
          <TextField name="displayName" label="Nama tampilan" required minLength={2} />
          <TextField name="legalName" label="Nama legal" required minLength={2} />
          <TextField name="ownerName" label="Nama pemilik" required minLength={2} defaultValue={workspace.user.name} />
          <TextField name="taxId" label="NPWP" />
          <SelectField name="industry" label="Template" defaultValue="general">
            <option value="general">General</option>
            <option value="umkm">UMKM</option>
          </SelectField>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <ActionButton disabled={pending}>{pending ? "Menyimpan…" : "Buat perusahaan"}</ActionButton>
        </form>
      </MobileDialog>
    </section>
  );
}
