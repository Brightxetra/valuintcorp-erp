"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Briefcase, Building, Calendar, Edit, Eye, FileText, Mail, MapPin, Phone, Plus, Search, Trash2, User } from "lucide-react";
import { ActionButton, EmptyState, SelectField, StatusPill, TextField } from "@/components/ui";
import { MobileDialog } from "@/components/mobile-dialog";
import { useErpWorkspace } from "@/components/erp-context";
import { notify } from "@/lib/notify";
import type { ErpWorkspace } from "@/lib/erp/types";
import type { Employee } from "@/lib/domain/types";
import { getContractTypeLabel } from "@/lib/translations";
import { money } from "@/lib/format";

type TabType = "data" | "gaji" | "bpjs" | "absensi" | "riwayat";
type EmployeeFormState = {
  employeeNo: string;
  name: string;
  department: string;
  role: string;
  contractType: Employee["contractType"];
  status: Employee["status"];
  baseSalary: string;
  dailyRate: string;
  joinedAt: string;
  phone: string;
  email: string;
  address: string;
  taxStatus: string;
  npwp: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  bpjsHealthNo: string;
  bpjsEmploymentNo: string;
};

interface EmployeeProfileProps {
  employee: Employee;
  workspace: ErpWorkspace;
  onClose: () => void;
  onEdit: (employee: Employee) => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextEmployeeNo(workspace: ErpWorkspace) {
  const next = workspace.employees.length + 1;
  return `EMP-${String(next).padStart(3, "0")}`;
}

function employeeToForm(employee?: Employee, workspace?: ErpWorkspace): EmployeeFormState {
  return {
    employeeNo: employee?.employeeNo ?? (workspace ? nextEmployeeNo(workspace) : ""),
    name: employee?.name ?? "",
    department: employee?.department ?? "",
    role: employee?.role ?? "",
    contractType: employee?.contractType ?? "permanent",
    status: employee?.status ?? "active",
    baseSalary: String(employee?.baseSalary ?? 0),
    dailyRate: employee?.dailyRate ? String(employee.dailyRate) : "",
    joinedAt: employee?.joinedAt ?? today(),
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    address: employee?.address ?? "",
    taxStatus: employee?.taxStatus ?? "",
    npwp: employee?.npwp ?? "",
    bankName: employee?.bankName ?? "",
    bankAccountNo: employee?.bankAccountNo ?? "",
    bankAccountName: employee?.bankAccountName ?? employee?.name ?? "",
    bpjsHealthNo: employee?.bpjsHealthNo ?? "",
    bpjsEmploymentNo: employee?.bpjsEmploymentNo ?? "",
  };
}

function formToPayload(form: EmployeeFormState) {
  return {
    ...form,
    baseSalary: Number(form.baseSalary || 0),
    dailyRate: form.dailyRate === "" ? undefined : Number(form.dailyRate),
  };
}

function InfoItem({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /> : null}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <div className="break-words text-sm font-medium text-slate-900">{value || "-"}</div>
      </div>
    </div>
  );
}

export function EmployeeProfileModal({ employee, workspace, onClose, onEdit }: EmployeeProfileProps) {
  const [activeTab, setActiveTab] = useState<TabType>("data");
  const tabs = [
    { id: "data" as const, label: "Data diri" },
    { id: "gaji" as const, label: "Gaji" },
    { id: "bpjs" as const, label: "BPJS" },
    { id: "absensi" as const, label: "Absensi" },
    { id: "riwayat" as const, label: "Riwayat" },
  ];

  return (
    <MobileDialog isOpen onClose={onClose} title={employee.name} maxWidth="max-w-4xl">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700">
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm text-slate-500">{employee.employeeNo}</p>
              <p className="text-lg font-semibold text-slate-950">{employee.role}</p>
              <p className="text-sm text-slate-500">{employee.department || "Tanpa departemen"}</p>
            </div>
          </div>
          <ActionButton variant="secondary" onClick={() => onEdit(employee)}>
            <Edit className="size-4" /> Ubah data
          </ActionButton>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-4 py-3 text-sm font-medium transition ${activeTab === tab.id ? "border-b-2 border-emerald-600 text-emerald-700" : "text-slate-600 hover:text-slate-950"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "data" ? <DataDiriTab employee={employee} /> : null}
        {activeTab === "gaji" ? <GajiTab employee={employee} workspace={workspace} /> : null}
        {activeTab === "bpjs" ? <BPJSTab employee={employee} /> : null}
        {activeTab === "absensi" ? <AbsensiTab employee={employee} workspace={workspace} /> : null}
        {activeTab === "riwayat" ? <RiwayatTab employee={employee} /> : null}
      </div>
    </MobileDialog>
  );
}

