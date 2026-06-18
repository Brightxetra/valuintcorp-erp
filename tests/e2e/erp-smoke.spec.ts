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
