import { expect, test } from "@playwright/test";

test("login form is visible before authentication work completes", async ({ page }) => {
  await page.goto("/login?next=/dashboard");

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
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

  await page.keyboard.press("Escape");
  await expect(addedToast).toBeHidden();

  await page
    .getByRole("link", { name: "Dashboard Hapus Dashboard dari favorit" })
    .getByRole("button", { name: "Hapus Dashboard dari favorit" })
    .click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Dihapus dari favorit" })).toBeVisible();
});

test("favorite toast clears mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Buka menu" }).click();
  await page.getByRole("button", { name: "Tambah Dashboard ke favorit" }).click();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Ditambahkan ke favorit" });
  await expect(toast).toBeVisible();

  const toastBox = await toast.boundingBox();
  expect(toastBox).not.toBeNull();
  expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(780);
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

  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Operasi gagal" });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Industri tidak valid.");
  await expect(page.getByText("Industri tidak valid.", { exact: true })).toHaveCount(1);
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
