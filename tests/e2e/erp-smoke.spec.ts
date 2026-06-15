import { expect, test } from "@playwright/test";

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
