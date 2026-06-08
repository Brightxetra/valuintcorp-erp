// ============================================================================
// SIMPLE LANGUAGE DICTIONARY - No confusing technical terms
// ============================================================================

export const labels = {
  // Navigation
  nav: {
    dashboard: "Beranda",
    sales: "Penjualan",
    purchases: "Pembelian",
    inventory: "Stok",
    accounting: "Akuntansi",
    reports: "Laporan",
    employees: "Karyawan",
    payroll: "Gaji",
    taxes: "Pajak",
    settings: "Pengaturan",
  },

  // Common Actions - Always simple Indonesian
  actions: {
    add: "Tambah",
    edit: "Edit",
    delete: "Hapus",
    save: "Simpan",
    cancel: "Batal",
    back: "Kembali",
    search: "Cari",
    filter: "Filter",
    download: "Unduh",
    upload: "Upload",
    confirm: "Ya",
    close: "Tutup",
    refresh: "Refresh",
    // New simple actions
    create: "Baru",
    view: "Lihat",
    update: "Ubah",
    remove: "Hapus",
    submit: "Kirim",
    reset: "Reset",
  },

  // Status - Always clear Indonesian
  status: {
    active: "Aktif",
    inactive: "Nonaktif",
    pending: "Menunggu",
    approved: "Disetujui",
    rejected: "Ditolak",
    paid: "Lunas",
    unpaid: "Belum Lunas",
    partial: "Sebagian",
    recorded: "Tercatat",
    draft: "Konsep",
    posted: "Tercatat",
    void: "Dibatalkan",
    open: "Dibuka",
    closed: "Ditutup",
  },

  // Financial Terms - Simplified Indonesian
  money: {
    total: "Total",
    subtotal: "Subtotal",
    discount: "Diskon",
    tax: "Pajak",
    shipping: "Ongkir",
    grandTotal: "Grand Total",
    balance: "Saldo",
    payment: "Pembayaran",
    receipt: "Penerimaan",
    expense: "Pengeluaran",
    income: "Pemasukan",
    profit: "Laba",
    loss: "Rugi",
  },

  // Accounting - Simplified
  accounts: {
    cash: "Tunai & Bank",
    receivable: "Piutang",
    inventory: "Persediaan",
    fixedAssets: "Aset Tetap",
    payable: "Utang",
    salaryPayable: "Utang Gaji",
    taxPayable: "Utang Pajak",
    capital: "Modal",
    drawings: "Prive",
    sales: "Penjualan",
    serviceRevenue: "Pendapatan Jasa",
    cogs: "Harga Pokok",
    operatingExpense: "Beban Operasional",
    payrollExpense: "Beban Gaji",
    taxExpense: "Beban Pajak",
  },

  // Employee Terms
  employee: {
    name: "Nama Lengkap",
    role: "Jabatan",
    department: "Departemen",
    email: "Email",
    phone: "Telepon",
    address: "Alamat",
    idNumber: "NIK/KTP",
    familyCard: "No. KK",
    birthDate: "Tanggal Lahir",
    birthPlace: "Tempat Lahir",
    gender: "Jenis Kelamin",
    maritalStatus: "Status Kawin",
    education: "Pendidikan",
    emergencyContact: "Kontak Darurat",
    emergencyPhone: "Telepon Darurat",
    bankAccount: "No. Rekening",
    bankName: "Nama Bank",
    joinDate: "Tanggal Masuk",
    endDate: "Tanggal Keluar",
    contractType: "Tipe Kontrak",
    permanent: "Karyawan Tetap",
    contract: "Kontrak",
    daily: "Harian",
    baseSalary: "Gaji Pokok",
    allowance: "Tunjangan",
    deduction: "Potongan",
    grossSalary: "Gaji Kotor",
    netSalary: "Gaji Bersih",
    takeHomePay: "Take Home Pay",
  },

  // BPJS Terms
  bpjs: {
    kesehatan: "BPJS Kesehatan",
    ketenagakerjaan: "BPJS Ketenagakerjaan",
    jht: "JHT (Hari Tua)",
    jpn: "JPN (Pensiun)",
    jkk: "JKK (Cedera Kerja)",
    jkm: "JKM (Kematian)",
    employeeShare: "Bagian Karyawan",
    employerShare: "Bagian Perusahaan",
    totalCost: "Total Biaya Karyawan",
  },

  // Reports
  reports: {
    incomeStatement: "Laporan Laba Rugi",
    balanceSheet: "Laporan Neraca",
    cashFlow: "Arus Kas",
    trialBalance: "Neraca Saldo",
    receivables: "Daftar Piutang",
    payables: "Daftar Utang",
    inventoryValue: "Nilai Persediaan",
    employeeList: "Daftar Karyawan",
    payrollSummary: "Ringkasan Gaji",
    taxSummary: "Ringkasan Pajak",
  },

  // Error Messages - Simple Indonesian
  errors: {
    required: "Kolom ini wajib diisi",
    invalid: "Format tidak valid",
    notFound: "Data tidak ditemukan",
    saveFailed: "Gagal menyimpan",
    deleteFailed: "Gagal menghapus",
    loadFailed: "Gagal memuat data",
    confirmDelete: "Yakin ingin menghapus?",
  },

  // Success Messages - Simple Indonesian
  success: {
    saved: "Data berhasil disimpan",
    deleted: "Data berhasil dihapus",
    updated: "Data berhasil diperbarui",
    created: "Data berhasil dibuat",
    sent: "Berhasil dikirim",
  },

  // Units
  units: {
    unit: "Satuan",
    piece: "Pcs",
    kilogram: "Kg",
    gram: "Gr",
    liter: "L",
    meter: "M",
    centimeter: "Cm",
    hour: "Jam",
    day: "Hari",
    month: "Bulan",
    year: "Tahun",
  },

  // Date/Time
  dates: {
    today: "Hari Ini",
    yesterday: "Kemarin",
    thisWeek: "Minggu Ini",
    thisMonth: "Bulan Ini",
    lastMonth: "Bulan Lalu",
    dueDate: "Jatuh Tempo",
    paidDate: "Tanggal Bayar",
    createdAt: "Dibuat",
    updatedAt: "Diperbarui",
  },

  // Messages
  messages: {
    noData: "Belum ada data",
    loading: "Memuat...",
    confirming: "Memproses...",
    noResults: "Tidak ada hasil pencarian",
    helpText: "Hint: Tekan Ctrl+K untuk mencari menu",
  },
};

// Helper function to format currency
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Helper to format date
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

// Helper to format percentage
export function formatPercent(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

// Generate employee number
export function generateEmployeeNo(existingCount: number): string {
  return `KRY-${String(existingCount + 1).padStart(4, "0")}`;
}

// Generate document number
export function generateDocNo(prefix: string, existingCount: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(existingCount + 1).padStart(4, "0")}`;
}

// Generate COA code
export function generateCoaCode(type: string, existingCodes: string[]): string {
  const prefixes: Record<string, string> = {
    asset: "1",
    liability: "2",
    equity: "3",
    revenue: "4",
    expense: "5",
  };
  const prefix = prefixes[type] || "0";
  // Find highest existing code with same prefix
  const samePrefix = existingCodes
    .filter(c => c.startsWith(prefix))
    .map(c => parseInt(c))
    .filter(n => !isNaN(n));
  const next = samePrefix.length > 0 ? Math.max(...samePrefix) + 1 : parseInt(prefix + "000");
  return String(next);
}