function DataDiriTab({ employee }: { employee: Employee }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Data pribadi</h3>
        <div className="space-y-4">
          <InfoItem icon={User} label="Nama lengkap" value={employee.name} />
          <InfoItem icon={Phone} label="Telepon" value={employee.phone} />
          <InfoItem icon={Mail} label="Email" value={employee.email} />
          <InfoItem icon={MapPin} label="Alamat" value={employee.address} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Data pekerjaan</h3>
        <div className="space-y-4">
          <InfoItem icon={Briefcase} label="Jabatan" value={employee.role} />
          <InfoItem icon={Building} label="Departemen" value={employee.department} />
          <InfoItem icon={Calendar} label="Tanggal masuk" value={employee.joinedAt ? new Date(employee.joinedAt).toLocaleDateString("id-ID") : "-"} />
          <InfoItem icon={FileText} label="Jenis kontrak" value={getContractTypeLabel(employee.contractType)} />
          <InfoItem
            icon={AlertCircle}
            label="Status"
            value={(
              <StatusPill tone={employee.status === "active" ? "emerald" : employee.status === "inactive" ? "gray" : "amber"}>
                {employee.status === "active" ? "Aktif" : employee.status === "inactive" ? "Non-aktif" : "Kontrak"}
              </StatusPill>
            )}
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Pajak</h3>
        <div className="space-y-4">
          <InfoItem label="NPWP" value={employee.npwp} />
          <InfoItem label="Status pajak/PTKP" value={employee.taxStatus} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Bank</h3>
        <div className="space-y-4">
          <InfoItem label="Bank" value={employee.bankName} />
          <InfoItem label="Nomor rekening" value={employee.bankAccountNo} />
          <InfoItem label="Atas nama" value={employee.bankAccountName} />
        </div>
      </section>
    </div>
  );
}

