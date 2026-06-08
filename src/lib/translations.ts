/**
 * Terjemahan Istilah Teknis ke Bahasa Indonesia Sehari-hari
 * Ganti semua istilah teknis dengan yang mudah dipahami
 */

// ============================================
// LABEL Navigasi
// ============================================
export const NAV_LABELS = {
  beranda: "Beranda",
  dashboard: "Dashboard",

  // Transaksi
  transaksi: "Transaksi",
  invoicePenjualan: "Invoice Penjualan",
  tagihanSupplier: "Tagihan Supplier",
  kasBank: "Kas & Bank",

  // Produk
  produk: "Produk",
  stokPersediaan: "Stok & Persediaan",
  daftarHarga: "Daftar Harga",

  // Karyawan & Gaji
  karyawanGaji: "Karyawan & Gaji",
  dataKaryawan: "Data Karyawan",
  hitungGaji: "Hitung Gaji",
  bpjsKesehatan: "BPJS Kesehatan",
  absensi: "Absensi",

  // Keuangan
  keuangan: "Keuangan",
  daftarAkun: "Daftar Akun (COA)",
  catatanJurnal: "Catatan Jurnal",
  laporanKeuangan: "Laporan Keuangan",
  rekonsiliasi: "Rekonsiliasi",

  // Operasional
  operasional: "Operasional",
  pembelian: "Pembelian",
  pengiriman: "Pengiriman",

  // Pengaturan
  pengaturan: "Pengaturan",
  profilBisnis: "Profil Bisnis",
  preferensi: "Preferensi",
} as const;

// ============================================
// ISTILAH TEKNIS → BAHASA SEDERHANA
// ============================================
export const TERM_MAPPING: Record<string, string> = {
  // Accounting
  "AR": "Piutang",
  "AP": "Hutang",
  "HPP": "Harga Pokok",
  "inventory relief": "Pengurangan Stok",
  "Journal posted": "Sudah Dicatat",
  "posted": "Sudah Dicatat",
  "draft": "Konsep",
  "partially_paid": "Terbayar Sebagian",
  "Trial Balance": "Neraca Saldo",
  "Balance Sheet": "Neraca",
  "Income Statement": "Laporan Laba Rugi",
  "Cash Flow": "Arus Kas",
  "Chart of Accounts": "Daftar Akun",
  "COA": "Daftar Akun",
  "Journal Entry": "Catatan Jurnal",
  "Contra entry": "Entri Lawan",
  "normalBalance": "Sifat Saldo",
  "debit": "Debet",
  "credit": "Kredit",
  "Period lock": "Periode Terkunci",
  "locked": "Terkunci",
  "open": "Terbuka",

  // Payroll / HR
  "Payroll": "Gaji",
  "HR & Payroll": "Karyawan & Gaji",
  "grossPay": "Total Gaji",
  "netPay": "Gaji Bersih",
  "takeHome": "Gaji Bersih",
  "allowance": "Tunjangan",
  "deduction": "Potongan",
  "baseSalary": "Gaji Pokok",
  "dailyRate": "Upah Harian",

  // Stock
  "Stock adjustment": "Koreksi Stok",
  "Stock opname": "Opname Stok",
  "Moving average": "Rata-rata Bergerak",
  "trackStock": "Lacak Stok",
  "Stock card": "Kartu Stok",

  // Documents
  "Void dokumen": "Batalkan Dokumen",
  "void": "Dibatalkan",
  "reversal request": "Permintaan Batal",
  "RPC reversal": "Batalkan Pencatatan",
  "coretaxStatus": "Status Coretax",
  "Coretax status": "Status Coretax",

  // System terms - HAPUS dari UI
  "Supabase mode": "",
  "Demo mode": "Mode Latihan",
  "Demo fallback": "Mode Latihan",
  "production persistence": "",
  "Supabase Auth": "",
  "RLS": "",
  "RPC": "",
  "Supabase": "",
  "apply migration": "",
  "Demo fallback aktif": "Mode Latihan aktif",

  // Tax
  "PPN Keluaran": "Pajak Penjualan",
  "PPN Masukan": "Pajak Pembelian",
  "PPh 21": "Pajak Penghasilan",
  "PTKP": "Batas PTKP",
  "NPWP": "NPWP",

  // BPJS
  "BPJS Kesehatan": "BPJS Kesehatan",
  "JHT": "Jaminan Hari Tua",
  "JPN": "Jaminan Pensiun",
  "JKK": "Jaminan Kecelakaan Kerja",
  "JKM": "Jaminan Kematian",
};

// ============================================
// AKSI / TOMBOL
// ============================================
export const ACTIONS = {
  create: "Buat Baru",
  edit: "Ubah",
  delete: "Hapus",
  save: "Simpan",
  cancel: "Batal",
  view: "Lihat",
  export: "Export",
  search: "Cari",
  filter: "Filter",
  refresh: "Segarkan",
  print: "Cetak",
  download: "Unduh",
  upload: "Unggah",
  preview: "Pratinjau",
  submit: "Kirim",
  approve: "Setujui",
  reject: "Tolak",
  close: "Tutup",
  back: "Kembali",
  next: "Lanjut",
  previous: "Sebelumnya",
  finish: "Selesai",
  add: "Tambah",
  remove: "Hapus",
  select: "Pilih",
  clear: "Hapus",
  reset: "Reset",
  confirm: "Konfirmasi",
  undo: "Batalkan Aksi",
  reverse: "Batalkan Pencatatan",
  void: "Batalkan",
} as const;

