"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Database,
  Eye,
  FileText,
  Globe,
  ImageIcon,
  Laptop,
  MapPin,
  Power,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Truck,
  Upload,
  Users,
  Warehouse,
  XCircle,
} from "lucide-react";
import { ActionButton, SelectField, StatusPill, TextField, cn } from "@/components/ui";
import { useErpWorkspace } from "@/components/erp-context";
import { ChangePasswordCard } from "@/components/change-password-card";
import { MobileDialog as Modal } from "@/components/mobile-dialog";
import { SecuritySubmenuTabs, type SecuritySubmenu } from "@/components/security-submenu-tabs";
import type { ErpWorkspace } from "@/lib/erp/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { permissionCatalog } from "@/lib/security/permissions";
import { clearServerSession, signOutLocalBrowserSession, syncServerSession } from "@/lib/erp/client-api";
import { notify } from "@/lib/notify";
import { canonicalIndustryTemplateId } from "@/lib/erp/industry-templates";

type SettingsCategory =
  | "business"
  | "tax"
  | "team"
  | "customers"
  | "suppliers"
  | "warehouses"
  | "locations"
  | "onboarding"
  | "security"
  | "integrations";

type SettingsTab = "overview" | "business" | "team" | "data" | "security" | "integrations";

const industryLabels: Record<string, string> = {
  umkm: "UMKM",
  general: "General",
};

const resourceLabels: Record<string, string> = {
  business: "Profil bisnis",
  tax_profile: "Profil pajak",
  customer: "Pelanggan",
  supplier: "Supplier",
  product: "Produk",
  warehouse: "Gudang",
  location: "Lokasi",
};

function resourceLabel(resource: string) {
  return resourceLabels[resource] ?? "Data";
}

interface CategoryCard {
  id: SettingsCategory | "onboarding";
  title: string;
  description: string;
  icon: React.ElementType;
  count?: number;
  href?: string;
  tab: SettingsTab;
}

interface SettingsPanelProps {
  workspace: ErpWorkspace;
  pending: boolean;
  saveBusiness: (formData: FormData) => void;
  saveTax: (formData: FormData) => void;
  saveMember: (formData: FormData) => Promise<boolean>;
  deleteMember: (memberId: string) => Promise<void>;
  cancelInvite: (inviteId: string) => Promise<void>;
  resendInvite: (inviteId: string) => Promise<void>;
  saveLocation: (formData: FormData) => void;
  saveWarehouse: (formData: FormData) => void;
  saveMaster: (resource: string, values: Record<string, unknown>, id?: string) => Promise<void>;
  updateMasterStatus: (resource: string, ids: string[], isActive: boolean) => Promise<void>;
  applyTemplate: (formData: FormData) => void;
  createBusinessFromSettings: (formData: FormData) => void;
  uploadBusinessLogo: (file: File) => Promise<void>;
  logoPreviewUrl: string | null;
  logoUploading: boolean;
}

interface LoginSessionDevice {
  id: string;
  deviceLabel: string;
  ipAddress: string | null;
  location: string | null;
  userAgent: string | null;
  rememberMe: boolean;
  status: "active" | "revoked" | "expired";
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  current: boolean;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Logo gagal dibaca."));
    reader.readAsDataURL(file);
  });
}

function CategoryGrid({
  categories,
  onSelect,
}: {
  categories: CategoryCard[];
  onSelect: (id: SettingsCategory) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => {
        const Icon = category.icon;
        const content = (
          <>
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-slate-100 p-3 text-slate-600 transition-colors group-hover:bg-slate-900 group-hover:text-white">
                <Icon className="size-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-950">{category.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{category.description}</p>
                {category.count !== undefined ? (
                  <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {category.count} item
                  </span>
                ) : null}
              </div>
            </div>
            <ChevronRight className="absolute right-4 top-1/2 size-5 -translate-y-1/2 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
          </>
        );

        if (category.href) {
          return (
            <Link
              key={category.id}
              href={category.href}
              className="group relative rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-slate-300 hover:shadow-lg"
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id as SettingsCategory)}
            className="group relative rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-slate-300 hover:shadow-lg"
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function BusinessProfilePanel({
  workspace,
  pending,
  saveBusiness,
  uploadBusinessLogo,
  logoPreviewUrl,
  logoUploading,
}: SettingsPanelProps) {
  const logoSource = logoPreviewUrl;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Profil Bisnis</h2>
        <p className="mt-1 text-sm text-slate-500">Informasi legal, logo, industri, NPWP, dan periode bisnis.</p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {logoSource ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSource} alt={`Logo ${workspace.business.displayName}`} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="size-8 text-slate-400" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950">Logo bisnis</p>
          <p className="mt-1 text-sm text-slate-500">PNG, JPG, WEBP, atau SVG sampai 2 MB. Logo tersimpan di profil bisnis aktif.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
          <Upload className="size-4" aria-hidden />
          {logoUploading ? "Mengunggah..." : "Upload logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            disabled={logoUploading || pending}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void uploadBusinessLogo(file);
            }}
          />
        </label>
      </div>

      <form action={saveBusiness} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="displayName" label="Nama display" defaultValue={workspace.business.displayName} required />
          <TextField name="legalName" label="Nama legal" defaultValue={workspace.business.legalName} required />
          <TextField name="ownerName" label="Pemilik" defaultValue={workspace.business.ownerName} required />
          <TextField name="taxId" label="NPWP" defaultValue={workspace.business.taxId ?? ""} />
          <input type="hidden" name="logoUrl" value={workspace.business.logoUrl ?? ""} />
          <SelectField name="industry" label="Industri" defaultValue={canonicalIndustryTemplateId(workspace.business.industry)}>
            <option value="umkm">UMKM</option>
            <option value="general">General</option>
          </SelectField>
          <TextField name="periodStartMonth" label="Bulan awal periode" type="number" min={1} max={12} defaultValue={workspace.business.periodStartMonth} required />
        </div>
        <ActionButton disabled={pending}>Simpan profil</ActionButton>
      </form>
    </section>
  );
}

function TaxProfilePanel({ workspace, pending, saveTax }: SettingsPanelProps) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Profil Pajak</h2>
        <p className="mt-1 text-sm text-slate-500">Konfigurasi estimasi PPh final UMKM dan status kesiapan Coretax.</p>
      </div>

      <form action={saveTax} className="grid gap-4 sm:grid-cols-2">
        <SelectField name="taxpayerType" label="Tipe wajib pajak" defaultValue={workspace.taxProfile.taxpayerType}>
          <option value="individual_umkm">Orang pribadi UMKM</option>
          <option value="corporate_umkm">Badan UMKM</option>
        </SelectField>
        <SelectField name="usesFinalUmkmRate" label="Pakai PPh final UMKM" defaultValue={String(workspace.taxProfile.usesFinalUmkmRate)}>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </SelectField>
        <TextField name="finalUmkmRate" label="Tarif PPh final" type="number" step="0.0001" defaultValue={workspace.taxProfile.finalUmkmRate} />
        <SelectField name="coretaxStatus" label="Status Coretax" defaultValue={workspace.taxProfile.coretaxStatus}>
          <option value="not_started">Belum mulai</option>
          <option value="account_ready">Akun siap</option>
          <option value="certificate_ready">Sertifikat siap</option>
        </SelectField>
        <div className="sm:col-span-2">
          <ActionButton disabled={pending}>Simpan pajak</ActionButton>
        </div>
      </form>
    </section>
  );
}

