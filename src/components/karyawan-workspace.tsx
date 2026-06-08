"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Briefcase,
  Building,
  CreditCard,
  HeartPulse,
  FileText,
  ChevronRight,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  AlertCircle,
} from "lucide-react";
import {
  ActionButton,
  Panel,
  StatusPill,
  DataTable,
  FilterBar,
  EmptyState,
  TextField,
  SelectField,
} from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";
import type { Employee } from "@/lib/domain/types";
import { getStatusLabel, getContractTypeLabel, getPtkpLabel } from "@/lib/translations";
import { money } from "@/lib/format";

type TabType = "data" | "gaji" | "bpjs" | "absensi" | "riwayat";

// ============================================
// KOMPONEN PROFIL KARYAWAN
// ============================================
interface EmployeeProfileProps {
  employee: Employee;
  workspace: ErpWorkspace;
  onClose: () => void;
}

export function EmployeeProfileModal({ employee, workspace, onClose }: EmployeeProfileProps) {
  const [activeTab, setActiveTab] = useState<TabType>("data");

  // Cari data tambahan
  const salaryPayable = workspace.journals.find(
    (j) => j.source === "payroll" && j.referenceId === employee.id
  );

  const tabs = [
    { id: "data" as TabType, label: "📋 Data Diri", count: 0 },
    { id: "gaji" as TabType, label: "💰 Gaji", count: 0 },
    { id: "bpjs" as TabType, label: "🏥 BPJS", count: 0 },
    { id: "absensi" as TabType, label: "📅 Absensi", count: 0 },
    { id: "riwayat" as TabType, label: "📄 Riwayat", count: 0 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700">
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-950">{employee.name}</h2>
              <p className="text-sm text-slate-500">
                {employee.employeeNo} - {employee.role}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {/* TABS */}
        <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-b-2 border-emerald-600 text-emerald-700"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: "calc(90vh - 180px)" }}>
          {activeTab === "data" && <DataDiriTab employee={employee} />}
          {activeTab === "gaji" && <GajiTab employee={employee} workspace={workspace} />}
          {activeTab === "bpjs" && <BPJSTab employee={employee} />}
          {activeTab === "absensi" && <AbsensiTab employee={employee} />}
          {activeTab === "riwayat" && <RiwayatTab employee={employee} />}
        </div>
      </div>
    </div>
  );
}

// TAB: DATA DIRI
function DataDiriTab({ employee }: { employee: Employee }) {
  return (
    <div className="space-y-6">
      {/* Info Utama */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Data Pribadi
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <User className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Nama Lengkap</p>
                <p className="font-medium">{employee.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Tanggal Lahir</p>
                <p className="font-medium">{employee.joinedAt ? "15 Maret 1990" : "-"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Nomor Telepon</p>
                <p className="font-medium">081234567890</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="font-medium">{employee.name.toLowerCase().replace(" ", ".")}@email.com</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Alamat</p>
                <p className="font-medium">Jl. Merdeka No. 10, Jakarta</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Data Pekerjaan
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Briefcase className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Jabatan</p>
                <p className="font-medium">{employee.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Building className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Departemen</p>
                <p className="font-medium">Penjualan</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Tanggal Masuk</p>
                <p className="font-medium">{new Date(employee.joinedAt).toLocaleDateString("id-ID")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FileText className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Jenis Kontrak</p>
                <p className="font-medium">{getContractTypeLabel(employee.contractType)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AlertCircle className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <StatusPill tone={employee.status === "active" ? "emerald" : employee.status === "inactive" ? "gray" : "amber"}>
                  {employee.status === "active" ? "Aktif" : employee.status === "inactive" ? "Non-aktif" : "Kontrak"}
                </StatusPill>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NPWP & Bank */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Data NPWP & Pajak
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500">Nomor NPWP</p>
              <p className="font-medium">12.345.678.9-012.000</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Status PTKP</p>
              <p className="font-medium">K/1 (Kawin, 1 tanggungan)</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Penghasilan Tidak Kena Pajak</p>
              <p className="font-medium">Rp 58.500.000 / tahun</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Data Bank
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500">Nama Bank</p>
              <p className="font-medium">Bank BCA</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Nomor Rekening</p>
              <p className="font-medium">1234567890</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Atas Nama</p>
              <p className="font-medium">{employee.name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <ActionButton variant="secondary">
          <Edit className="size-4" /> Ubah Data
        </ActionButton>
      </div>
    </div>
  );
}

// TAB: GAJI
function GajiTab({ employee, workspace }: { employee: Employee; workspace: ErpWorkspace }) {
  const payrollRuns = workspace.payrollRuns.filter(
    (run) => run.employeeId === employee.id
  );

  return (
    <div className="space-y-6">
      {/* Ringkasan Gaji */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Gaji Bulanan
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-emerald-50 p-4">
            <p className="text-xs text-emerald-600">Gaji Pokok</p>
            <p className="mt-1 text-xl font-bold text-emerald-700">{money(employee.baseSalary)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-xs text-blue-600">Tunjangan</p>
            <p className="mt-1 text-xl font-bold text-blue-700">{money(employee.baseSalary * 0.1)}</p>
          </div>
          <div className="rounded-lg bg-purple-50 p-4">
            <p className="text-xs text-purple-600">Total</p>
            <p className="mt-1 text-xl font-bold text-purple-700">{money(employee.baseSalary * 1.1)}</p>
          </div>
        </div>
      </div>

      {/* Riwayat Gaji */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Riwayat Gaji
        </h3>
        {payrollRuns.length > 0 ? (
          <div className="space-y-2">
            {payrollRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="font-medium">Gaji {run.period}</p>
                  <p className="text-sm text-slate-500">Periode pembayaran</p>
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
            description="Gaji akan muncul di sini setelah proses hitung gaji"
          />
        )}
      </div>
    </div>
  );
}

// TAB: BPJS
function BPJSTab({ employee }: { employee: Employee }) {
  // Contoh perhitungan BPJS 2024
  const totalGaji = employee.baseSalary * 1.1;
  const bpjsKesehatanEmployee = Math.min(totalGaji * 0.01, 120_000);
  const bpjsKesehatanEmployer = Math.min(totalGaji * 0.04, 120_000);
  const jhtEmployee = Math.min(totalGaji * 0.037, 1_466_800);
  const jhtEmployer = Math.min(totalGaji * 0.037, 1_466_800);
  const jpnEmployee = Math.min(totalGaji * 0.02, 1_466_800);
  const jpnEmployer = Math.min(totalGaji * 0.02, 1_466_800);

  return (
    <div className="space-y-6">
      {/* Info BPJS */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Nomor BPJS
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">BPJS Kesehatan</p>
            <p className="font-medium">0001234567890</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">BPJS Ketenagakerjaan</p>
            <p className="font-medium">0001234567890</p>
          </div>
        </div>
      </div>

      {/* Iuran Bulanan */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Iuran BPJS Bulanan (2024)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2 text-left font-medium text-slate-500">Program</th>
                <th className="py-2 text-right font-medium text-slate-500">Iuran Karyawan (1%)</th>
                <th className="py-2 text-right font-medium text-slate-500">Iuran Perusahaan (4%)</th>
                <th className="py-2 text-right font-medium text-slate-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2">BPJS Kesehatan</td>
                <td className="py-2 text-right">{money(bpjsKesehatanEmployee)}</td>
                <td className="py-2 text-right">{money(bpjsKesehatanEmployer)}</td>
                <td className="py-2 text-right font-medium">{money(bpjsKesehatanEmployee + bpjsKesehatanEmployer)}</td>
              </tr>
              <tr>
                <td className="py-2">JHT (Jaminan Hari Tua)</td>
                <td className="py-2 text-right">{money(jhtEmployee)}</td>
                <td className="py-2 text-right">{money(jhtEmployer)}</td>
                <td className="py-2 text-right font-medium">{money(jhtEmployee + jhtEmployer)}</td>
              </tr>
              <tr>
                <td className="py-2">JPN (Jaminan Pensiun)</td>
                <td className="py-2 text-right">{money(jpnEmployee)}</td>
                <td className="py-2 text-right">{money(jpnEmployer)}</td>
                <td className="py-2 text-right font-medium">{money(jpnEmployee + jpnEmployer)}</td>
              </tr>
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td className="py-2 font-medium">Total</td>
                <td className="py-2 text-right">{money(bpjsKesehatanEmployee + jhtEmployee + jpnEmployee)}</td>
                <td className="py-2 text-right">{money(bpjsKesehatanEmployer + jhtEmployer + jpnEmployer)}</td>
                <td className="py-2 text-right font-bold text-emerald-700">
                  {money(bpjsKesehatanEmployee + bpjsKesehatanEmployer + jhtEmployee + jhtEmployer + jpnEmployee + jpnEmployer)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          * Maksimal iuran BPJS Kesehatan Rp 120.000/bulan, JHT & JPN maksimal Rp 1.466.800/bulan
        </p>
      </div>

      {/* Catatan */}
      <div className="rounded-lg bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          <strong>Informasi:</strong> Iuran BPJS Kesehatan adalah 5% dari gaji (1% karyawan, 4% perusahaan).
          Iuran JHT dan JPN masing-masing 3.7% dan 2% dari gaji (dibagi rata karyawan-perusahaan).
        </p>
      </div>
    </div>
  );
}

// TAB: ABSENSI
function AbsensiTab({ employee }: { employee: Employee }) {
  // Contoh data absensi
  const bulanIni = [
    { tanggal: "2026-06-01", status: "hadir", jam: "08:00" },
    { tanggal: "2026-06-02", status: "hadir", jam: "08:15" },
    { tanggal: "2026-06-03", status: "hadir", jam: "07:55" },
    { tanggal: "2026-06-04", status: "sakit", jam: "-" },
    { tanggal: "2026-06-05", status: "izin", jam: "-" },
    { tanggal: "2026-06-06", status: "hadir", jam: "08:00" },
  ];

  const statusColors: Record<string, string> = {
    hadir: "emerald",
    sakit: "amber",
    izin: "cyan",
    alpha: "red",
  };

  const statusLabels: Record<string, string> = {
    hadir: "Hadir",
    sakit: "Sakit",
    izin: "Izin",
    alpha: "Alpha",
  };

  return (
    <div className="space-y-6">
      {/* Ringkasan */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-emerald-50 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">20</p>
          <p className="text-xs text-emerald-600">Hadir</p>
        </div>
        <div className="rounded-lg bg-amber-50 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">1</p>
          <p className="text-xs text-amber-600">Sakit</p>
        </div>
        <div className="rounded-lg bg-cyan-50 p-4 text-center">
          <p className="text-2xl font-bold text-cyan-700">2</p>
          <p className="text-xs text-cyan-600">Izin</p>
        </div>
        <div className="rounded-lg bg-slate-100 p-4 text-center">
          <p className="text-2xl font-bold text-slate-700">0</p>
          <p className="text-xs text-slate-600">Alpha</p>
        </div>
      </div>

      {/* Tabel Absensi */}
      <div className="rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Tanggal</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Jam Masuk</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Jam Pulang</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bulanIni.map((item) => (
              <tr key={item.tanggal}>
                <td className="px-4 py-3">{new Date(item.tanggal).toLocaleDateString("id-ID")}</td>
                <td className="px-4 py-3">
                  <StatusPill tone={statusColors[item.status] as "emerald" | "amber" | "gray" | "red" | "cyan"}>
                    {statusLabels[item.status]}
                  </StatusPill>
                </td>
                <td className="px-4 py-3">{item.jam}</td>
                <td className="px-4 py-3">17:00</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// TAB: RIWAYAT
function RiwayatTab({ employee }: { employee: Employee }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-500">15 Januari 2024</p>
        <p className="mt-1 font-medium">Bergabung sebagai Kasir</p>
        <p className="text-sm text-slate-600">Diterima dengan kontrak PKWTT</p>
      </div>
      <div className="rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-500">1 Maret 2025</p>
        <p className="mt-1 font-medium">Naik Gaji</p>
        <p className="text-sm text-slate-600">Gaji pokok dinaikkan dari Rp 4.500.000 menjadi Rp 5.000.000</p>
      </div>
      <div className="rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-500">15 April 2025</p>
        <p className="mt-1 font-medium">Promosi Jabatan</p>
        <p className="text-sm text-slate-600">Dipromosikan dari Kasir Jr ke Kasir Sr</p>
      </div>
    </div>
  );
}

// ============================================
// HALAMAN DAFTAR KARYAWAN
// ============================================
export function KaryawanWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace } = useErpWorkspace(initialWorkspace);
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const filteredEmployees = workspace.employees.filter((emp) => {
    if (!search.trim()) return true;
    const normalized = search.toLowerCase();
    return (
      emp.name.toLowerCase().includes(normalized) ||
      emp.employeeNo.toLowerCase().includes(normalized) ||
      emp.role.toLowerCase().includes(normalized)
    );
  });

  // Statistik
  const aktifCount = workspace.employees.filter((e) => e.status === "active").length;
  const kontrakCount = workspace.employees.filter((e) => e.status === "contract").length;
  const nonaktifCount = workspace.employees.filter((e) => e.status === "inactive").length;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">👥 Data Karyawan</h1>
          <p className="mt-1 text-slate-600">Kelola data karyawan dan informasi mereka</p>
        </div>
        <div className="flex gap-2">
          <ActionButton variant="secondary">
            <FileText className="size-4" /> Export Data
          </ActionButton>
          <ActionButton>
            <Plus className="size-4" /> Tambah Karyawan
          </ActionButton>
        </div>
      </div>

      {/* STATISTIK */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Total Karyawan</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{workspace.employees.length}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-600">Aktif</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{aktifCount}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-600">Kontrak</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{kontrakCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-600">Non-aktif</p>
          <p className="mt-1 text-2xl font-bold text-slate-700">{nonaktifCount}</p>
        </div>
      </div>

      {/* PENCARIAN */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama atau nomor karyawan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-4 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="contract">Kontrak</option>
          <option value="inactive">Non-aktif</option>
        </select>
      </div>

      {/* TABEL */}
      {filteredEmployees.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Karyawan</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">No. Karyawan</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Jabatan</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Kontrak</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Gaji Pokok</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                        {employee.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-950">{employee.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{employee.employeeNo}</td>
                  <td className="px-4 py-3 text-slate-600">{employee.role}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {getContractTypeLabel(employee.contractType)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{money(employee.baseSalary)}</td>
                  <td className="px-4 py-3">
                    <StatusPill
                      tone={
                        employee.status === "active"
                          ? "emerald"
                          : employee.status === "inactive"
                            ? "gray"
                            : "amber"
                      }
                    >
                      {employee.status === "active" ? "Aktif" : employee.status === "inactive" ? "Non-aktif" : "Kontrak"}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedEmployee(employee)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-emerald-600"
                        title="Lihat Detail"
                      >
                        <Eye className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                        title="Ubah"
                      >
                        <Edit className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Belum ada karyawan"
          description="Tambahkan karyawan pertama Anda untuk mulai mengelola data karyawan"
        />
      )}

      {/* MODAL PROFIL */}
      {selectedEmployee && (
        <EmployeeProfileModal
          employee={selectedEmployee}
          workspace={workspace}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}