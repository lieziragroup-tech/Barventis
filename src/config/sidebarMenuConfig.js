import {
  LayoutDashboard,
  ClipboardList,
  Boxes,
  Wrench,
  Scissors,
  ShoppingCart,
  ArrowRightLeft,
  Tag,
  Calculator,
  Trash2,
  Settings,
  Building2
} from 'lucide-react';

/**
 * Single Source of Truth untuk seluruh menu sidebar Barventis (Desktop & Mobile).
 * Menggunakan bahasa Indonesia sehari-hari yang simpel, jelas, dan ringkas.
 */
export function getSidebarGroupsForRole({
  role = '',
  isHeadBarUser = false,
  isSuperAdmin = false,
  isTenant = true,
  basePath = '/dashboard',
  canAccessSettings = false
}) {
  const groups = [];

  if (isSuperAdmin) {
    groups.push({
      id: 'platform',
      title: 'Platform',
      items: [
        {
          to: '/superadmin',
          exact: true,
          label: 'Kelola Tenant',
          subtitle: 'Kelola database dan lisensi resto',
          icon: Building2
        }
      ]
    });
  }

  if (!isTenant) return groups;

  // HEAD BAR (BSD / Kasuna — masing-masing terkunci ke cabangnya sendiri)
  if (role === 'Bar' && isHeadBarUser) {
    groups.push(
      {
        id: 'headbar-harian',
        title: 'Kerja Harian Bar',
        items: [
          { to: basePath, exact: true, label: 'Dashboard', subtitle: 'Ringkasan stok dan aktivitas hari ini', icon: LayoutDashboard },
          { to: `${basePath}/daily-inventory`, label: 'Daily Inventory', subtitle: 'Catat stok akhir shift (bahan & beer)', icon: ClipboardList },
          { to: `${basePath}/olah-bahan`, label: 'Olah & Pecah Bahan', subtitle: 'Produksi sirup, potong buah & pecah bahan utuh', icon: Scissors },
          { to: `${basePath}/procurement?tab=invoicing`, label: 'Permintaan PO', subtitle: 'Ajukan PO, ACC order Central & terima barang', icon: ShoppingCart },
          { to: `${basePath}/transfer`, label: 'Mutasi Gudang', subtitle: 'Minta atau terima barang dari Central (Rp 0)', icon: ArrowRightLeft }
        ]
      },
      {
        id: 'headbar-bulanan',
        title: 'Opname & Laporan',
        items: [
          { to: `${basePath}/opname-assets`, label: 'Stock Opname', subtitle: 'Hitung stok fisik bahan (Resto / Central)', icon: Boxes },
          { to: `${basePath}/excel-so-glass-tool`, label: 'Gelas & Alat Bar', subtitle: 'Hitung gelas/alat bar & catat barang pecah', icon: Wrench },
          { to: `${basePath}/pricing-cogs`, label: 'Menu & Resep', subtitle: 'Daftar resep dan harga jual minuman', icon: Tag },
          { to: `${basePath}/excel-cost-control`, label: 'Cost Control', subtitle: 'Cek selisih pemakaian, biaya & catatan event', icon: Calculator },
          { to: `${basePath}/excel-berita-acara`, label: 'Berita Acara', subtitle: 'Cetak Berita Acara barang waste & gelas pecah', icon: Trash2 }
        ]
      }
    );
    return groups;
  }

  // REKAN BAR (Operasional harian tanpa akses keuangan / ACC)
  if (role === 'Bar' && !isHeadBarUser) {
    groups.push({
      id: 'rekanbar-ops',
      title: 'Kerja Harian Bar',
      items: [
        { to: basePath, exact: true, label: 'Dashboard Bar', subtitle: 'Ringkasan aktivitas bar hari ini', icon: LayoutDashboard },
        { to: `${basePath}/daily-inventory`, label: 'Daily Inventory', subtitle: 'Catat stok harian bahan & beer', icon: ClipboardList },
        { to: `${basePath}/olah-bahan`, label: 'Olah & Pecah Bahan', subtitle: 'Catat produksi sirup, potong buah & pecah bahan', icon: Scissors },
        { to: `${basePath}/procurement?tab=invoicing`, label: 'Permintaan PO', subtitle: 'Ajukan PO bar & konfirmasi terima barang', icon: ShoppingCart },
        { to: `${basePath}/transfer`, label: 'Minta ke Central', subtitle: 'Minta pengiriman barang dari Central (Rp 0)', icon: ArrowRightLeft }
      ]
    });
    return groups;
  }

  const singleGroupByRole = {
    Kitchen: {
      id: 'kitchen-ops',
      title: 'Divisi Kitchen',
      items: [
        { to: basePath, exact: true, label: 'Dashboard Kitchen', subtitle: 'Ringkasan stok dapur hari ini', icon: LayoutDashboard },
        { to: `${basePath}/daily-inventory`, label: 'Stok Harian Dapur', subtitle: 'Catat pemakaian harian bahan dapur', icon: ClipboardList },
        { to: `${basePath}/olah-bahan`, label: 'Prep & Potong Bahan', subtitle: 'Catat potongan daging, ikan & sayur', icon: Scissors },
        { to: `${basePath}/procurement?tab=invoicing`, label: 'Permintaan PO', subtitle: 'Ajukan PO dapur & terima barang', icon: ShoppingCart },
        { to: `${basePath}/opname-assets`, label: 'Stock Opname', subtitle: 'Hitung stok fisik area dapur', icon: Boxes },
        { to: `${basePath}/transfer`, label: 'Mutasi Gudang', subtitle: 'Minta bahan dari Central ke dapur', icon: ArrowRightLeft },
        { to: `${basePath}/pricing-cogs?tab=cogs-all`, label: 'Resep Dapur', subtitle: 'Resep masakan dan modal bahan', icon: Tag }
      ]
    },
    Service: {
      id: 'service-ops',
      title: 'Divisi Service',
      items: [
        { to: basePath, exact: true, label: 'Dashboard Service', subtitle: 'Ringkasan area floor & alat', icon: LayoutDashboard },
        { to: `${basePath}/excel-so-glass-tool`, label: 'Gelas & Alat', subtitle: 'Hitung gelas/alat & catat yang pecah', icon: Wrench },
        { to: `${basePath}/daily-inventory`, label: 'Stok Harian Service', subtitle: 'Catat pemakaian tisu, cup & kemasan', icon: ClipboardList },
        { to: `${basePath}/procurement?tab=invoicing`, label: 'Permintaan PO', subtitle: 'Ajukan pembelian alat & terima barang', icon: ShoppingCart }
      ]
    },
    Central: {
      id: 'central-ops',
      title: 'Gudang Central',
      items: [
        { to: basePath, exact: true, label: 'Dashboard Central', subtitle: 'Ringkasan barang masuk & keluar gudang', icon: LayoutDashboard },
        { to: `${basePath}/transfer`, label: 'Kirim ke Cabang', subtitle: 'Kirim stok dari Central ke BSD / Kasuna', icon: ArrowRightLeft },
        { to: `${basePath}/procurement?tab=invoicing`, label: 'PO Central', subtitle: 'Ajukan PO grosir & terima barang supplier', icon: ShoppingCart },
        { to: `${basePath}/sistem?tab=stock-ledger`, label: 'Cek Stok Gudang', subtitle: 'Lihat sisa stok Central & cabang', icon: Boxes }
      ]
    },
    Purchasing: {
      id: 'purchasing-ops',
      title: 'Purchasing & PO',
      items: [
        { to: `${basePath}/procurement?tab=invoicing`, label: 'Daftar & Buat PO', subtitle: 'Buat PO baru, proses & terima barang', icon: ShoppingCart },
        { to: basePath, exact: true, label: 'Ringkasan PO Bulanan', subtitle: 'Total nilai belanja & status PO bulan ini', icon: LayoutDashboard },
        { to: `${basePath}/procurement?tab=marketlist`, label: 'Bandingkan Harga', subtitle: 'Cek perbandingan harga antar supplier', icon: Tag },
        { to: `${basePath}/procurement?tab=pembelian`, label: 'Supplier & Rekap', subtitle: 'Daftar supplier, rekap Tgl 1–31 & Petty Cash', icon: Building2 }
      ]
    },
    Kasir: {
      id: 'kasir-ops',
      title: 'Layanan',
      items: [
        { to: basePath, exact: true, label: 'Dashboard', subtitle: 'Ringkasan harian', icon: LayoutDashboard },
        { to: `${basePath}/daily-inventory?tab=waste`, label: 'Lapor Barang Rusak', subtitle: 'Catat barang pecah atau rusak', icon: Trash2 }
      ]
    }
  };

  if (singleGroupByRole[role]) {
    groups.push(singleGroupByRole[role]);
    return groups;
  }

  // Default: Owner / Admin / Supervisor
  groups.push(
    {
      id: 'owner-home',
      title: '',
      items: [
        { to: basePath, exact: true, label: 'Dashboard', subtitle: 'Ringkasan biaya & stok seluruh cabang', icon: LayoutDashboard }
      ]
    },
    {
      id: 'owner-ops',
      title: 'Operasional',
      items: [
        { to: `${basePath}/daily-inventory`, label: 'Daily Inventory', subtitle: 'Stok harian bahan, beer & catatan waste', icon: ClipboardList },
        { to: `${basePath}/olah-bahan`, label: 'Olah & Pecah Bahan', subtitle: 'Produksi sirup, potong buah & pecah bahan', icon: Scissors },
        { to: `${basePath}/procurement`, label: 'Pengadaan & PO', subtitle: 'Buat PO, bandingkan harga & daftar supplier', icon: ShoppingCart },
        { to: `${basePath}/transfer`, label: 'Mutasi Gudang', subtitle: 'Transfer stok Central ke BSD / Kasuna', icon: ArrowRightLeft }
      ]
    },
    {
      id: 'owner-analytics',
      title: 'Laporan & Audit',
      items: [
        { to: `${basePath}/pricing-cogs`, label: 'Menu & Resep', subtitle: 'Resep minuman, modal & harga jual', icon: Tag },
        { to: `${basePath}/opname-assets`, label: 'Stock Opname', subtitle: 'Hitung fisik Resto, Central & Gelas/Alat', icon: Boxes },
        { to: `${basePath}/cost-report`, label: 'Cost Control', subtitle: 'Cek selisih pemakaian & rasio biaya', icon: Calculator },
        { to: `${basePath}/excel-berita-acara`, label: 'Berita Acara', subtitle: 'Berita Acara barang waste & gelas pecah', icon: Trash2 }
      ]
    }
  );

  if (canAccessSettings) {
    groups.push({
      id: 'owner-system',
      title: 'Setelan',
      items: [
        { to: `${basePath}/sistem`, label: 'Pengaturan', subtitle: 'Profil resto, foto PDF Umatis, staf & cabang', icon: Settings }
      ]
    });
  }

  return groups;
}