function memberDisplayName(member: NonNullable<ErpWorkspace["members"]>[number], workspace: ErpWorkspace) {
  return member.email || (member.authUserId === workspace.user.id ? workspace.user.email : "") || `Anggota ${member.authUserId.slice(0, 8)}`;
}

function memberSecondaryLabel(member: NonNullable<ErpWorkspace["members"]>[number], workspace: ErpWorkspace) {
  const access = member.accessScope === "custom" ? `${member.accessPermissions.length} menu spesifik` : "Mengikuti role bawaan";
  const locations = member.locationIds.length
    ? member.locationIds.map((locationId) => workspace.locations.find((location) => location.id === locationId)?.name ?? locationId).join(", ")
    : "Semua cabang";
  const status = member.emailConfirmedAt
    ? "Email terverifikasi"
    : member.invitedAt
      ? "Menunggu aktivasi email"
      : "Akun aktif";

  return `${access} - ${locations} - ${status}`;
}

function MembersPanel({ workspace, pending, saveMember, deleteMember, cancelInvite, resendInvite }: SettingsPanelProps) {
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [accessScope, setAccessScope] = useState("role");
  const [role, setRole] = useState("staff");
  const members = workspace.members ?? [];
  const editingMember = members.find((member) => member.id === editingMemberId);
  const pendingInvites = workspace.memberInvites.filter((invite) => invite.status === "pending");
  const query = search.trim().toLowerCase();
  const visibleMembers = members.filter((member) => memberDisplayName(member, workspace).toLowerCase().includes(query) || member.role.includes(query));
  const visibleInvites = pendingInvites.filter((invite) => invite.email.toLowerCase().includes(query));
  const branches = workspace.locations.filter((location) => (location.isActive || editingMember?.locationIds.includes(location.id)) && ["branch", "outlet", "store"].includes(location.type));
  const closeEditor = useCallback(() => {
    if (!pending) setEditorOpen(false);
  }, [pending]);

  function openEditor(member?: NonNullable<ErpWorkspace["members"]>[number]) {
    setEditingMemberId(member?.id ?? null);
    setAccessScope(member?.accessScope ?? "role");
    setRole(member?.role ?? "staff");
    setEditorOpen(true);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Team & Akses</h2>
          <p className="text-sm text-slate-500">{workspace.business.displayName}</p>
        </div>
        <ActionButton type="button" disabled={pending} onClick={() => openEditor()}><Plus className="size-4" /> Undang anggota</ActionButton>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white">
          {workspace.user.name?.charAt(0) || "U"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-950">{workspace.user.name}</p>
          <p className="truncate text-sm text-slate-500">{workspace.user.email || workspace.user.id}</p>
        </div>
        <StatusPill tone="emerald">{workspace.user.role}</StatusPill>
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
        <Search className="size-4 shrink-0 text-slate-500" aria-hidden />
        <input className="min-w-0 flex-1 py-2.5 text-sm outline-none" type="search" aria-label="Cari anggota atau undangan" placeholder="Cari anggota atau undangan" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>

      <Modal isOpen={editorOpen} onClose={closeEditor} maxWidth="max-w-2xl" title={editingMember ? "Ubah akses anggota" : "Undang anggota"}>
      <form key={editingMember?.id ?? "new-member"} action={async (formData) => {
        if (await saveMember(formData)) setEditorOpen(false);
      }} className="grid gap-4 sm:grid-cols-2">
        {editingMember ? (
          <div className="sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <input type="hidden" name="memberId" value={editingMember.id} />
            <p className="text-sm font-semibold text-slate-900">{memberDisplayName(editingMember, workspace)}</p>
            <p className="mt-1 text-xs text-slate-500">Sistem mendeteksi akun dari email atau data login. Anda tidak perlu mengisi ID teknis manual.</p>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <TextField name="email" label="Email anggota" type="email" placeholder="finance@usaha.co.id" required />
            <p className="mt-1 text-xs text-slate-500">Jika email sudah terdaftar di Supabase, anggota langsung ditambahkan. Jika belum, sistem mengirim email invite otomatis.</p>
          </div>
        )}
        <SelectField name="role" label="Peran" value={role} onChange={(event) => {
          setRole(event.target.value);
          if (event.target.value === "owner" || event.target.value === "system_admin") setAccessScope("role");
        }}>
          <option value="staff">Staff</option>
          <option value="finance_admin">Finance/Admin</option>
          <option value="hr">HR</option>
          <option value="external_advisor">External advisor</option>
          <option value="owner">Owner</option>
          {editingMember?.role === "system_admin" && <option value="system_admin">System admin</option>}
        </SelectField>
        <SelectField name="accessScope" label="Mode akses" value={accessScope} onChange={(event) => setAccessScope(event.target.value)}>
          <option value="role">Ikuti peran</option>
          {role !== "owner" && role !== "system_admin" && <option value="custom">Izin pilihan</option>}
        </SelectField>
        <fieldset hidden={accessScope !== "custom"} disabled={accessScope !== "custom"} className="sm:col-span-2">
          <legend className="text-sm font-semibold text-slate-800">Izin anggota</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {permissionCatalog.map((entry) => <label key={entry.permission} className="flex gap-2 rounded-lg border border-slate-100 p-2 text-sm"><input name="permissions" value={entry.permission} type="checkbox" defaultChecked={editingMember?.accessScope === "custom" && editingMember.accessPermissions.includes(entry.permission)} className="mt-0.5 size-4" /><span><strong className="block text-slate-800">{entry.label}</strong><span className="text-xs text-slate-500">{entry.description}</span></span></label>)}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold text-slate-800">Cabang yang ditugaskan</legend>
          {branches.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{branches.map((location) => <label className="flex items-center gap-2 text-sm" key={location.id}><input type="checkbox" name="locationIds" value={location.id} defaultChecked={editingMember?.locationIds.includes(location.id)} /> {location.name} ({location.code}){!location.isActive && " · Nonaktif"}</label>)}</div> : <p className="mt-1 text-sm text-slate-500">Belum ada cabang aktif.</p>}
        </fieldset>
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          <ActionButton type="button" variant="secondary" disabled={pending} onClick={closeEditor}>Batal</ActionButton>
          <ActionButton disabled={pending}>{editingMember ? "Simpan akses" : "Kirim undangan"}</ActionButton>
        </div>
      </form>
      </Modal>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">Anggota aktif ({members.length})</h3>
        <div className="mt-3 space-y-2">
          {visibleMembers.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{memberDisplayName(member, workspace)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{memberSecondaryLabel(member, workspace)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone={member.accessScope === "custom" ? "cyan" : "gray"}>{member.role}</StatusPill>
                <button type="button" aria-label={`Ubah akses ${memberDisplayName(member, workspace)}`} disabled={pending} onClick={() => openEditor(member)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700">Ubah akses</button>
                {member.authUserId !== workspace.user.id && member.role !== "owner" ? (
                  <button
                    type="button"
                    aria-label={`Hapus anggota ${memberDisplayName(member, workspace)}`}
                    disabled={pending}
                    onClick={() => {
                      void deleteMember(member.id);
                    }}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle className="size-4" aria-hidden />
                    Hapus
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {visibleMembers.length === 0 ? <p className="text-sm text-slate-500">{query ? "Anggota tidak ditemukan." : "Belum ada anggota aktif."}</p> : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">Undangan tertunda ({pendingInvites.length})</h3>
        <div className="mt-3 space-y-2">
          {visibleInvites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{invite.email}</p>
                <p className="mt-0.5 text-xs text-slate-500">Menunggu staff membuka email invite. Akses belum aktif sebelum invite diterima.</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone="amber">{invite.role}</StatusPill>
                <button
                  type="button"
                  aria-label={`Kirim ulang invite ${invite.email}`}
                  disabled={pending}
                  onClick={() => {
                    void resendInvite(invite.id);
                  }}
                  className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Kirim ulang
                </button>
                <button
                  type="button"
                  aria-label={`Batalkan invite ${invite.email}`}
                  disabled={pending}
                  onClick={() => {
                    void cancelInvite(invite.id);
                  }}
                  className="min-h-10 rounded-lg border border-amber-200 px-3 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                >
                  Batalkan invite
                </button>
              </div>
            </div>
          ))}
          {visibleInvites.length === 0 ? (
            <p className="text-sm text-slate-500">{query ? "Undangan tidak ditemukan." : "Belum ada undangan tertunda."}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type DirectoryType = "customers" | "suppliers" | "warehouses" | "locations";

interface DirectoryRow {
  id: string;
  code: string;
  name: string;
  primaryMeta: string;
  secondaryMeta: string;
  active: boolean;
  searchText: string;
  details: Array<[string, string]>;
}

interface StatusConfirmation {
  ids: string[];
  isActive: boolean;
  label: string;
}

const locationTypeLabels: Record<string, string> = {
  branch: "Branch",
  outlet: "Outlet",
  store: "Store",
  warehouse: "Warehouse",
  workshop: "Workshop",
  office: "Office",
};

function directoryCode(type: DirectoryType) {
  const prefix = {
    customers: "CUST",
    suppliers: "SUP",
    warehouses: "WH",
    locations: "LOC",
  }[type];

  return `${prefix}-${Date.now().toString().slice(-4)}`;
}

function compactText(...values: Array<string | number | null | undefined>) {
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ") || "-";
}

function MasterDirectoryPanel({
  workspace,
  pending,
  saveMaster,
  updateMasterStatus,
  type,
}: Pick<SettingsPanelProps, "workspace" | "pending" | "saveMaster" | "updateMasterStatus"> & {
  type: DirectoryType;
}) {
  const [showForm, setShowForm] = useState(false);
  const [defaultCode, setDefaultCode] = useState(() => directoryCode(type));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailRow, setDetailRow] = useState<DirectoryRow | null>(null);
  const [confirmation, setConfirmation] = useState<StatusConfirmation | null>(null);
  const pageSize = 8;

  const config = {
    customers: {
      title: "Customer",
      pluralTitle: "Data Customer",
      icon: Users,
      resource: "customer",
      addLabel: "Tambah customer baru",
      columns: ["Kode", "Nama", "NPWP", "Kontak"],
      rows: workspace.customers.map((item): DirectoryRow => ({
        id: item.id,
        code: item.code,
        name: item.name,
        primaryMeta: item.taxId || "-",
        secondaryMeta: compactText(item.phone, item.email),
        active: item.isActive,
        searchText: compactText(item.code, item.name, item.taxId, item.phone, item.email, item.address).toLowerCase(),
        details: [
          ["Kode", item.code],
          ["Nama", item.name],
          ["NPWP", item.taxId || "-"],
          ["Telepon", item.phone || "-"],
          ["Email", item.email || "-"],
          ["Alamat", item.address || "-"],
          ["Credit limit", `Rp ${Number(item.creditLimit || 0).toLocaleString("id-ID")}`],
        ],
      })),
    },
    suppliers: {
      title: "Supplier",
      pluralTitle: "Data Supplier",
      icon: Truck,
      resource: "supplier",
      addLabel: "Tambah supplier baru",
      columns: ["Kode", "Nama", "NPWP", "Kontak"],
      rows: workspace.suppliers.map((item): DirectoryRow => ({
        id: item.id,
        code: item.code,
        name: item.name,
        primaryMeta: item.taxId || "-",
        secondaryMeta: compactText(item.phone, item.email),
        active: item.isActive,
        searchText: compactText(item.code, item.name, item.taxId, item.phone, item.email, item.address).toLowerCase(),
        details: [
          ["Kode", item.code],
          ["Nama", item.name],
          ["NPWP", item.taxId || "-"],
          ["Telepon", item.phone || "-"],
          ["Email", item.email || "-"],
          ["Alamat", item.address || "-"],
        ],
      })),
    },
    warehouses: {
      title: "Warehouse",
      pluralTitle: "Data Warehouse",
      icon: Warehouse,
      resource: "warehouse",
      addLabel: "Tambah warehouse baru",
      columns: ["Kode", "Nama", "Lokasi", "Keterangan"],
      rows: workspace.warehouses.map((item): DirectoryRow => ({
        id: item.id,
        code: item.code,
        name: item.name,
        primaryMeta: item.location || "-",
        secondaryMeta: "Gudang operasional",
        active: item.isActive,
        searchText: compactText(item.code, item.name, item.location).toLowerCase(),
        details: [
          ["Kode", item.code],
          ["Nama", item.name],
          ["Lokasi", item.location || "-"],
        ],
      })),
    },
    locations: {
      title: "Lokasi & Cabang",
      pluralTitle: "Lokasi & Cabang",
      icon: MapPin,
      resource: "location",
      addLabel: "Tambah lokasi baru",
      columns: ["Kode", "Nama", "Tipe", "Gudang terkait"],
      rows: workspace.locations.map((item): DirectoryRow => {
        const warehouse = workspace.warehouses.find((warehouseItem) => warehouseItem.id === item.warehouseId);
        const typeLabel = locationTypeLabels[item.type] ?? item.type;

        return {
          id: item.id,
          code: item.code,
          name: item.name,
          primaryMeta: typeLabel,
          secondaryMeta: warehouse?.name || "-",
          active: item.isActive,
          searchText: compactText(item.code, item.name, typeLabel, warehouse?.name).toLowerCase(),
          details: [
            ["Kode", item.code],
            ["Nama", item.name],
            ["Tipe", typeLabel],
            ["Gudang terkait", warehouse?.name || "-"],
          ],
        };
      }),
    },
  }[type];
  const Icon = config.icon;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = config.rows.filter((row) => {
    const matchesQuery = !normalizedQuery || row.searchText.includes(normalizedQuery);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && row.active) ||
      (statusFilter === "inactive" && !row.active);

    return matchesQuery && matchesStatus;
  });
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedRows = config.rows.filter((row) => selectedIds.has(row.id));
  const pageIds = pageRows.map((row) => row.id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const activeSelectedIds = selectedRows.filter((row) => row.active).map((row) => row.id);
  const inactiveSelectedIds = selectedRows.filter((row) => !row.active).map((row) => row.id);
  const activeFilteredIds = filteredRows.filter((row) => row.active).map((row) => row.id);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (pageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function createEntry(formData: FormData) {
    const baseValues = {
      code: String(formData.get("code")),
      name: String(formData.get("name")),
      isActive: true,
    };
    const values =
      type === "customers"
        ? {
            ...baseValues,
            taxId: String(formData.get("taxId")),
            phone: String(formData.get("phone")),
            email: String(formData.get("email")),
            address: String(formData.get("address")),
            creditLimit: Number(formData.get("creditLimit")),
          }
        : type === "suppliers"
          ? {
              ...baseValues,
              taxId: String(formData.get("taxId")),
              phone: String(formData.get("phone")),
              email: String(formData.get("email")),
              address: String(formData.get("address")),
            }
          : type === "warehouses"
            ? {
                ...baseValues,
                location: String(formData.get("location")),
              }
            : {
                ...baseValues,
                type: String(formData.get("type")),
                warehouseId: String(formData.get("warehouseId")),
              };

    await saveMaster(config.resource, values);
    setDefaultCode(directoryCode(type));
    setShowForm(false);
  }

  async function confirmStatusChange() {
    if (!confirmation) return;
    await updateMasterStatus(config.resource, confirmation.ids, confirmation.isActive);
    setSelectedIds(new Set());
    setConfirmation(null);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-100 p-3">
            <Icon className="size-6 text-slate-600" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-950">{config.pluralTitle}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{config.rows.length} data, {config.rows.filter((row) => row.active).length} aktif.</p>
          </div>
        </div>
        <ActionButton type="button" onClick={() => setShowForm((current) => !current)} disabled={pending}>
          <Plus className="size-4" aria-hidden />
          {config.addLabel}
        </ActionButton>
      </div>

      {showForm ? (
        <div className="directory-reveal">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createEntry(new FormData(event.currentTarget));
            }}
            className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <TextField name="code" label={`Kode ${config.title}`} defaultValue={defaultCode} required />
            <TextField name="name" label={`Nama ${config.title}`} required />
            {type === "customers" || type === "suppliers" ? (
              <>
                <TextField name="taxId" label="NPWP" />
                <TextField name="phone" label="Telepon" />
                <TextField name="email" label="Email" type="email" />
                <TextField name="address" label="Alamat" />
                {type === "customers" ? <TextField name="creditLimit" label="Credit limit" type="number" defaultValue={0} /> : null}
              </>
            ) : null}
            {type === "warehouses" ? <TextField name="location" label="Lokasi" placeholder="Alamat/lokasi gudang" /> : null}
            {type === "locations" ? (
              <>
                <SelectField name="type" label="Tipe">
                  <option value="branch">Branch</option>
                  <option value="outlet">Outlet</option>
                  <option value="store">Store</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="workshop">Workshop</option>
                  <option value="office">Office</option>
                </SelectField>
                <SelectField name="warehouseId" label="Gudang terkait">
                  <option value="">Tanpa gudang</option>
                  {workspace.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </SelectField>
              </>
            ) : null}
            <div className="flex items-end gap-2">
              <ActionButton disabled={pending}>Simpan</ActionButton>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Cari ${config.title.toLowerCase()}...`}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          {activeSelectedIds.length > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmation({ ids: activeSelectedIds, isActive: false, label: `${activeSelectedIds.length} data terpilih` })}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <XCircle className="size-4" aria-hidden />
              Nonaktifkan
            </button>
          ) : null}
          {inactiveSelectedIds.length > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmation({ ids: inactiveSelectedIds, isActive: true, label: `${inactiveSelectedIds.length} data terpilih` })}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              <CheckCircle2 className="size-4" aria-hidden />
              Aktifkan
            </button>
          ) : null}
          {activeFilteredIds.length > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmation({ ids: activeFilteredIds, isActive: false, label: "semua hasil filter aktif" })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Nonaktifkan semua hasil filter
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="mobile-card-table w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-12 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={pageSelected}
                  onChange={togglePageSelection}
                  aria-label="Pilih semua data di halaman ini"
                  className="size-4 rounded border-slate-300"
                />
              </th>
              {config.columns.map((column) => (
                <th key={column} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{column}</th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td data-mobile-label="" className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleSelected(row.id)}
                    aria-label={`Pilih ${row.name}`}
                    className="size-4 rounded border-slate-300"
                  />
                </td>
                <td data-mobile-label={config.columns[0]} className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">{row.code}</td>
                <td data-mobile-label={config.columns[1]} className="px-4 py-3">
                  <p className="font-medium text-slate-950">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.secondaryMeta}</p>
                </td>
                <td data-mobile-label={config.columns[2]} className="px-4 py-3 text-slate-600">{row.primaryMeta}</td>
                <td data-mobile-label={config.columns[3]} className="px-4 py-3 text-slate-600">{row.secondaryMeta}</td>
                <td data-mobile-label="Status" className="px-4 py-3">
                  <StatusPill tone={row.active ? "emerald" : "gray"}>{row.active ? "Aktif" : "Nonaktif"}</StatusPill>
                </td>
                <td data-mobile-label="Aksi" className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailRow(row)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="size-3.5" aria-hidden />
                      Detail
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmation({ ids: [row.id], isActive: !row.active, label: row.name })}
                      disabled={pending}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50",
                        row.active
                          ? "border border-red-200 text-red-700 hover:bg-red-50"
                          : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                      )}
                    >
                      {row.active ? <XCircle className="size-3.5" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
                      {row.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pageRows.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">Tidak ada data sesuai filter.</div> : null}
      </div>

      <div className="flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>{filteredRows.length} hasil · halaman {currentPage} dari {pageCount}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage <= 1}
            className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={currentPage >= pageCount}
            className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      </div>

      <Modal isOpen={Boolean(detailRow)} onClose={() => setDetailRow(null)} title={`Detail ${config.title}`} maxWidth="max-w-xl">
        {detailRow ? (
          <div className="space-y-3">
            {detailRow.details.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 p-3 text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="max-w-[65%] text-right font-medium text-slate-950">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
              <span className="text-slate-500">Status</span>
              <StatusPill tone={detailRow.active ? "emerald" : "gray"}>{detailRow.active ? "Aktif" : "Nonaktif"}</StatusPill>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        title={confirmation?.isActive ? "Aktifkan kembali data?" : "Nonaktifkan data?"}
        maxWidth="max-w-md"
      >
        {confirmation ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              Anda akan {confirmation.isActive ? "mengaktifkan kembali" : "menonaktifkan"} {confirmation.label}. Data historis tetap aman karena aksi ini tidak menghapus permanen.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <ActionButton
                type="button"
                variant={confirmation.isActive ? "primary" : "danger"}
                onClick={() => void confirmStatusChange()}
                disabled={pending}
              >
                {confirmation.isActive ? "Aktifkan kembali" : "Nonaktifkan"}
              </ActionButton>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}

function MasterDataPanel({
  workspace,
  pending,
  saveMaster,
  updateMasterStatus,
  type,
}: Pick<SettingsPanelProps, "workspace" | "pending" | "saveMaster" | "updateMasterStatus"> & {
  type: "customers" | "suppliers" | "warehouses";
}) {
  return (
    <MasterDirectoryPanel
      workspace={workspace}
      pending={pending}
      saveMaster={saveMaster}
      updateMasterStatus={updateMasterStatus}
      type={type}
    />
  );
}

function LocationsPanel({ workspace, pending, saveMaster, updateMasterStatus }: SettingsPanelProps) {
  return (
    <MasterDirectoryPanel
      workspace={workspace}
      pending={pending}
      saveMaster={saveMaster}
      updateMasterStatus={updateMasterStatus}
      type="locations"
    />
  );
}

function IntegrationsPanel({ workspace }: { workspace: ErpWorkspace }) {
  const { demoMode, demoAccount, runtimeMode } = useErpWorkspace();
  const statusText =
    runtimeMode === "demo_fallback"
      ? "Mode fallback - data contoh lokal tidak persist permanen."
      : runtimeMode === "demo_account"
        ? "Akun demo Supabase - data persist di sandbox dan reset sesuai jadwal."
        : "Terhubung - data tersimpan melalui Supabase.";
  const statusLabel = demoMode ? "Fallback" : demoAccount ? "Demo Account" : "Active";

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Integrasi & Koneksi</h2>
        <p className="mt-1 text-sm text-slate-500">Status persistence, modul aktif, dan akses setup awal.</p>
      </div>

      <div className={cn("flex items-center gap-4 rounded-xl border p-4", demoMode ? "border-amber-200 bg-amber-50" : demoAccount ? "border-cyan-200 bg-cyan-50" : "border-emerald-200 bg-emerald-50")}>
        <div className={cn("rounded-lg p-2", demoMode ? "bg-amber-100" : demoAccount ? "bg-cyan-100" : "bg-emerald-100")}>
          <Database className={cn("size-5", demoMode ? "text-amber-600" : demoAccount ? "text-cyan-600" : "text-emerald-600")} aria-hidden />
        </div>
        <div className="flex-1">
          <p className="font-medium text-slate-950">Supabase Database</p>
          <p className="text-sm text-slate-500">{statusText}</p>
        </div>
        <StatusPill tone={demoMode ? "amber" : demoAccount ? "cyan" : "emerald"}>{statusLabel}</StatusPill>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Modul aktif</h3>
        <div className="flex flex-wrap gap-2">
          {workspace.featureFlags.map((flag) => (
            <StatusPill key={flag.id} tone={flag.enabled ? "emerald" : "gray"}>{flag.module}</StatusPill>
          ))}
        </div>
      </div>

    </section>
  );
}

function formatSessionDate(value: string | null) {
  if (!value) return "Tidak tersedia";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak tersedia";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function SecurityPanel() {
  const { request, demoMode } = useErpWorkspace();
  const [activeMenu, setActiveMenu] = useState<SecuritySubmenu>("devices");
  const [sessions, setSessions] = useState<LoginSessionDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);

    try {
      const body = await request<{ sessions: LoginSessionDevice[] }>("/api/auth/sessions", {
        businessId: null,
      });
      setSessions(body.sessions);
    } catch (caught) {
      notify.error("Daftar perangkat gagal dimuat", {
        description: caught instanceof Error ? caught.message : "Coba lagi.",
      });
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSessions();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSessions]);

  async function revokeSession(session: LoginSessionDevice) {
    setRevokingId(session.id);

    try {
      const body = await request<{ current: boolean }>("/api/auth/sessions", {
        method: "DELETE",
        businessId: null,
        body: JSON.stringify({ sessionId: session.id }),
      });

      notify.success(body.current ? "Perangkat ini dikeluarkan" : "Perangkat dikeluarkan", {
        description: session.deviceLabel,
      });

      if (body.current) {
        await signOutLocalBrowserSession();
        await clearServerSession();
        window.location.assign("/login?reason=session-revoked");
        return;
      }

      await loadSessions();
    } catch (caught) {
      notify.error("Perangkat gagal dikeluarkan", {
        description: caught instanceof Error ? caught.message : "Coba lagi.",
      });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Security</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pilih Device login untuk mengelola sesi aktif, atau Password untuk ubah dan reset password akun.
          </p>
        </div>
      </div>

      <SecuritySubmenuTabs value={activeMenu} onChange={setActiveMenu} />

      {activeMenu === "password" ? <ChangePasswordCard /> : null}

      {activeMenu === "devices" ? (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">Timeout sesi</p>
              <p className="mt-1 text-sm text-slate-600">
                Jika opsi <span className="font-medium">Tetap login</span> tidak dicentang saat login, sesi akan berakhir otomatis setelah tidak aktif.
                Daftar di bawah hanya menampilkan perangkat dengan sesi yang masih aktif.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadSessions()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
              Refresh
            </button>
          </div>

          {demoMode ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              Mode demo fallback memakai perangkat simulasi. Data perangkat asli tersedia saat Supabase production aktif.
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Memuat perangkat login...</div>
          ) : (
            <div className="space-y-3">
              {sessions.length === 0 ? (
                <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Belum ada sesi aktif yang tercatat.</div>
              ) : null}
              {sessions.map((session) => {
                const active = session.status === "active";

                return (
                  <div key={session.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          <Laptop className="size-5" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-950">{session.deviceLabel}</p>
                            {session.current ? <StatusPill tone="emerald">Perangkat ini</StatusPill> : null}
                            <StatusPill tone="emerald">Aktif</StatusPill>
                            {session.rememberMe ? <StatusPill tone="cyan">Tetap login</StatusPill> : <StatusPill tone="amber">Idle timeout</StatusPill>}
                          </div>
                          <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">IP</dt>
                              <dd>{session.ipAddress ?? "Tidak tersedia"}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Lokasi</dt>
                              <dd>{session.location ?? "Tidak tersedia"}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Terakhir aktif</dt>
                              <dd>{formatSessionDate(session.lastSeenAt)}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Kadaluarsa</dt>
                              <dd>{session.rememberMe ? "Persistent" : formatSessionDate(session.expiresAt)}</dd>
                            </div>
                          </dl>
                          {session.userAgent ? (
                            <p className="mt-3 break-words rounded-lg bg-slate-50 p-2 text-xs text-slate-500">{session.userAgent}</p>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void revokeSession(session)}
                        disabled={!active || revokingId === session.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Power className="size-4" aria-hidden />
                        {session.current ? "Logout perangkat ini" : "Force logout"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function OnboardingSettingsPanel({
  workspace,
  pending,
  applyTemplate,
  createBusinessFromSettings,
}: SettingsPanelProps) {
  const defaultOwner = workspace.user.name || workspace.business.ownerName;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Setup & Onboarding</h2>
        <p className="mt-1 text-sm text-slate-500">Apply template awal atau buat tenant bisnis baru tanpa keluar dari halaman Pengaturan.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <form action={applyTemplate} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">Apply template ke bisnis aktif</h3>
          <p className="mt-1 text-sm text-slate-500">Template mengatur modul aktif, lokasi awal, dan perilaku produk default.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <SelectField name="templateId" label="Template industri" defaultValue={canonicalIndustryTemplateId(workspace.business.industry)}>
              <option value="umkm">UMKM</option>
              <option value="general">General</option>
            </SelectField>
            <ActionButton disabled={pending}>Apply template</ActionButton>
          </div>
        </form>

        <form action={createBusinessFromSettings} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">Buat bisnis baru</h3>
          <p className="mt-1 text-sm text-slate-500">Dipakai saat owner mengelola lebih dari satu usaha/cabang legal.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextField name="displayName" label="Nama display" defaultValue="Bisnis Baru" required />
            <TextField name="legalName" label="Nama legal" defaultValue="CV Bisnis Baru" required />
            <TextField name="ownerName" label="Nama owner" defaultValue={defaultOwner} required />
            <TextField name="taxId" label="NPWP" />
            <SelectField name="industry" label="Template industri" defaultValue="general">
              <option value="umkm">UMKM</option>
              <option value="general">General</option>
            </SelectField>
            <div className="flex items-end">
              <ActionButton disabled={pending}>Buat bisnis</ActionButton>
            </div>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-700">Setup otomatis</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            "Chart of accounts UMKM",
            "Periode laporan aktif",
            "Profil pajak awal",
            "Gudang/lokasi default",
            "Modul sesuai template",
            "Raw transaction layer",
          ].map((item) => (
            <div key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SettingsPremium({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request, loading, demoMode, demoAccount, setActiveBusinessId, refreshWorkspace } = useErpWorkspace(initialWorkspace);
  const [activeTab, setActiveTab] = useState<SettingsTab>("overview");
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory | null>(null);
  const [pending, setPending] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "business", label: "Bisnis" },
    { id: "team", label: "Team" },
    { id: "data", label: "Master Data" },
    { id: "security", label: "Security" },
    { id: "integrations", label: "Integrasi" },
  ];
  const canManageUsers = workspace.permissions.includes("admin:manage_users");

  const categories: CategoryCard[] = useMemo(() => [
    { id: "business", tab: "business", title: "Profil Bisnis", description: "Nama, industri, NPWP, periode", icon: Building2 },
    { id: "tax", tab: "business", title: "Profil Pajak", description: "PPh UMKM dan Coretax", icon: FileText, count: workspace.taxProfile ? 1 : 0 },
    { id: "team", tab: "team", title: "Team & Akses", description: "Invite member dan role akses", icon: Users, count: (workspace.members?.length ?? 0) + workspace.memberInvites.length },
    { id: "customers", tab: "data", title: "Customers", description: "Master data pelanggan", icon: CreditCard, count: workspace.customers.length },
    { id: "suppliers", tab: "data", title: "Suppliers", description: "Master data supplier", icon: ShoppingBag, count: workspace.suppliers.length },
    { id: "warehouses", tab: "data", title: "Warehouses", description: "Gudang dan lokasi stok", icon: Warehouse, count: workspace.warehouses.length },
    { id: "locations", tab: "data", title: "Lokasi/Cabang", description: "Branch, outlet, store", icon: MapPin, count: workspace.locations.length },
    { id: "onboarding", tab: "business", title: "Setup & Onboarding", description: "Apply template atau buat bisnis baru", icon: Settings },
    { id: "security", tab: "security", title: "Security", description: "Device login, password, dan force logout", icon: Shield },
    { id: "integrations", tab: "integrations", title: "Integrasi", description: "Supabase dan modul aktif", icon: Globe },
  ], [workspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const logoUrl = workspace.business.logoUrl;

      if (!logoUrl) {
        setLogoPreviewUrl(null);
        return;
      }

      if (logoUrl.startsWith("data:") || logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
        setLogoPreviewUrl(logoUrl);
        return;
      }

      void request<{ signedUrl: string | null }>(`/api/erp/business-logo/view?path=${encodeURIComponent(logoUrl)}`)
        .then((body) => setLogoPreviewUrl(body.signedUrl))
        .catch(() => setLogoPreviewUrl(null));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [request, workspace.business.logoUrl]);

  async function postObject(endpoint: string, payload: Record<string, unknown>, method: "POST" | "PATCH" | "DELETE" = "POST") {
    const body = await request<{ workspace?: ErpWorkspace; invite?: unknown; member?: unknown }>(endpoint, {
      method,
      body: JSON.stringify(payload),
    });
    if (body.workspace) setWorkspace(body.workspace);
    return body;
  }

  async function saveMaster(
    resource: string,
    values: Record<string, unknown>,
    id?: string,
    description?: string,
  ) {
    setPending(true);

    try {
      await postObject("/api/erp/master-data", { resource, id, values });
      notify.success(`${resourceLabel(resource)} disimpan`, { description });
    } catch (caught) {
      notify.error(`${resourceLabel(resource)} gagal disimpan`, { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  async function updateMasterStatus(resource: string, ids: string[], isActive: boolean) {
    setPending(true);

    try {
      await postObject("/api/erp/master-data", { resource, ids, isActive }, "PATCH");
      notify.info(
        `${resourceLabel(resource)} ${isActive ? "diaktifkan kembali" : "dinonaktifkan"}`,
        { description: `${ids.length} data diproses.` },
      );
    } catch (caught) {
      notify.error(`${resourceLabel(resource)} gagal diperbarui`, { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  function saveBusiness(formData: FormData) {
    void saveMaster("business", {
      displayName: String(formData.get("displayName")),
      legalName: String(formData.get("legalName")),
      ownerName: String(formData.get("ownerName")),
      industry: String(formData.get("industry")),
      taxId: String(formData.get("taxId")),
      logoUrl: String(formData.get("logoUrl") || workspace.business.logoUrl || ""),
      periodStartMonth: Number(formData.get("periodStartMonth")),
    }, undefined, `Industri: ${industryLabels[String(formData.get("industry"))] ?? String(formData.get("industry"))}`);
  }

  async function uploadBusinessLogo(file: File) {
    setLogoUploading(true);

    try {
      if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
        throw new Error("Logo harus berupa PNG, JPG, WEBP, atau SVG.");
      }

      if (file.size > 2_000_000) {
        throw new Error("Ukuran logo maksimal 2 MB.");
      }

      const previewUrl = await fileToDataUrl(file);
      setLogoPreviewUrl(previewUrl);

      let logoUrl = previewUrl;

      if (!demoMode) {
        const signedUpload = await request<{
          bucket: string;
          storagePath: string;
          uploadToken: string;
          token?: string;
        }>("/api/erp/business-logo/signed-upload", {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });
        const uploadToken = signedUpload.uploadToken ?? signedUpload.token;

        if (!uploadToken) {
          throw new Error("Upload token logo tidak tersedia.");
        }

        const supabase = createBrowserSupabaseClient();
        const { error: uploadError } = await supabase.storage
          .from(signedUpload.bucket)
          .uploadToSignedUrl(signedUpload.storagePath, uploadToken, file);

        if (uploadError) {
          throw uploadError;
        }

        logoUrl = signedUpload.storagePath;
      }

      await postObject("/api/erp/master-data", {
        resource: "business",
        values: {
          displayName: workspace.business.displayName,
          legalName: workspace.business.legalName,
          ownerName: workspace.business.ownerName,
          industry: canonicalIndustryTemplateId(workspace.business.industry),
          taxId: workspace.business.taxId ?? "",
          logoUrl,
          periodStartMonth: workspace.business.periodStartMonth,
        },
      });
      notify.success("Logo bisnis disimpan");
    } catch (caught) {
      notify.error("Logo bisnis gagal diunggah", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setLogoUploading(false);
    }
  }

  function saveTax(formData: FormData) {
    void saveMaster("tax_profile", {
      taxpayerType: String(formData.get("taxpayerType")),
      usesFinalUmkmRate: String(formData.get("usesFinalUmkmRate")) === "true",
      finalUmkmRate: Number(formData.get("finalUmkmRate")),
      coretaxStatus: String(formData.get("coretaxStatus")),
    });
  }

  async function saveMember(formData: FormData) {
    setPending(true);

    try {
      const body = await postObject("/api/erp/members", {
        email: String(formData.get("email") || "") || undefined,
        memberId: String(formData.get("memberId") || "") || undefined,
        role: String(formData.get("role")),
        accessScope: String(formData.get("accessScope") || "role"),
        permissions: formData.getAll("permissions").map(String),
        locationIds: formData.getAll("locationIds").map(String),
      });
      notify.success(body.invite ? "Invite anggota dikirim" : "Akses anggota disimpan", {
        description: body.invite
          ? "Email invite sudah dikirim. Staff akan aktif setelah membuka email dan login."
          : body.member
            ? "Email sudah terdaftar, jadi anggota langsung ditambahkan."
            : "Role, menu, dan cabang anggota telah diperbarui.",
      });
      return true;
    } catch (caught) {
      notify.error("Akses anggota gagal disimpan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
      return false;
    } finally {
      setPending(false);
    }
  }

  async function deleteMember(memberId: string) {
    if (!window.confirm("Hapus akses anggota ini dari bisnis?")) return;
    setPending(true);

    try {
      await postObject("/api/erp/members", { memberId }, "DELETE");
      notify.info("Anggota dihapus", { description: "Akses bisnis dan sesi aktif anggota tersebut dicabut." });
    } catch (caught) {
      notify.error("Anggota gagal dihapus", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  async function cancelInvite(inviteId: string) {
    if (!window.confirm("Batalkan invite pending ini?")) return;
    setPending(true);

    try {
      await postObject("/api/erp/members", { inviteId }, "DELETE");
      notify.info("Invite dibatalkan", { description: "Staff tidak akan mendapat akses dari invite tersebut." });
    } catch (caught) {
      notify.error("Invite gagal dibatalkan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  async function resendInvite(inviteId: string) {
    setPending(true);

    try {
      const body = await postObject("/api/erp/members", { inviteId }, "PATCH");
      notify.success(body.member ? "Anggota diaktifkan" : "Invite dikirim ulang", {
        description: body.member
          ? "Email tersebut sudah terdaftar, jadi akses anggota langsung aktif."
          : "Email invite baru sudah dikirim.",
      });
    } catch (caught) {
      notify.error("Invite gagal dikirim ulang", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  async function saveLocation(formData: FormData) {
    setPending(true);

    try {
      await postObject("/api/erp/locations", {
        code: String(formData.get("code")),
        name: String(formData.get("name")),
        type: String(formData.get("type")),
        warehouseId: String(formData.get("warehouseId")),
        isActive: true,
      });
      notify.success("Lokasi disimpan");
    } catch (caught) {
      notify.error("Lokasi gagal disimpan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  function saveWarehouse(formData: FormData) {
    void saveMaster("warehouse", {
      code: String(formData.get("code")),
      name: String(formData.get("name")),
      location: String(formData.get("location")),
      isActive: true,
    });
  }

  async function applyTemplate(formData: FormData) {
    setPending(true);

    try {
      await postObject("/api/erp/templates/apply", {
        templateId: String(formData.get("templateId")),
      });
      notify.success("Template diterapkan ke bisnis aktif");
    } catch (caught) {
      notify.error("Template gagal diterapkan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  async function createBusinessFromSettings(formData: FormData) {
    setPending(true);

    try {
      const body = await request<{ businessId: string }>("/api/erp/businesses", {
        method: "POST",
        businessId: null,
        body: JSON.stringify({
          legalName: String(formData.get("legalName")),
          displayName: String(formData.get("displayName")),
          industry: String(formData.get("industry")),
          ownerName: String(formData.get("ownerName")),
          taxId: String(formData.get("taxId")),
        }),
      });

      if (body.businessId) {
        setActiveBusinessId(body.businessId);
        await syncServerSession(body.businessId);
        await refreshWorkspace();
      }

      notify.success(demoMode ? "Demo mode aktif" : "Bisnis baru dibuat", {
        description: demoMode ? "Bisnis demo digunakan." : "Setup awal sudah dijalankan.",
      });
    } catch (caught) {
      notify.error("Bisnis baru gagal dibuat", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setPending(false);
    }
  }

  const panelProps: SettingsPanelProps = {
    workspace,
    pending,
    saveBusiness,
    saveTax,
    saveMember,
    deleteMember,
    cancelInvite,
    resendInvite,
    saveLocation,
    saveWarehouse,
    saveMaster,
    updateMasterStatus,
    applyTemplate,
    createBusinessFromSettings,
    uploadBusinessLogo,
    logoPreviewUrl,
    logoUploading,
  };

  const visibleTabs = tabs.filter((tab) => tab.id !== "team" || canManageUsers);
  const visibleCategories = (activeTab === "overview" ? categories : categories.filter((category) => category.tab === activeTab)).filter((category) => category.id !== "team" || canManageUsers);

  function renderContent() {
    if (!selectedCategory) {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Pusat Pengaturan</h2>
            <p className="mt-1 text-sm text-slate-500">Kelola konfigurasi bisnis, akses, master data, lokasi, dan integrasi dari satu halaman.</p>
          </div>
          <CategoryGrid categories={visibleCategories} onSelect={setSelectedCategory} />
        </div>
      );
    }

    if (selectedCategory === "business") return <BusinessProfilePanel {...panelProps} />;
    if (selectedCategory === "tax") return <TaxProfilePanel {...panelProps} />;
    if (selectedCategory === "team") return canManageUsers ? <MembersPanel {...panelProps} /> : <p className="text-sm text-slate-600">Anda tidak memiliki akses untuk mengatur anggota.</p>;
    if (selectedCategory === "customers") return <MasterDataPanel {...panelProps} type="customers" />;
    if (selectedCategory === "suppliers") return <MasterDataPanel {...panelProps} type="suppliers" />;
    if (selectedCategory === "warehouses") return <MasterDataPanel {...panelProps} type="warehouses" />;
    if (selectedCategory === "locations") return <LocationsPanel {...panelProps} />;
    if (selectedCategory === "onboarding") return <OnboardingSettingsPanel {...panelProps} />;
    if (selectedCategory === "security") return <SecurityPanel />;
    return <IntegrationsPanel workspace={workspace} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Pengaturan</h1>
          <p className="mt-1 text-sm text-slate-500">{workspace.business.displayName}</p>
        </div>
        {loading ? <StatusPill tone="amber">Memuat production data</StatusPill> : null}
      </div>

      {demoMode || demoAccount ? (
        <div className={cn("flex items-center gap-3 rounded-xl border p-4", demoMode ? "border-amber-200 bg-amber-50" : "border-cyan-200 bg-cyan-50")}>
          <div className={cn("rounded-lg p-2", demoMode ? "bg-amber-100" : "bg-cyan-100")}>
            <Shield className={cn("size-5", demoMode ? "text-amber-600" : "text-cyan-600")} aria-hidden />
          </div>
          <div>
            <p className={cn("font-medium", demoMode ? "text-amber-800" : "text-cyan-800")}>
              {demoMode ? "Mode fallback aktif" : "Akun demo Supabase aktif"}
            </p>
            <p className={cn("text-xs", demoMode ? "text-amber-600" : "text-cyan-600")}>
              {demoMode ? "Data tidak tersimpan permanen. Hubungkan Supabase untuk persistensi." : "Data tersimpan di sandbox Supabase dan akan di-reset sesuai jadwal demo."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedCategory(null);
              }}
              className={cn(
                "relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id ? "text-slate-950" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {tab.label}
              {activeTab === tab.id ? <span className="absolute inset-x-0 bottom-0 mx-4 h-0.5 rounded-full bg-slate-950" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {selectedCategory ? (
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {"<-"} Kembali ke overview
          </button>
        ) : null}
        {renderContent()}
      </div>
    </div>
  );
}