function GajiTab({ employee, workspace }: { employee: Employee; workspace: ErpWorkspace }) {
  const payrollRuns = workspace.payrollRuns.filter((run) => run.employeeId === employee.id);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-emerald-50 p-4"><p className="text-xs text-emerald-600">Gaji pokok</p><p className="mt-1 text-xl font-bold text-emerald-700">{money(employee.baseSalary)}</p></div>
        <div className="rounded-lg bg-blue-50 p-4"><p className="text-xs text-blue-600">Harian</p><p className="mt-1 text-xl font-bold text-blue-700">{employee.dailyRate ? money(employee.dailyRate) : "-"}</p></div>
        <div className="rounded-lg bg-purple-50 p-4"><p className="text-xs text-purple-600">Kontrak</p><p className="mt-1 text-xl font-bold text-purple-700">{getContractTypeLabel(employee.contractType)}</p></div>
      </div>
      {payrollRuns.length > 0 ? (
        <div className="space-y-2">
          {payrollRuns.map((run) => <div key={run.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3"><div><p className="font-medium">Gaji {run.period}</p><p className="text-sm text-slate-500">Payroll run</p></div><p className="font-medium text-emerald-700">{money(run.netPay)}</p></div>)}
        </div>
      ) : <EmptyState title="Belum ada riwayat gaji" description="Gaji akan muncul setelah proses hitung gaji diposting." />}
    </div>
  );
}

function BPJSTab({ employee }: { employee: Employee }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">BPJS Kesehatan</p><p className="mt-2 font-medium text-slate-950">{employee.bpjsHealthNo || "-"}</p></div>
      <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">BPJS Ketenagakerjaan</p><p className="mt-2 font-medium text-slate-950">{employee.bpjsEmploymentNo || "-"}</p></div>
    </div>
  );
}

function AbsensiTab({ employee, workspace }: { employee: Employee; workspace: ErpWorkspace }) {
  const rows = workspace.attendance.filter((item) => item.employeeId === employee.id).slice(0, 30);
  if (rows.length === 0) return <EmptyState title="Belum ada data absensi" description="Absensi karyawan akan tampil setelah dicatat." />;
  return <div className="space-y-2">{rows.map((row) => <div key={row.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"><span>{new Date(row.date).toLocaleDateString("id-ID")}</span><StatusPill tone={row.status === "present" ? "emerald" : row.status === "sick" ? "amber" : "gray"}>{row.status}</StatusPill><span>{row.hours} jam</span></div>)}</div>;
}

function RiwayatTab({ employee }: { employee: Employee }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-sm font-medium text-slate-500">{employee.joinedAt ? new Date(employee.joinedAt).toLocaleDateString("id-ID") : "-"}</p>
      <p className="mt-1 font-medium">Bergabung sebagai {employee.role}</p>
      <p className="text-sm text-slate-600">Riwayat detail akan bertambah dari payroll, absensi, dan perubahan data berikutnya.</p>
    </div>
  );
}

function EmployeeFormDialog({ open, employee, form, setForm, onClose, onSubmit, loading }: {
  open: boolean;
  employee: Employee | null;
  form: EmployeeFormState;
  setForm: React.Dispatch<React.SetStateAction<EmployeeFormState>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  function update<K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <MobileDialog isOpen={open} onClose={onClose} title={employee ? "Ubah karyawan" : "Tambah karyawan"} maxWidth="max-w-4xl">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nomor karyawan" value={form.employeeNo} onChange={(e) => update("employeeNo", e.target.value)} required />
          <TextField label="Nama lengkap" value={form.name} onChange={(e) => update("name", e.target.value)} required />
          <TextField label="Departemen" value={form.department} onChange={(e) => update("department", e.target.value)} placeholder="Finance, Operasional, HR" />
          <TextField label="Jabatan" value={form.role} onChange={(e) => update("role", e.target.value)} required />
          <SelectField label="Jenis kontrak" value={form.contractType} onChange={(e) => update("contractType", e.target.value as Employee["contractType"])}>
            <option value="permanent">Permanen</option>
            <option value="contract">Kontrak</option>
            <option value="daily">Harian</option>
          </SelectField>
          <SelectField label="Status" value={form.status} onChange={(e) => update("status", e.target.value as Employee["status"])}>
            <option value="active">Aktif</option>
            <option value="contract">Kontrak</option>
            <option value="inactive">Non-aktif</option>
          </SelectField>
          <TextField label="Tanggal masuk" type="date" value={form.joinedAt} onChange={(e) => update("joinedAt", e.target.value)} required />
          <TextField label="Gaji pokok bulanan" type="number" min="0" value={form.baseSalary} onChange={(e) => update("baseSalary", e.target.value)} />
          <TextField label="Rate harian" type="number" min="0" value={form.dailyRate} onChange={(e) => update("dailyRate", e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Telepon" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          <TextField label="Email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          <label className="block md:col-span-2"><span className="text-sm font-medium text-slate-700">Alamat</span><textarea value={form.address} onChange={(e) => update("address", e.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="NPWP" value={form.npwp} onChange={(e) => update("npwp", e.target.value)} />
          <TextField label="Status pajak/PTKP" value={form.taxStatus} onChange={(e) => update("taxStatus", e.target.value)} placeholder="TK/0, K/1, dll." />
          <TextField label="Bank" value={form.bankName} onChange={(e) => update("bankName", e.target.value)} />
          <TextField label="Nomor rekening" value={form.bankAccountNo} onChange={(e) => update("bankAccountNo", e.target.value)} />
          <TextField label="Atas nama rekening" value={form.bankAccountName} onChange={(e) => update("bankAccountName", e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nomor BPJS Kesehatan" value={form.bpjsHealthNo} onChange={(e) => update("bpjsHealthNo", e.target.value)} />
          <TextField label="Nomor BPJS Ketenagakerjaan" value={form.bpjsEmploymentNo} onChange={(e) => update("bpjsEmploymentNo", e.target.value)} />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <ActionButton type="button" variant="secondary" onClick={onClose}>Batal</ActionButton>
          <ActionButton type="submit" disabled={loading}>{loading ? "Menyimpan..." : employee ? "Simpan perubahan" : "Tambah karyawan"}</ActionButton>
        </div>
      </form>
    </MobileDialog>
  );
}

export function KaryawanWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request } = useErpWorkspace(initialWorkspace);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Employee["status"]>("all");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EmployeeFormState>(() => employeeToForm(undefined, initialWorkspace));
  const [loading, setLoading] = useState(false);

  const filteredEmployees = useMemo(() => workspace.employees.filter((emp) => {
    const normalized = search.toLowerCase().trim();
    const matchesSearch = !normalized || [emp.name, emp.employeeNo, emp.role, emp.department ?? "", emp.email ?? ""].some((value) => value.toLowerCase().includes(normalized));
    const matchesStatus = statusFilter === "all" || emp.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [search, statusFilter, workspace.employees]);

  const aktifCount = workspace.employees.filter((e) => e.status === "active").length;
  const kontrakCount = workspace.employees.filter((e) => e.status === "contract").length;
  const nonaktifCount = workspace.employees.filter((e) => e.status === "inactive").length;

  function openCreate() {
    setEditingEmployee(null);
    setForm(employeeToForm(undefined, workspace));
    setShowForm(true);
  }

  function openEdit(employee: Employee) {
    setEditingEmployee(employee);
    setForm(employeeToForm(employee, workspace));
    setShowForm(true);
  }

  async function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const body = await request<{ workspace: ErpWorkspace }>("/api/erp/master-data", {
        method: "POST",
        body: JSON.stringify({ resource: "employee", id: editingEmployee?.id, values: formToPayload(form) }),
      });
      setWorkspace(body.workspace);
      const saved = body.workspace.employees.find((item) => item.employeeNo === form.employeeNo);
      setSelectedEmployee(saved ?? null);
      setShowForm(false);
      notify.success(editingEmployee ? "Data karyawan diperbarui" : "Karyawan ditambahkan", { description: form.name });
    } catch (caught) {
      notify.error("Data karyawan gagal disimpan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setLoading(false);
    }
  }

  async function archiveEmployee(employee: Employee) {
    if (!window.confirm(`Nonaktifkan karyawan ${employee.name}?`)) return;
    setLoading(true);
    try {
      const body = await request<{ workspace: ErpWorkspace }>("/api/erp/master-data", {
        method: "DELETE",
        body: JSON.stringify({ resource: "employee", id: employee.id }),
      });
      setWorkspace(body.workspace);
      setSelectedEmployee(null);
      notify.info("Karyawan dinonaktifkan", { description: employee.name });
    } catch (caught) {
      notify.error("Karyawan gagal dinonaktifkan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Data Karyawan</h1>
          <p className="mt-1 text-slate-600">Kelola profil, kontak, pajak, bank, BPJS, dan status kerja karyawan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="secondary"><FileText className="size-4" /> Export Data</ActionButton>
          <ActionButton onClick={openCreate}><Plus className="size-4" /> Tambah Karyawan</ActionButton>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Total Karyawan</p><p className="mt-1 text-2xl font-bold text-slate-950">{workspace.employees.length}</p></div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm text-emerald-600">Aktif</p><p className="mt-1 text-2xl font-bold text-emerald-700">{aktifCount}</p></div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm text-amber-600">Kontrak</p><p className="mt-1 text-2xl font-bold text-amber-700">{kontrakCount}</p></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-sm text-slate-600">Non-aktif</p><p className="mt-1 text-2xl font-bold text-slate-700">{nonaktifCount}</p></div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Cari nama, nomor, jabatan, departemen, atau email..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-4 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="contract">Kontrak</option>
          <option value="inactive">Non-aktif</option>
        </select>
      </div>

      {filteredEmployees.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="mobile-card-table w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left font-semibold text-slate-500">Karyawan</th><th className="px-4 py-3 text-left font-semibold text-slate-500">No.</th><th className="px-4 py-3 text-left font-semibold text-slate-500">Departemen</th><th className="px-4 py-3 text-left font-semibold text-slate-500">Jabatan</th><th className="px-4 py-3 text-left font-semibold text-slate-500">Gaji Pokok</th><th className="px-4 py-3 text-left font-semibold text-slate-500">Status</th><th className="px-4 py-3 text-center font-semibold text-slate-500">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50">
                  <td data-mobile-label="Karyawan" className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">{employee.name.charAt(0).toUpperCase()}</div><div><p className="font-medium text-slate-950">{employee.name}</p><p className="text-xs text-slate-500">{employee.email || employee.phone || "Kontak belum diisi"}</p></div></div></td>
                  <td data-mobile-label="No." className="px-4 py-3 text-slate-600">{employee.employeeNo}</td>
                  <td data-mobile-label="Departemen" className="px-4 py-3 text-slate-600">{employee.department || "-"}</td>
                  <td data-mobile-label="Jabatan" className="px-4 py-3 text-slate-600">{employee.role}</td>
                  <td data-mobile-label="Gaji pokok" className="px-4 py-3 text-slate-600">{money(employee.baseSalary)}</td>
                  <td data-mobile-label="Status" className="px-4 py-3"><StatusPill tone={employee.status === "active" ? "emerald" : employee.status === "inactive" ? "gray" : "amber"}>{employee.status === "active" ? "Aktif" : employee.status === "inactive" ? "Non-aktif" : "Kontrak"}</StatusPill></td>
                  <td data-mobile-label="Aksi" className="px-4 py-3"><div className="flex items-center justify-center gap-2"><button type="button" onClick={() => setSelectedEmployee(employee)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-emerald-600" aria-label={`Lihat ${employee.name}`}><Eye className="size-4" /></button><button type="button" onClick={() => openEdit(employee)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600" aria-label={`Ubah ${employee.name}`}><Edit className="size-4" /></button><button type="button" onClick={() => void archiveEmployee(employee)} disabled={loading || employee.status === "inactive"} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-40" aria-label={`Nonaktifkan ${employee.name}`}><Trash2 className="size-4" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Belum ada karyawan" description="Tambahkan karyawan pertama untuk mulai mengelola data HR." />}

      {selectedEmployee ? <EmployeeProfileModal employee={selectedEmployee} workspace={workspace} onClose={() => setSelectedEmployee(null)} onEdit={openEdit} /> : null}
      <EmployeeFormDialog open={showForm} employee={editingEmployee} form={form} setForm={setForm} onClose={() => setShowForm(false)} onSubmit={saveEmployee} loading={loading} />
    </div>
  );
}
