"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  CreditCard,
  Database,
  FileText,
  Globe,
  ImageIcon,
  Laptop,
  MapPin,
  Package,
  Power,
  RefreshCw,
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
import type { ErpWorkspace } from "@/lib/erp/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { permissionCatalog } from "@/lib/security/permissions";
import { clearServerSession, syncServerSession } from "@/lib/erp/client-api";
import { notify } from "@/lib/notify";

type SettingsCategory =
  | "business"
  | "tax"
  | "team"
  | "customers"
  | "suppliers"
  | "products"
  | "warehouses"
  | "locations"
  | "onboarding"
  | "security"
  | "integrations";

type SettingsTab = "overview" | "business" | "team" | "data" | "security" | "integrations";

const industryLabels: Record<string, string> = {
  food_beverage: "F&B ringan",
  retail: "Retail",
  service: "Jasa",
  online_seller: "Online seller",
  general: "General",
};

const resourceLabels: Record<string, string> = {
  business: "Profil bisnis",
  tax_profile: "Profil pajak",
  customer: "Pelanggan",
  supplier: "Supplier",
  product: "Produk",
  warehouse: "Gudang",
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
  saveMember: (formData: FormData) => void;
  deleteMember: (memberId: string) => Promise<void>;
  cancelInvite: (inviteId: string) => Promise<void>;
  resendInvite: (inviteId: string) => Promise<void>;
  saveLocation: (formData: FormData) => void;
  saveWarehouse: (formData: FormData) => void;
  saveMaster: (resource: string, values: Record<string, unknown>, id?: string) => Promise<void>;
  archiveMaster: (resource: string, id: string) => Promise<void>;
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
          <SelectField name="industry" label="Industri" defaultValue={workspace.business.industry}>
            <option value="retail">Retail</option>
            <option value="food_beverage">F&B</option>
            <option value="service">Jasa</option>
            <option value="online_seller">Online seller</option>
            <option value="manufacturing">Manufacturing</option>
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
  const members = workspace.members ?? [];
  const editingMember = members.find((member) => member.id === editingMemberId);
  const pendingInvites = workspace.memberInvites.filter((invite) => invite.status === "pending");

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Team & Akses</h2>
        <p className="mt-1 text-sm text-slate-500">Atur menu dan cabang untuk anggota aktif, atau buat invite baru dengan akses yang sudah ditentukan.</p>
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

      <form key={editingMember?.id ?? "new-member"} action={saveMember} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-semibold text-slate-900">{editingMember ? "Ubah akses anggota" : "Invite anggota baru"}</h3>
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
        <SelectField name="role" label="Role" defaultValue={editingMember?.role ?? "staff"}>
          <option value="staff">Staff</option>
          <option value="finance_admin">Finance/Admin</option>
          <option value="hr">HR</option>
          <option value="external_advisor">External advisor</option>
          <option value="owner">Owner</option>
        </SelectField>
        <SelectField name="accessScope" label="Mode akses" defaultValue={editingMember?.accessScope ?? "role"}>
          <option value="custom">Akses spesifik</option>
          <option value="role">Ikuti role bawaan</option>
        </SelectField>
        <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-800">Menu yang diizinkan</p>
          <p className="mt-1 text-xs text-slate-500">Pilih akses spesifik untuk karyawan cabang, HR, atau finance. Owner selalu memakai akses penuh.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {permissionCatalog.map((entry) => <label key={entry.permission} className="flex gap-2 rounded-lg border border-slate-100 p-2 text-sm"><input name="permissions" value={entry.permission} type="checkbox" defaultChecked={editingMember?.accessScope === "custom" && editingMember.accessPermissions.includes(entry.permission)} className="mt-0.5 size-4" /><span><strong className="block text-slate-800">{entry.label}</strong><span className="text-xs text-slate-500">{entry.description}</span></span></label>)}
          </div>
        </div>
        <label className="sm:col-span-2 text-sm font-medium text-slate-700">Cabang yang ditugaskan<select name="locationIds" multiple defaultValue={editingMember?.locationIds ?? []} className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm">{workspace.locations.filter((location) => ["branch", "outlet", "store"].includes(location.type) && location.isActive).map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Gunakan Ctrl/Cmd untuk memilih beberapa cabang. Akses POS spesifik harus memiliki minimal satu cabang.</span></label>
        <div className="flex items-end gap-2">
          <ActionButton disabled={pending}>{editingMember ? "Simpan akses anggota" : "Kirim invite"}</ActionButton>
          {editingMember ? <button type="button" onClick={() => setEditingMemberId(null)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700">Batal</button> : null}
        </div>
      </form>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">Anggota aktif</h3>
        <p className="mt-1 text-xs text-slate-500">Pilih anggota untuk mengubah role, menu, dan cabang tanpa perlu menyalin ID.</p>
        <div className="mt-3 space-y-2">
          {members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{memberDisplayName(member, workspace)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{memberSecondaryLabel(member, workspace)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone={member.accessScope === "custom" ? "cyan" : "gray"}>{member.role}</StatusPill>
                <button type="button" aria-label={`Ubah akses ${memberDisplayName(member, workspace)}`} onClick={() => setEditingMemberId(member.id)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700">Ubah akses</button>
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
          {members.length === 0 ? <p className="text-sm text-slate-500">Belum ada anggota aktif selain data fallback yang sedang dipakai.</p> : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">Pending invites</h3>
        <div className="mt-3 space-y-2">
          {pendingInvites.map((invite) => (
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
          {pendingInvites.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada invite pending.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CustomerSupplierForm({
  type,
  pending,
  saveMaster,
}: {
  type: "customer" | "supplier";
  pending: boolean;
  saveMaster: SettingsPanelProps["saveMaster"];
}) {
  const label = type === "customer" ? "Customer" : "Supplier";
  const prefix = type === "customer" ? "CUST" : "SUP";
  const [defaultCode] = useState(() => `${prefix}-${Date.now().toString().slice(-4)}`);

  return (
    <form
      action={(formData) =>
        void saveMaster(type, {
          code: String(formData.get("code")),
          name: String(formData.get("name")),
          phone: String(formData.get("phone")),
          email: String(formData.get("email")),
          address: String(formData.get("address")),
          creditLimit: type === "customer" ? Number(formData.get("creditLimit")) : 0,
          isActive: true,
        })
      }
      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3"
    >
      <TextField name="code" label={`Kode ${label}`} defaultValue={defaultCode} required />
      <TextField name="name" label={`Nama ${label}`} placeholder={`Nama ${label.toLowerCase()}`} required />
      <TextField name="phone" label="Telepon" />
      <TextField name="email" label="Email" type="email" />
      <TextField name="address" label="Alamat" />
      {type === "customer" ? <TextField name="creditLimit" label="Credit limit" type="number" defaultValue={0} /> : null}
      <div className="flex items-end">
        <ActionButton disabled={pending}>Simpan {label}</ActionButton>
      </div>
    </form>
  );
}

function ProductForm({ workspace, pending, saveMaster }: Pick<SettingsPanelProps, "workspace" | "pending" | "saveMaster">) {
  const [defaultSku] = useState(() => `SKU-${Date.now().toString().slice(-5)}`);

  return (
    <form
      action={(formData) => {
        const productType = String(formData.get("productType"));
        void saveMaster("product", {
          sku: String(formData.get("sku")),
          name: String(formData.get("name")),
          productType,
          category: String(formData.get("category")),
          unit: String(formData.get("unit")),
          trackStock: productType === "stock_item",
          defaultWarehouseId: String(formData.get("defaultWarehouseId")),
          sellingPrice: Number(formData.get("sellingPrice")),
          purchasePrice: Number(formData.get("purchasePrice")),
          reorderPoint: Number(formData.get("reorderPoint")),
          isSellable: true,
          isPurchasable: true,
          isActive: true,
        });
      }}
      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3"
    >
      <TextField name="sku" label="SKU" defaultValue={defaultSku} required />
      <TextField name="name" label="Nama produk" placeholder="Nama produk/jasa" required />
      <SelectField name="productType" label="Tipe">
        <option value="stock_item">Stock item</option>
        <option value="non_stock_item">Non-stock item</option>
        <option value="service">Service</option>
        <option value="bundle">Bundle</option>
      </SelectField>
      <TextField name="category" label="Kategori" defaultValue="Umum" />
      <TextField name="unit" label="Satuan" defaultValue="pcs" />
      <SelectField name="defaultWarehouseId" label="Gudang default">
        {workspace.warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
        ))}
      </SelectField>
      <TextField name="sellingPrice" label="Harga jual" type="number" defaultValue={0} />
      <TextField name="purchasePrice" label="Harga beli" type="number" defaultValue={0} />
      <TextField name="reorderPoint" label="Reorder point" type="number" defaultValue={0} />
      <div className="flex items-end">
        <ActionButton disabled={pending}>Simpan produk</ActionButton>
      </div>
    </form>
  );
}

function WarehouseForm({ pending, saveWarehouse }: Pick<SettingsPanelProps, "pending" | "saveWarehouse">) {
  const [defaultCode] = useState(() => `WH-${Date.now().toString().slice(-4)}`);

  return (
    <form action={saveWarehouse} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
      <TextField name="code" label="Kode gudang" defaultValue={defaultCode} required />
      <TextField name="name" label="Nama gudang" placeholder="Gudang utama" required />
      <TextField name="location" label="Lokasi" placeholder="Alamat/lokasi" />
      <div className="flex items-end">
        <ActionButton disabled={pending}>Simpan gudang</ActionButton>
      </div>
    </form>
  );
}

function MasterDataPanel({
  workspace,
  pending,
  saveMaster,
  saveWarehouse,
  archiveMaster,
  type,
}: Pick<SettingsPanelProps, "workspace" | "pending" | "saveMaster" | "saveWarehouse" | "archiveMaster"> & {
  type: "customers" | "suppliers" | "products" | "warehouses";
}) {
  const config = {
    customers: {
      title: "Customers",
      icon: Users,
      rows: workspace.customers.map((item) => ({
        id: item.id,
        cells: [item.code, item.name, item.phone ?? "-", item.email ?? "-"],
        active: item.isActive,
      })),
      columns: ["Kode", "Nama", "Telepon", "Email"],
      resource: "customer",
    },
    suppliers: {
      title: "Suppliers",
      icon: Truck,
      rows: workspace.suppliers.map((item) => ({
        id: item.id,
        cells: [item.code, item.name, item.phone ?? "-", item.email ?? "-"],
        active: item.isActive,
      })),
      columns: ["Kode", "Nama", "Telepon", "Email"],
      resource: "supplier",
    },
    products: {
      title: "Products",
      icon: Package,
      rows: workspace.products.map((item) => ({
        id: item.id,
        cells: [item.sku, item.name, item.category, item.productType],
        active: item.isActive !== false,
      })),
      columns: ["SKU", "Nama", "Kategori", "Tipe"],
      resource: "product",
    },
    warehouses: {
      title: "Warehouses",
      icon: Warehouse,
      rows: workspace.warehouses.map((item) => ({
        id: item.id,
        cells: [item.code, item.name, item.location ?? "-"],
        active: item.isActive,
      })),
      columns: ["Kode", "Nama", "Lokasi"],
      resource: "warehouse",
    },
  }[type];
  const Icon = config.icon;

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-100 p-3">
          <Icon className="size-6 text-slate-600" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{config.title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{config.rows.length} item aktif/nonaktif.</p>
        </div>
      </div>

      {type === "customers" ? <CustomerSupplierForm type="customer" pending={pending} saveMaster={saveMaster} /> : null}
      {type === "suppliers" ? <CustomerSupplierForm type="supplier" pending={pending} saveMaster={saveMaster} /> : null}
      {type === "products" ? <ProductForm workspace={workspace} pending={pending} saveMaster={saveMaster} /> : null}
      {type === "warehouses" ? <WarehouseForm pending={pending} saveWarehouse={saveWarehouse} /> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="mobile-card-table w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {config.columns.map((column) => (
                <th key={column} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{column}</th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {config.rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}-${index}`} data-mobile-label={config.columns[index]} className="px-4 py-3">{cell}</td>
                ))}
                <td data-mobile-label="Status" className="px-4 py-3">
                  <StatusPill tone={row.active ? "emerald" : "gray"}>{row.active ? "active" : "inactive"}</StatusPill>
                </td>
                <td data-mobile-label="Aksi" className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void archiveMaster(config.resource, row.id)}
                    disabled={pending || !row.active}
                    className="text-sm font-medium text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Nonaktifkan
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {config.rows.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">Belum ada data.</div> : null}
      </div>
    </section>
  );
}

function LocationsPanel({ workspace, pending, saveLocation }: SettingsPanelProps) {
  const [defaultCode] = useState(() => `LOC-${Date.now().toString().slice(-4)}`);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Lokasi & Cabang</h2>
        <p className="mt-1 text-sm text-slate-500">Cabang, outlet, store, workshop, dan mapping gudang operasional.</p>
      </div>

      <form action={saveLocation} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <TextField name="code" label="Kode lokasi" defaultValue={defaultCode} required />
        <TextField name="name" label="Nama lokasi" placeholder="Outlet utama" required />
        <SelectField name="type" label="Tipe">
          <option value="branch">Branch</option>
          <option value="outlet">Outlet</option>
          <option value="store">Store</option>
          <option value="warehouse">Warehouse</option>
          <option value="workshop">Workshop</option>
          <option value="office">Office</option>
        </SelectField>
        <SelectField name="warehouseId" label="Gudang terkait">
          {workspace.warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
          ))}
        </SelectField>
        <div className="sm:col-span-2">
          <ActionButton disabled={pending}>Simpan lokasi</ActionButton>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        {workspace.locations.map((location) => (
          <div key={location.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{location.name}</p>
                <p className="mt-1 text-sm text-slate-500">{location.code}</p>
              </div>
              <StatusPill tone={location.isActive ? "emerald" : "gray"}>{location.type}</StatusPill>
            </div>
          </div>
        ))}
      </div>
    </section>
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
        await createBrowserSupabaseClient().auth.signOut().catch(() => undefined);
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
            Kelola perangkat yang sedang dipakai dan sesi aktif lain. Riwayat login yang sudah keluar atau kedaluwarsa tidak ditampilkan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSessions()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="size-4" aria-hidden />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-950">Timeout sesi</p>
        <p className="mt-1 text-sm text-slate-600">
          Jika opsi <span className="font-medium">Tetap login</span> tidak dicentang saat login, sesi akan berakhir otomatis setelah tidak aktif.
          Daftar di bawah hanya menampilkan perangkat dengan sesi yang masih aktif.
        </p>
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
            <SelectField name="templateId" label="Template industri" defaultValue={workspace.business.industry}>
              <option value="food_beverage">F&B ringan</option>
              <option value="retail">Retail</option>
              <option value="service">Jasa</option>
              <option value="online_seller">Online seller</option>
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
              <option value="food_beverage">F&B ringan</option>
              <option value="retail">Retail</option>
              <option value="service">Jasa</option>
              <option value="online_seller">Online seller</option>
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
    { id: "products", tab: "data", title: "Products", description: "SKU, harga, stok", icon: Package, count: workspace.products.length },
    { id: "warehouses", tab: "data", title: "Warehouses", description: "Gudang dan lokasi stok", icon: Warehouse, count: workspace.warehouses.length },
    { id: "locations", tab: "data", title: "Lokasi/Cabang", description: "Branch, outlet, store", icon: MapPin, count: workspace.locations.length },
    { id: "onboarding", tab: "business", title: "Setup & Onboarding", description: "Apply template atau buat bisnis baru", icon: Settings },
    { id: "security", tab: "security", title: "Security", description: "Perangkat login dan force logout", icon: Shield },
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

  async function archiveMaster(resource: string, id: string) {
    setPending(true);

    try {
      await postObject("/api/erp/master-data", { resource, id }, "DELETE");
      notify.info(`${resourceLabel(resource)} dinonaktifkan`);
    } catch (caught) {
      notify.error(`${resourceLabel(resource)} gagal dinonaktifkan`, { description: caught instanceof Error ? caught.message : "Coba lagi." });
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
          industry: workspace.business.industry,
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
    } catch (caught) {
      notify.error("Akses anggota gagal disimpan", { description: caught instanceof Error ? caught.message : "Coba lagi." });
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
    archiveMaster,
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
    if (selectedCategory === "products") return <MasterDataPanel {...panelProps} type="products" />;
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
