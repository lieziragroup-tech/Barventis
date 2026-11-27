import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('Memuat halaman utama Fieldwork Enterprise dan verifikasi judul', async ({ app, screen }) => {
  await app.open('/');
  await expect(screen.getByRole('heading', { name: 'Fieldwork Enterprise' })).toBeVisible();
});

test('Verifikasi role switcher dan tab navigasi Barventis', async ({ screen }) => {
  await expect(screen.getByText('PT Guci Emas Pratama • Barventis Layout')).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Ikhtisar (Dashboard)' })).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Penugasan (SPK)' })).toBeVisible();
});
