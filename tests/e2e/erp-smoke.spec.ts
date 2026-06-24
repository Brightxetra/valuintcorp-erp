import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectToastBelowHeader(page: Page, toast: Locator) {
  await expect
    .poll(async () => {
      const [toastBox, headerBox] = await Promise.all([
        toast.boundingBox(),
        page.locator("header").first().boundingBox(),
      ]);
      return toastBox && headerBox ? toastBox.y - (headerBox.y + headerBox.height) : Number.NEGATIVE_INFINITY;
    })
    .toBeGreaterThanOrEqual(12);
}

async function expectTopCenterToast(page: Page, toast: Locator) {
  const toaster = page.locator("[data-sonner-toaster]");
  await expect(toaster).toHaveAttribute("data-y-position", "top");
  await expect(toaster).toHaveAttribute("data-x-position", "center");
  await expect(toast.locator(".gooey-timestamp")).toHaveCount(0);
  await expectToastBelowHeader(page, toast);
}

test("login form is visible before authentication work completes", async ({ page }) => {
  await page.goto("/login?next=/dashboard");

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("invite verification uses a dedicated password setup page", async ({ page }) => {
  await page.goto("/auth/invite");

  await expect(page.getByRole("heading", { name: "Link invite tidak valid" })).toBeVisible();
  await expect(page.getByText("Token invite tidak ditemukan")).toBeVisible();

  await page.goto("/login#access_token=invalid&refresh_token=invalid&type=invite");
  await expect(page).toHaveURL(/\/auth\/invite/);
  await expect(page.getByRole("heading", { name: "Link invite tidak valid" })).toBeVisible();
});

test("demo fallback login reaches the dashboard workspace", async ({ page }) => {
  await page.goto("/login?next=/dashboard");
  await page.getByLabel("Email").fill("demo.owner@valuintcorp.test");
  await page.getByLabel("Password").fill("password-demo");
  await page.getByRole("button", { name: "Masuk demo fallback" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Selamat Datang di Valuintcorp" })).toBeVisible();
  await expect(page.getByText("Mode Latihan aktif")).toBeVisible();
});

test("onboarding workspace renders in demo fallback mode", async ({ page }) => {
  await page.goto("/onboarding");

  await expect(page.getByRole("heading", { name: "Onboarding bisnis" })).toBeVisible();
  await expect(page.getByText("Setup yang otomatis dibuat")).toBeVisible();
});

test("core ERP menu navigation stays responsive in demo fallback mode", async ({ page }) => {
  await page.goto("/dashboard");

  await page.getByRole("link", { name: "Invoice Penjualan" }).click();
  await expect(page).toHaveURL(/\/transaksi\/invoice$/);
  await expect(page.getByText("Invoice Penjualan").first()).toBeVisible();

  await page.getByRole("link", { name: "Tagihan Supplier" }).click();
  await expect(page).toHaveURL(/\/transaksi\/tagihan$/);
  await expect(page.getByText("Tagihan Supplier").first()).toBeVisible();

  await page.getByRole("link", { name: "Stok & Persediaan" }).click();
  await expect(page).toHaveURL(/\/produk\/stok$/);
  await expect(page.getByText("Stok & Persediaan").first()).toBeVisible();
});

test("favorite changes use Goey toast notifications", async ({ page }) => {
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tambah Dashboard ke favorit" }).click();
  const addedToast = page.locator("[data-sonner-toast]").filter({ hasText: "Ditambahkan ke favorit" });
  await expect(addedToast).toBeVisible();

  const [toastBox, viewport] = await Promise.all([
    addedToast.boundingBox(),
    page.viewportSize(),
  ]);
  expect(toastBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs(toastBox!.x + toastBox!.width / 2 - viewport!.width / 2)).toBeLessThanOrEqual(2);
  await expectTopCenterToast(page, addedToast);

  await page.keyboard.press("Escape");
  await expect(addedToast).toBeHidden();

  await page
    .getByRole("link", { name: "Dashboard Hapus Dashboard dari favorit" })
    .getByRole("button", { name: "Hapus Dashboard dari favorit" })
    .click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Dihapus dari favorit" })).toBeVisible();
});

test("favorite toast stays centered below the header on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Buka menu" }).click();
  await page.getByRole("button", { name: "Tambah Dashboard ke favorit" }).click();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Ditambahkan ke favorit" });
  await expect(toast).toBeVisible();

  const toastBox = await toast.boundingBox();
  expect(toastBox).not.toBeNull();
  expect(Math.abs(toastBox!.x + toastBox!.width / 2 - 195)).toBeLessThanOrEqual(2);
  expect(toastBox!.x).toBeGreaterThanOrEqual(16);
  expect(toastBox!.x + toastBox!.width).toBeLessThanOrEqual(374);
  await expectTopCenterToast(page, toast);
});

test("top-center toast remains visible on short and narrow mobile viewports", async ({ page }) => {
  for (const viewport of [
    { width: 400, height: 545 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Buka menu" }).click();
    await page.getByRole("button", { name: "Tambah Dashboard ke favorit" }).click();

    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Ditambahkan ke favorit" });
    await expect(toast).toBeVisible();

    const [toastBox, pageWidth] = await Promise.all([
      toast.boundingBox(),
      page.evaluate(() => document.documentElement.scrollWidth),
    ]);
    expect(toastBox).not.toBeNull();
    expect(Math.abs(toastBox!.x + toastBox!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
    expect(toastBox!.x).toBeGreaterThanOrEqual(16);
    expect(toastBox!.x + toastBox!.width).toBeLessThanOrEqual(viewport.width - 16);
    await expectTopCenterToast(page, toast);
    expect(pageWidth).toBeLessThanOrEqual(viewport.width);

    await page.keyboard.press("Escape");
    await expect(toast).toBeHidden();
    await page.evaluate(() => window.localStorage.removeItem("erp-favorites-nav"));
  }
});

test("header notification panel remains available", async ({ page }) => {
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Notifikasi" }).click();
  await expect(page.getByText("Notifikasi & tugas", { exact: true })).toBeVisible();
});

test("saving a business industry uses a Goey success toast instead of an inline banner", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /Profil Bisnis/ }).click();
  await page.getByLabel("Industri").selectOption("service");
  await page.getByRole("button", { name: "Simpan profil" }).click();

  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Profil bisnis disimpan" });
  await expect(toast).toBeVisible();
  await expectTopCenterToast(page, toast);
  await expect(toast).toContainText("Industri: Jasa");
  await expect(page.getByText("business disimpan.", { exact: true })).toHaveCount(0);
});

test("failed business changes show an eight-second Goey error without an inline banner", async ({ page }) => {
  await page.route("**/api/erp/master-data", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ error: "Industri tidak valid." }),
    });
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: /Profil Bisnis/ }).click();
  await page.getByLabel("Industri").selectOption("service");
  await page.getByRole("button", { name: "Simpan profil" }).click();

  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Profil bisnis gagal disimpan" });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Industri tidak valid.");
  await expect(page.getByText("Industri tidak valid.", { exact: true })).toHaveCount(1);
});

