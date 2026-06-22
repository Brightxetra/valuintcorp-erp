import type { BusinessRole } from "@/lib/domain/types";

export type Permission =
  | "business:read"
  | "business:update"
  | "accounting:read"
  | "accounting:write"
  | "reports:export"
  | "inventory:manage"
  | "hr:manage"
  | "payroll:run"
  | "tax:prepare"
  | "admin:manage_users"
  | "pos:read"
  | "pos:sell"
  | "pos:expenses";

export const permissionCatalog: ReadonlyArray<{
  permission: Permission;
  label: string;
  description: string;
}> = [
  { permission: "business:read", label: "Dashboard & pengaturan", description: "Melihat ringkasan bisnis dan pengaturan umum." },
  { permission: "business:update", label: "Ubah bisnis", description: "Mengubah profil bisnis, lokasi, dan master umum." },
  { permission: "accounting:read", label: "Keuangan", description: "Melihat jurnal dan dokumen keuangan." },
  { permission: "accounting:write", label: "Transaksi", description: "Membuat invoice, tagihan, kas, dan jurnal." },
  { permission: "reports:export", label: "Laporan", description: "Melihat dan mengekspor laporan keuangan." },
  { permission: "inventory:manage", label: "Stok & harga", description: "Mengelola stok, transfer, dan daftar harga." },
  { permission: "hr:manage", label: "Karyawan", description: "Mengelola data karyawan dan BPJS." },
  { permission: "payroll:run", label: "Payroll", description: "Menjalankan dan memproses penggajian." },
  { permission: "tax:prepare", label: "Pajak", description: "Mengelola kesiapan dan dokumen pajak." },
  { permission: "admin:manage_users", label: "Team & akses", description: "Mengundang anggota dan mengatur akses." },
  { permission: "pos:read", label: "POS cabang", description: "Melihat POS dan rekap cabang yang ditugaskan." },
  { permission: "pos:sell", label: "Input penjualan POS", description: "Mencatat penjualan tunai/QRIS cabang." },
  { permission: "pos:expenses", label: "Biaya cabang", description: "Mencatat biaya operasional cabang." },
] as const;

const permissionsByRole: Record<BusinessRole, Permission[]> = {
  owner: [
    "business:read",
    "business:update",
    "accounting:read",
    "accounting:write",
    "reports:export",
    "inventory:manage",
    "hr:manage",
    "payroll:run",
    "tax:prepare",
    "admin:manage_users",
    "pos:read",
    "pos:sell",
    "pos:expenses",
  ],
  finance_admin: [
    "business:read",
    "accounting:read",
    "accounting:write",
    "reports:export",
    "inventory:manage",
    "tax:prepare",
    "pos:read",
  ],
  staff: ["business:read", "accounting:write", "inventory:manage"],
  hr: ["business:read", "hr:manage", "payroll:run", "reports:export"],
  external_advisor: ["business:read", "accounting:read", "reports:export", "tax:prepare"],
  system_admin: [
    "business:read",
    "business:update",
    "accounting:read",
    "accounting:write",
    "reports:export",
    "inventory:manage",
    "hr:manage",
    "payroll:run",
    "tax:prepare",
    "admin:manage_users",
    "pos:read",
    "pos:sell",
    "pos:expenses",
  ],
};

export function can(role: BusinessRole, permission: Permission): boolean {
  return permissionsByRole[role].includes(permission);
}

export function permissionsForRole(role: BusinessRole): Permission[] {
  return [...permissionsByRole[role]];
}

export function permissionsForMember(
  role: BusinessRole,
  accessScope: "role" | "custom" | undefined,
  accessPermissions: readonly string[] | undefined,
): Permission[] {
  if (role === "owner" || role === "system_admin" || accessScope !== "custom") {
    return permissionsForRole(role);
  }

  const knownPermissions = new Set(permissionCatalog.map(({ permission }) => permission));
  const resolved = (accessPermissions ?? []).filter((permission): permission is Permission => knownPermissions.has(permission as Permission));
  if ((resolved.includes("pos:sell") || resolved.includes("pos:expenses")) && !resolved.includes("pos:read")) {
    resolved.push("pos:read");
  }
  return resolved;
}

export function assertCan(role: BusinessRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`${role} is not allowed to perform ${permission}.`);
  }
}
