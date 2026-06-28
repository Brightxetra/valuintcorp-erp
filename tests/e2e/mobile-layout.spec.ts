import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const erpRoutes = [
  "/dashboard",
  "/sales",
  "/purchases",
  "/inventory",
  "/accounting",
  "/reports",
  "/hr",
  "/tax",
  "/settings",
  "/transaksi/invoice",
  "/transaksi/tagihan",
  "/transaksi/kas",
  "/produk/stok",
  "/produk/harga",
  "/pos",
  "/pos/pengaturan",
  "/pos/security",
  "/pos/laporan",
  "/karyawan",
  "/karyawan/gaji",
  "/karyawan/bpjs",
  "/keuangan/akun",
  "/keuangan/jurnal",
  "/keuangan/aset",
  "/keuangan/laporan",
];

async function inspectMobileShell(page: Page) {
  return page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const navigation = document.querySelector<HTMLElement>("nav.fixed.bottom-0");
    const main = document.querySelector<HTMLElement>(".erp-mobile-shell .erp-mobile-shell-content main");
    const navRect = navigation?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const navLinks = navigation ? Array.from(navigation.querySelectorAll<HTMLAnchorElement>("a")) : [];

    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      navTop: navRect?.top ?? null,
      mainBottom: mainRect?.bottom ?? null,
      navLinkHeights: navLinks.map((link) => link.getBoundingClientRect().height),
    };
  });
}

test("every ERP menu clears the fixed mobile navigation at a short viewport", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 400, height: 545 });

  for (const route of erpRoutes) {
    await test.step(route, async () => {
      // Some workspaces hydrate their data immediately after the document loads.
      // Measure only after that request settles, otherwise the page can grow after
      // the scroll-to-bottom measurement and produce a false navigation overlap.
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator(".erp-mobile-shell")).toBeVisible();
      await expect(page.locator("nav.fixed.bottom-0")).toBeVisible();

      const layout = await inspectMobileShell(page);
      expect(layout.horizontalOverflow, `${route} creates horizontal page overflow`).toBe(false);
      expect(layout.navTop, `${route} mobile navigation is measured`).not.toBeNull();
      expect(layout.mainBottom, `${route} main content is measured`).not.toBeNull();
      expect(layout.mainBottom!).toBeLessThanOrEqual(layout.navTop! - 8);
      expect(Math.min(...layout.navLinkHeights)).toBeGreaterThanOrEqual(44);
    });
  }
});

test("non-shell pages stay within a normal mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/login", "/onboarding"]) {
    await page.goto(route);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow, `${route} creates horizontal page overflow`).toBe(false);
  }
});

test("operation dialogs remain scrollable and dismissible at a short mobile viewport", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 400, height: 545 });

  const dialogs = [
    ["/transaksi/invoice", "Buat Invoice Baru"],
    ["/transaksi/tagihan", "Buat Tagihan Baru"],
    ["/transaksi/kas", "Penerimaan"],
    ["/produk/stok", "Penyesuaian Stok"],
    ["/produk/harga", "Update Harga"],
    ["/keuangan/jurnal", "Jurnal Baru"],
    ["/keuangan/aset", "Tambah Aset"],
  ] as const;

  for (const [route, buttonName] of dialogs) {
    await test.step(`${route}: ${buttonName}`, async () => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const trigger = page.getByRole("button", { name: buttonName, exact: true });
      await expect(trigger).toBeVisible();
      await trigger.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const dimensions = await dialog.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        bottom: element.getBoundingClientRect().bottom,
        viewportHeight: window.innerHeight,
      }));
      expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.viewportHeight - 8);
      expect(dimensions.scrollHeight).toBeGreaterThanOrEqual(dimensions.clientHeight);

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  }
});
