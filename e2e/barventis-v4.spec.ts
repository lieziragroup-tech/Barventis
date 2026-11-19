import { test, expect } from '@playwright/test';

const HEAD_BAR_EXCEL_MENUS = [
  'MARKETLIST',
  'Pembelian Harian',
  'Pemakaian Harian',
  'Daily Iventory Bahan',
  'Daily Iventory Beer',
  'SO Glass & Tool',
  'STOCK OPNAME RESTO',
  'STOCK OPNAME CENTRAL',
  'Proses Produksi Bahan',
  'MENU PRICING',
  'COGS All Beverage',
  'COST CONTROL',
  'Berita Acara Waste & Pecah'
];

test.describe('Barventis v4.0 — Head Bar Sidebar & Stakeholder Core Flows', () => {
  test('Login Head Barista (Irpan) menampilkan seluruh 12 menu Excel + Berita Acara tanpa sub-menu', async ({ page, isMobile }) => {
    await page.goto('/login');
    const headBarBtn = page.getByRole('button', { name: /Head Barista.*Irpan/i });
    await expect(headBarBtn).toBeVisible();
    await headBarBtn.click();

    await expect(page).toHaveURL(/\/dashboard/);

    if (isMobile) {
      const menuBtn = page.getByRole('button', { name: /menu/i }).first();
      if (await menuBtn.isVisible()) await menuBtn.click();
    }

    for (const label of HEAD_BAR_EXCEL_MENUS) {
      await expect(page.getByRole('link', { name: label, exact: true }).first()).toBeVisible();
    }
  });

  test('Berita Acara Bulanan (Waste & Gelas Pecah) menampilkan data resmi Umatis dan tombol 1-Page Print Mode', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Head Barista.*Irpan/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/dashboard/excel-berita-acara');
    await expect(page.getByText('BERITA ACARA BARANG KADALUARSA/WASTE')).toBeVisible();
    await expect(page.getByText('BERITA ACARA GELAS PECAH')).toBeVisible();
    await expect(page.getByRole('button', { name: /Mode Cetak 1 Lembar/i })).toBeVisible();
    await expect(page.getByText(/Rp\.\s*212\.000/)).toBeVisible();
  });

  test('Zero-Waste Split (Kasus Kelapa Urgent) & Cost Control Dual-Mode berjalan tanpa native alert', async ({ page }) => {
    let nativeDialogTriggered = false;
    page.on('dialog', async (dialog) => {
      nativeDialogTriggered = true;
      await dialog.dismiss();
    });

    await page.goto('/login');
    await page.getByRole('button', { name: /Head Barista.*Irpan/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/dashboard/excel-split-bahan');
    await expect(page.getByText(/Split Bahan Zero-Waste/i)).toBeVisible();
    await page.getByRole('button', { name: /Muat Contoh Riil: Kelapa Urgent/i }).click();

    await page.goto('/dashboard/excel-cost-control');
    await expect(page.getByText(/Komparasi 2 Metode Pemakaian/i)).toBeVisible();
    await expect(page.getByText(/Pemakaian By Input Harian/i)).toBeVisible();
    await expect(page.getByText(/Pemakaian By Data Stokan/i)).toBeVisible();

    expect(nativeDialogTriggered).toBe(false);
  });
});
