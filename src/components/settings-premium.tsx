"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  CreditCard,
  Database,
  FileText,
  Globe,
  ImageIcon,
  MapPin,
  Package,
  Settings,
  Shield,
  ShoppingBag,
  Truck,
  Upload,
  Users,
  Warehouse,
} from "lucide-react";
import { ActionButton, SelectField, StatusPill, TextField, cn } from "@/components/ui";
import { FeedbackToast } from "@/components/feedback-toast";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { syncServerSession } from "@/lib/erp/client-api";

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
  | "integrations";

type SettingsTab = "overview" | "business" | "team" | "data" | "integrations";

const industryLabels: Record<string, string> = {
  food_beverage: "F&B ringan",
  retail: "Retail",
  service: "Jasa",
  online_seller: "Online seller",
  general: "General",
};

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

function MembersPanel({ workspace, pending, saveMember }: SettingsPanelProps) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Team & Akses</h2>
        <p className="mt-1 text-sm text-slate-500">Invite anggota, role akses, dan status invite pending.</p>
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

      <form action={saveMember} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <TextField name="email" label="Email invite" type="email" placeholder="finance@usaha.co.id" />
        <TextField name="authUserId" label="Supabase auth user id opsional" placeholder="Isi jika user sudah ada" />
        <SelectField name="role" label="Role">
          <option value="staff">Staff</option>
          <option value="finance_admin">Finance/Admin</option>
          <option value="hr">HR</option>
          <option value="external_advisor">External advisor</option>
          <option value="owner">Owner</option>
        </SelectField>
        <div className="flex items-end">
          <ActionButton disabled={pending}>Invite/update member</ActionButton>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">Pending invites</h3>
        <div className="mt-3 space-y-2">
          {workspace.memberInvites.filter((invite) => invite.status === "pending").map((invite) => (
            <div key={invite.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
              <span className="truncate">{invite.email}</span>
              <StatusPill tone="amber">{invite.role}</StatusPill>
            </div>
          ))}
          {workspace.memberInvites.filter((invite) => invite.status === "pending").length === 0 ? (
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successDescription, setSuccessDescription] = useState<string | null>(null);

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "business", label: "Bisnis" },
    { id: "team", label: "Team" },
    { id: "data", label: "Master Data" },
    { id: "integrations", label: "Integrasi" },
  ];

  const categories: CategoryCard[] = useMemo(() => [
    { id: "business", tab: "business", title: "Profil Bisnis", description: "Nama, industri, NPWP, periode", icon: Building2 },
    { id: "tax", tab: "business", title: "Profil Pajak", description: "PPh UMKM dan Coretax", icon: FileText, count: workspace.taxProfile ? 1 : 0 },
    { id: "team", tab: "team", title: "Team & Akses", description: "Invite member dan role akses", icon: Users, count: workspace.memberInvites.length },
    { id: "customers", tab: "data", title: "Customers", description: "Master data pelanggan", icon: CreditCard, count: workspace.customers.length },
    { id: "suppliers", tab: "data", title: "Suppliers", description: "Master data supplier", icon: ShoppingBag, count: workspace.suppliers.length },
    { id: "products", tab: "data", title: "Products", description: "SKU, harga, stok", icon: Package, count: workspace.products.length },
    { id: "warehouses", tab: "data", title: "Warehouses", description: "Gudang dan lokasi stok", icon: Warehouse, count: workspace.warehouses.length },
    { id: "locations", tab: "data", title: "Lokasi/Cabang", description: "Branch, outlet, store", icon: MapPin, count: workspace.locations.length },
    { id: "onboarding", tab: "business", title: "Setup & Onboarding", description: "Apply template atau buat bisnis baru", icon: Settings },
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
    const body = await request<{ workspace?: ErpWorkspace; invite?: unknown }>(endpoint, {
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
    setError(null);
    setSuccess(null);
    setSuccessDescription(null);

    try {
      await postObject("/api/erp/master-data", { resource, id, values });
      setSuccess(`${resource} disimpan.`);
      setSuccessDescription(description ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${resource} gagal disimpan.`);
    } finally {
      setPending(false);
    }
  }

  async function archiveMaster(resource: string, id: string) {
    setPending(true);
    setError(null);
    setSuccess(null);
    setSuccessDescription(null);

    try {
      await postObject("/api/erp/master-data", { resource, id }, "DELETE");
      setSuccess(`${resource} dinonaktifkan.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${resource} gagal dinonaktifkan.`);
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
    setError(null);
    setSuccess(null);
    setSuccessDescription(null);

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
      setSuccess("Logo bisnis disimpan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Logo bisnis gagal diunggah.");
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
    setError(null);
    setSuccess(null);
    setSuccessDescription(null);

    try {
      const body = await postObject("/api/erp/members", {
        email: String(formData.get("email") || "") || undefined,
        authUserId: String(formData.get("authUserId") || "") || undefined,
        role: String(formData.get("role")),
      });
      setSuccess(body.invite ? "Invite email dibuat dan menunggu diterima." : "Member bisnis disimpan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Member gagal disimpan.");
    } finally {
      setPending(false);
    }
  }

  async function saveLocation(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);
    setSuccessDescription(null);

    try {
      await postObject("/api/erp/locations", {
        code: String(formData.get("code")),
        name: String(formData.get("name")),
        type: String(formData.get("type")),
        warehouseId: String(formData.get("warehouseId")),
        isActive: true,
      });
      setSuccess("Lokasi disimpan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lokasi gagal disimpan.");
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
    setError(null);
    setSuccess(null);
    setSuccessDescription(null);

    try {
      await postObject("/api/erp/templates/apply", {
        templateId: String(formData.get("templateId")),
      });
      setSuccess("Template diterapkan ke bisnis aktif.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Template gagal diterapkan.");
    } finally {
      setPending(false);
    }
  }

  async function createBusinessFromSettings(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);
    setSuccessDescription(null);

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

      setSuccess(demoMode ? "Demo mode aktif; bisnis demo digunakan." : "Bisnis baru dibuat dan setup awal dijalankan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Bisnis baru gagal dibuat.");
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

  const visibleCategories = activeTab === "overview" ? categories : categories.filter((category) => category.tab === activeTab);

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
    if (selectedCategory === "team") return <MembersPanel {...panelProps} />;
    if (selectedCategory === "customers") return <MasterDataPanel {...panelProps} type="customers" />;
    if (selectedCategory === "suppliers") return <MasterDataPanel {...panelProps} type="suppliers" />;
    if (selectedCategory === "products") return <MasterDataPanel {...panelProps} type="products" />;
    if (selectedCategory === "warehouses") return <MasterDataPanel {...panelProps} type="warehouses" />;
    if (selectedCategory === "locations") return <LocationsPanel {...panelProps} />;
    if (selectedCategory === "onboarding") return <OnboardingSettingsPanel {...panelProps} />;
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

      <FeedbackToast error={error} success={success} successDescription={successDescription} />

      <div className="border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
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