// ============================================
// STATUS DOKUMEN
// ============================================
export const STATUS = {
  draft: "Konsep",
  posted: "Sudah Dicatat",
  paid: "Lunas",
  partially_paid: "Terbayar Sebagian",
  overdue: "Jatuh Tempo",
  void: "Dibatalkan",
  active: "Aktif",
  inactive: "Non-aktif",
  pending: "Menunggu",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
} as const;

// ============================================
// PLACEHOLDER FORM
// ============================================
export const PLACEHOLDERS = {
  search: "Ketik untuk mencari...",
  searchInvoice: "Cari invoice atau nama pelanggan...",
  searchBill: "Cari tagihan atau nama supplier...",
  searchJournal: "Cari transaksi, sumber, atau tanggal...",
  searchEmployee: "Cari nama atau nomor karyawan...",
  searchProduct: "Cari produk atau SKU...",
  selectDate: "Pilih tanggal",
  selectPeriod: "Pilih periode",
  enterAmount: "Masukkan jumlah",
  enterNotes: "Masukkan catatan",
} as const;

// ============================================
// LABEL LAPORAN KEUANGAN
// ============================================
export const REPORTS = {
  trialBalance: "Neraca Saldo",
  balanceSheet: "Neraca",
  profitLoss: "Laporan Laba Rugi",
  cashFlow: "Arus Kas",
  generalLedger: "Buku Besar",
  agingReceivable: "Umur Piutang",
  agingPayable: "Umur Hutang",
  inventoryValuation: "Valuasi Persediaan",
  payrollSummary: "Ringkasan Gaji",
} as const;

// ============================================
// TIPE AKUN (COA)
// ============================================
export const ACCOUNT_TYPES = {
  asset: "AKTIVA",
  liability: "KEWAJIBAN",
  equity: "MODAL",
  revenue: "PENDAPATAN",
  expense: "BEBAN",
  cost: "HARGA POKOK",
} as const;

// ============================================
// KATEGORI AKUN
// ============================================
export const ACCOUNT_CATEGORIES = {
  "cash": "Kas & Bank",
  "receivable": "Piutang",
  "inventory": "Persediaan",
  "fixed_asset": "Aset Tetap",
  "payable": "Utang Usaha",
  "salary_payable": "Utang Gaji",
  "tax_payable": "Utang Pajak",
  "owner_capital": "Modal",
  "retained_earnings": "Laba Ditahan",
  "sales_revenue": "Penjualan",
  "cogs": "Harga Pokok Penjualan",
  "operating_expense": "Beban Operasional",
  "payroll_expense": "Beban Gaji",
  "tax_expense": "Beban Pajak",
  "other_income": "Pendapatan Lain",
  "other_expense": "Beban Lain",
} as const;

// ============================================
// JENIS KONTRAK KERJA
// ============================================
export const CONTRACT_TYPES = {
  permanent: "PKWTT (Tetap)",
  contract: "PKWT (Kontrak)",
  daily: "Harian",
  probation: "Probation",
} as const;

// ============================================
// STATUS PTKP
// ============================================
export const PTKP_STATUS = {
  tk: "TK (Tidak Kawin)",
  k0: "K/0 (Kawin, 0 tanggungan)",
  k1: "K/1 (Kawin, 1 tanggungan)",
  k2: "K/2 (Kawin, 2 tanggungan)",
  k3: "K/3 (Kawin, 3 tanggungan)",
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Ambil label user-friendly untuk status
 */
export function getStatusLabel(status: string): string {
  return STATUS[status as keyof typeof STATUS] ?? status;
}

/**
 * Ambil label user-friendly untuk tipe akun
 */
export function getAccountTypeLabel(type: string): string {
  return ACCOUNT_TYPES[type as keyof typeof ACCOUNT_TYPES] ?? type;
}

/**
 * Ambil label user-friendly untuk kategori akun
 */
export function getAccountCategoryLabel(category: string): string {
  return ACCOUNT_CATEGORIES[category as keyof typeof ACCOUNT_CATEGORIES] ?? category;
}

/**
 * Ambil label user-friendly untuk jenis kontrak
 */
export function getContractTypeLabel(type: string): string {
  return CONTRACT_TYPES[type as keyof typeof CONTRACT_TYPES] ?? type;
}

/**
 * Ambil label user-friendly untuk status PTKP
 */
export function getPtkpLabel(ptkp: string): string {
  return PTKP_STATUS[ptkp as keyof typeof PTKP_STATUS] ?? ptkp;
}

/**
 * Ambil aksi dengan key
 */
export function getActionLabel(action: keyof typeof ACTIONS): string {
  return ACTIONS[action];
}

/**
 * Ambil placeholder dengan key
 */
export function getPlaceholder(key: keyof typeof PLACEHOLDERS): string {
  return PLACEHOLDERS[key];
}

/**
 * Ambil label laporan
 */
export function getReportLabel(report: keyof typeof REPORTS): string {
  return REPORTS[report];
}

/**
 * Replace semua istilah teknis dalam teks
 */
export function simplifyText(text: string): string {
  let result = text;
  for (const [technical, simple] of Object.entries(TERM_MAPPING)) {
    result = result.replace(new RegExp(technical, "gi"), simple);
  }
  // Hapus istilah kosong
  result = result.replace(/\s+/g, " ").trim();
  return result;
}