test("sidebar marks only the most specific employee page as active", async ({ page }) => {
  await page.goto("/karyawan/gaji");

  const employeeList = page.getByRole("link", { name: "Data Karyawan", exact: true });
  const payroll = page.getByRole("link", { name: "Hitung Gaji", exact: true });
  await expect(employeeList).not.toHaveClass(/bg-slate-900/);
  await expect(payroll).toHaveClass(/bg-slate-900/);

  await page.goto("/karyawan/bpjs");
  const bpjs = page.getByRole("link", { name: "BPJS Kesehatan", exact: true });
  await expect(employeeList).not.toHaveClass(/bg-slate-900/);
  await expect(payroll).not.toHaveClass(/bg-slate-900/);
  await expect(bpjs).toHaveClass(/bg-slate-900/);
});

test("team settings use email-driven invites without exposing Supabase auth user ids", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /Team & Akses/ }).click();

  await expect(page.getByRole("heading", { name: "Team & Akses" })).toBeVisible();
  await expect(page.getByLabel("Email anggota")).toBeVisible();
  await expect(page.getByText("Supabase auth user id")).toHaveCount(0);
  await expect(page.getByText("Auth User ID")).toHaveCount(0);
});

test("dashboard quick actions open existing create forms", async ({ page }) => {
  await page.goto("/dashboard");

  await page.getByRole("link", { name: "Invoice Baru" }).click();
  await expect(page).toHaveURL(/\/transaksi\/invoice\?action=new$/);
  await expect(page.getByRole("heading", { name: "Buat Invoice Baru" })).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Tagihan Baru" }).click();
  await expect(page).toHaveURL(/\/transaksi\/tagihan\?action=new$/);
  await expect(page.getByRole("heading", { name: "Buat Tagihan Baru" })).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Catat Jurnal" }).click();
  await expect(page).toHaveURL(/\/keuangan\/jurnal\?action=new$/);
  await expect(page.getByRole("heading", { name: "Buat Jurnal Baru" })).toBeVisible();
});

test("financial export enforces demo roles and returns a workbook for owners", async ({ request }) => {
  const denied = await request.get("/api/exports/financials?format=xlsx", {
    headers: { "x-demo-role": "staff" },
  });

  expect(denied.status()).toBe(403);

  const exported = await request.get("/api/exports/financials?format=xlsx", {
    headers: { "x-demo-role": "owner" },
  });

  expect(exported.ok()).toBe(true);
  expect(exported.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect((await exported.body()).byteLength).toBeGreaterThan(1_000);
});

test("branch POS exposes a daily recap and branch product picker", async ({ page }) => {
  await page.goto("/pos");
  await expect(page.getByRole("heading", { name: "Kasir & rekap harian" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Cabang" })).toHaveValue("loc-kitchen");
  await expect(page.getByText("Produk cabang")).toBeVisible();
  await expect(page.getByText("Stok awal")).toBeVisible();
  await expect(page.getByText("Stok akhir")).toBeVisible();
});

test("branch POS posts a demo sale into the daily recap", async ({ page }) => {
  await page.goto("/pos");
  await expect(page.getByText("Rendang Bowl", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tambah Rendang Bowl" }).click();
  await page.getByRole("button", { name: "Post penjualan" }).click();

  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Penjualan POS diposting" });
  await expect(toast).toBeVisible();
  await expectTopCenterToast(page, toast);

  const revenueCard = page.getByText("Omzet", { exact: true }).locator("..");
  await expect(revenueCard).toContainText("Rp 45.000");
  await expect(page.getByText(/INV-2026-/).first()).toBeVisible();
  const expenseForm = page.locator("#branch-expense-form");
  await expenseForm.getByLabel("Kategori").fill("Transport");
  await expenseForm.getByLabel("Nominal").fill("25000");
  await expenseForm.getByLabel("Catatan").fill("Antar pesanan");
  await expenseForm.getByRole("button", { name: "Simpan biaya" }).click();

  const expenseToast = page.locator("[data-sonner-toast]").filter({ hasText: "Biaya cabang dicatat" });
  await expect(expenseToast).toBeVisible();
  await expectTopCenterToast(page, expenseToast);
  const expenseCard = page.getByText("Biaya lain", { exact: true }).locator("..");
  await expect(expenseCard).toContainText("Rp 25.000");
});
