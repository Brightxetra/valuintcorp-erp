import { buildDashboardMetrics } from "@/lib/reports/reports";
import type { Business, ChartOfAccount, JournalEntry, ReportPeriod, TaxProfile } from "@/lib/domain/types";

export interface CoretaxPackage {
  businessName: string;
  taxId?: string;
  period: string;
  estimatedFinalTax: number;
  submissionMode: "manual_coretax";
  checklist: { label: string; done: boolean }[];
  exportFiles: string[];
}

export function prepareCoretaxPackage(params: {
  business: Business;
  taxProfile: TaxProfile;
  entries: JournalEntry[];
  accounts: ChartOfAccount[];
  period: ReportPeriod;
}): CoretaxPackage {
  const metrics = buildDashboardMetrics(params.entries, params.period, params.accounts);
  const estimatedFinalTax = params.taxProfile.usesFinalUmkmRate
    ? Math.round(metrics.revenue * params.taxProfile.finalUmkmRate)
    : 0;

  return {
    businessName: params.business.displayName,
    taxId: params.business.taxId,
    period: params.period.label,
    estimatedFinalTax,
    submissionMode: "manual_coretax",
    checklist: [
      { label: "Akun Coretax aktif", done: params.taxProfile.coretaxStatus !== "not_started" },
      { label: "Sertifikat elektronik / kode otorisasi aktif", done: params.taxProfile.coretaxStatus === "certificate_ready" },
      { label: "Laporan laba rugi dan posisi keuangan terkunci", done: params.period.locked },
      { label: "Export XLSX/PDF disiapkan untuk review", done: true },
      { label: "Submit tetap dilakukan di Coretax atau melalui partner resmi", done: false },
    ],
    exportFiles: [
      "laporan-keuangan.xlsx",
      "laporan-keuangan.pdf",
      "ringkasan-pajak-coretax.json",
    ],
  };
}
