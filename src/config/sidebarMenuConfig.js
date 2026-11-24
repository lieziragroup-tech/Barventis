import {
  LayoutDashboard,
  ClipboardCheck,
  PackageCheck,
  GlassWater,
  Scissors,
  ShoppingBag,
  Truck,
  BookOpen,
  BarChart3,
  FileCheck2,
  Settings,
  Building2,
  AlertCircle,
  Tag
} from 'lucide-react';

/**
 * Single Source of Truth untuk seluruh menu sidebar Barventis (Desktop & Mobile).
 * Icon semantik sesuai fungsi, bahasa singkat, humanis, dan bebas em-dash.
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

  // HEAD BAR (BSD / Kasuna, masing-masing terkunci ke cabangnya sendiri)
  if (role === 'Bar' && isHeadBarUser) {
    groups.push(
      {
        id: 'headbar-harian',
        title: 'Kerja Harian',
        items: [
          { to: basePath, exact: true, label: 'Dashboard', subtitle: 'Ringkasan stok dan aktivitas hari ini', icon: LayoutDashboard },
          { to: `${basePath}/daily-inventory`, label: 'Daily Inventory', subtitle: 'Stok akhir shift bahan dan beer', icon: ClipboardCheck },
          { to: `${basePath}/olah-bahan`, label: 'Olah Bahan', subtitle: 'Produksi sirup, potong buah dan cutting portion', icon: Scissors },
          { to: `${basePath}/procurement?tab=invoicing`, label: 'Permintaan PO', subtitle: 'Ajukan PO, ACC Central dan terima barang', icon: ShoppingBag },
          { to: `${basePath}/transfer`, label: 'Mutasi Gudang', subtitle: 'Minta atau terima barang dari Central (Rp 0)', icon: Truck }
        ]
      },
      {
        id: 'headbar-bulanan',
        title: 'Opname & Laporan',
        items: [
          { to: `${basePath}/opname-assets`, label: 'Stock Opname', subtitle: 'Hitung fisik bahan Resto dan Central', icon: PackageCheck },
          { to: `${basePath}/excel-so-glass-tool`, label: 'Gelas & Alat Bar', subtitle: 'Stok gelas, alat bar dan catat pecah', icon: GlassWater },
          { to: `${basePath}/pricing-cogs`, label: 'Menu & Resep', subtitle: 'Resep minuman dan harga jual', icon: BookOpen },
          { to: `${basePath}/excel-cost-control`, label: 'Cost Control', subtitle: 'Cek selisih pemakaian dan catatan event', icon: BarChart3 },
          { to: `${basePath}/excel-berita-acara`, label: 'Berita Acara', subtitle: 'Cetak Berita Acara waste dan gelas pecah', icon: FileCheck2 }
        ]
      }
    );
    return groups;
  }

  // REKAN BAR
  if (role === 'Bar' && !isHeadBarUser) {
    groups.push({
      id: 'rekanbar-ops',
      title: 'Kerja Harian',
      items: [
        { to: basePath, exact: true, label: 'Dashboard Bar', subtitle: 'Ringkasan aktivitas bar hari ini', icon: LayoutDashboard },
        { to: `${basePath}/daily-inventory`, label: 'Daily Inventory', subtitle: 'Catat stok harian bahan dan beer', icon: ClipboardCheck },
        { to: `${basePath}/olah-bahan`, label: 'Olah Bahan', subtitle: 'Produksi sirup dan urgent cutting portion', icon: Scissors },
        { to: `${basePath}/procurement?tab=invoicing`, label: 'Permintaan PO', subtitle: 'Ajukan PO bar dan terima barang', icon: ShoppingBag },
        { to: `${basePath}/transfer`, label: 'Minta ke Central', subtitle: 'Minta kirim barang dari Central (Rp 0)', icon: Truck }
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
        { to: `${basePath}/daily-inventory`, label: 'Stok Harian', subtitle: 'Pemakaian harian bahan dapur', icon: ClipboardCheck },
        { to: `${basePath}/olah-bahan`, label: 'Prep & Potong', subtitle: 'Potongan daging, ikan dan sayur', icon: Scissors },
        { to: `${basePath}/procurement?tab=invoicing`, label: 'Permintaan PO', subtitle: 'Ajukan PO dapur dan terima barang', icon: ShoppingBag },
        { to: `${basePath}/opname-assets`, label: 'Stock Opname', subtitle: 'Hitung fisik stok dapur', icon: PackageCheck },
        { to: `${basePath}/transfer`, label: 'Mutasi Gudang', subtitle: 'Minta bahan dari Central ke dapur', icon: Truck },
        { to: `${basePath}/pricing-cogs?tab=cogs-all`, label: 'Resep Dapur', subtitle: 'Resep masakan dan modal bahan', icon: BookOpen }
      ]
    },
    Service: {
      id: 'service-ops',
      title: 'Divisi Service',
      items: [
        { to: basePath, exact: true, label: 'Dashboard Service', subtitle: 'Ringkasan area floor dan alat', icon: LayoutDashboard },
        { to: `${basePath}/excel-so-glass-tool`, label: 'Gelas & Alat', subtitle: 'Stok gelas, alat dan catat pecah', icon: GlassWater },
        { to: `${basePath}/daily-inventory`, label: 'Stok Harian', subtitle: 'Pemakaian tisu, cup dan kemasan', icon: ClipboardCheck },
        { to: `${basePath}/procurement?tab=invoicing`, label: 'Permintaan PO', subtitle: 'Ajukan pembelian alat dan terima barang', icon: ShoppingBag }
      ]
    },
    Central: {
      id: 'central-ops',
      title: 'Gudang Central',
      items: [
        { to: basePath, exact: true, label: 'Dashboard Central', subtitle: 'Arus barang masuk dan keluar gudang', icon: LayoutDashboard },
        { to: `${basePath}/transfer`, label: 'Kirim ke Cabang', subtitle: 'Kirim stok Central ke BSD dan Kasuna', icon: Truck },
        { to: `${basePath}/procurement?tab=invoicing`, label: 'PO Central', subtitle: 'Ajukan PO grosir dan terima barang', icon: ShoppingBag },
        { to: `${basePath}/sistem?tab=stock-ledger`, label: 'Cek Stok Gudang', subtitle: 'Sisa stok Central dan seluruh cabang', icon: PackageCheck }
      ]
    },
    Purchasing: {
      id: 'purchasing-ops',
      title: 'Purchasing & PO',
      items: [
        { to: `${basePath}/procurement?tab=invoicing`, label: 'Daftar & Buat PO', subtitle: 'Buat PO baru, proses dan terima barang', icon: ShoppingBag },
        { to: basePath, exact: true, label: 'Ringkasan PO', subtitle: 'Total belanja dan status PO bulan ini', icon: LayoutDashboard },
        { to: `${basePath}/procurement?tab=marketlist`, label: 'Bandingkan Harga', subtitle: 'Perbandingan harga antar supplier', icon: Tag },
        { to: `${basePath}/procurement?tab=pembelian`, label: 'Supplier & Rekap', subtitle: 'Daftar supplier, rekap Tgl 1-31 dan Petty Cash', icon: Building2 }
      ]
    },
    Kasir: {
      id: 'kasir-ops',
      title: 'Layanan',
      items: [
        { to: basePath, exact: true, label: 'Dashboard', subtitle: 'Ringkasan harian', icon: LayoutDashboard },
        { to: `${basePath}/daily-inventory?tab=waste`, label: 'Lapor Rusak', subtitle: 'Catat barang pecah atau rusak', icon: AlertCircle }
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
        { to: basePath, exact: true, label: 'Dashboard', subtitle: 'Ringkasan biaya dan stok seluruh cabang', icon: LayoutDashboard }
      ]
    },
    {
      id: 'owner-ops',
      title: 'Operasional',
      items: [
        { to: `${basePath}/daily-inventory`, label: 'Daily Inventory', subtitle: 'Stok harian bahan, beer dan waste', icon: ClipboardCheck },
        { to: `${basePath}/olah-bahan`, label: 'Olah Bahan', subtitle: 'Produksi sirup dan urgent cutting portion', icon: Scissors },
        { to: `${basePath}/procurement`, label: 'Pengadaan & PO', subtitle: 'PO, bandingkan harga dan daftar supplier', icon: ShoppingBag },
        { to: `${basePath}/transfer`, label: 'Mutasi Gudang', subtitle: 'Transfer stok Central ke BSD dan Kasuna', icon: Truck }
      ]
    },
    {
      id: 'owner-analytics',
      title: 'Laporan & Audit',
      items: [
        { to: `${basePath}/pricing-cogs`, label: 'Menu & Resep', subtitle: 'Resep minuman, modal dan harga jual', icon: BookOpen },
        { to: `${basePath}/opname-assets`, label: 'Stock Opname', subtitle: 'Opname Resto, Central dan Gelas/Alat', icon: PackageCheck },
        { to: `${basePath}/cost-report`, label: 'Cost Control', subtitle: 'Cek selisih pemakaian dan rasio biaya', icon: BarChart3 },
        { to: `${basePath}/excel-berita-acara`, label: 'Berita Acara', subtitle: 'Berita Acara waste dan gelas pecah', icon: FileCheck2 }
      ]
    }
  );

  if (canAccessSettings) {
    groups.push({
      id: 'owner-system',
      title: 'Setelan',
      items: [
        { to: `${basePath}/sistem`, label: 'Pengaturan', subtitle: 'Profil resto, foto PDF Umatis, staf dan cabang', icon: Settings }
      ]
    });
  }

  return groups;
}
