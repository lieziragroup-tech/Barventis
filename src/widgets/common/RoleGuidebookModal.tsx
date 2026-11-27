import React, { useState } from 'react';
import {
    X, BookOpen, Crown, ShieldCheck, Target,
    Package, Smartphone, CheckCircle2, ArrowRight,
    Lock, Sparkles, Layers,
} from 'lucide-react';
import { useAuthStore } from '@/app/store/authStore';
import { isDirectorUser } from '@/shared/lib/roles';

export type GuideRole = 'SUPERADMIN' | 'ADMIN' | 'MARKETING' | 'INVENTORY' | 'TEKNISI_LAPANGAN';

interface RoleGuidebookModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialRole?: GuideRole;
}

interface RoleGuideContent {
    id: GuideRole;
    badge: string;
    title: string;
    subtitle: string;
    accentColor: string;
    icon: React.ReactNode;
    responsibilities: string[];
    steps: {
        num: string;
        title: string;
        desc: string;
        tag: string;
    }[];
    tips: string[];
}

const ROLE_GUIDES: Record<GuideRole, RoleGuideContent> = {
    SUPERADMIN: {
        id: 'SUPERADMIN',
        badge: 'Eksekutif & Pemilik Bisnis',
        title: 'Direktur Utama / Superadmin',
        subtitle: 'Approval legalitas harga, pemantauan margin keuntungan chemical, dan arus kas eksekutif.',
        accentColor: 'from-amber-600 to-amber-700',
        icon: <Crown size={20} className="text-amber-500" />,
        responsibilities: [
            'Otoritas persetujuan penawaran resmi dari draft (GP-DRF menjadi Nomor Surat Resmi).',
            'Hak akses eksklusif melihat nilai kontrak, HPP bahan kimia, dan margin untung rugi (%) per ID Proyek.',
            'Pemantauan laporan arus kas (Cashflow), piutang termin, dan performa MoM seluruh surveyor.',
        ],
        steps: [
            {
                num: '01',
                title: 'Review & Terbitkan Approval Penawaran',
                desc: 'Buka menu "Approval & Pantau Penawaran". Tinjau rincian survei dari marketing, periksa estimasi margin, lalu klik Approve untuk menerbitkan nomor surat resmi tanpa kode draft.',
                tag: 'Menu Approval PH',
            },
            {
                num: '02',
                title: 'Pantau Analisis Untung Rugi Chemical',
                desc: 'Buka menu "Analisis Untung Rugi Proyek". Anda dapat memantau perbandingan nilai kontrak vs biaya riil chemical yang dipakai oleh tim teknisi (target margin sehat >= 45%).',
                tag: 'Khusus Direktur',
            },
            {
                num: '03',
                title: 'Evaluasi Arus Kas & Pertumbuhan MoM',
                desc: 'Tinjau modul "Laporan Pemasukan & Cashflow" serta "Performa MoM" untuk melihat tren rasio closing deal seluruh anggota tim marketing per bulan berjalan.',
                tag: 'Cashflow & MoM',
            },
        ],
        tips: [
            'Angka keuntungan finansial proyek otomatis disembunyikan dari staf gudang, admin, dan marketing.',
            'Anda dapat menetapkan target bulanan masing-masing staf marketing langsung dari halaman Performa MoM.',
        ],
    },
    ADMIN: {
        id: 'ADMIN',
        badge: 'Operasional & Supervisi',
        title: 'Admin Operasional',
        subtitle: 'Pengatur jadwal SPK penugasan kerja, pengawasan presensi GPS, dan verifikasi anomali laporan.',
        accentColor: 'from-blue-600 to-blue-700',
        icon: <ShieldCheck size={20} className="text-blue-500" />,
        responsibilities: [
            'Menerbitkan Surat Perintah Kerja (SPK) untuk teknisi lapangan berdasarkan penawaran yang deal.',
            'Mengawasi presensi kehadiran teknisi di radius proyek dan memverifikasi laporan anomali (>300m / <15m).',
            'Mengelola akun pengguna perusahaan, aturan poin kehadiran, dan ekspor berkas berita acara.',
        ],
        steps: [
            {
                num: '01',
                title: 'Penerbitan Surat Perintah Kerja (SPK)',
                desc: 'Buka menu "Perintah Kerja (SPK)", pilih proyek atau penawaran klien, lalu tentukan teknisi pelaksana dan tanggal operasional lapangan.',
                tag: 'Menu SPK',
            },
            {
                num: '02',
                title: 'Monitoring Kehadiran & Anomali Lapangan',
                desc: 'Cek "Hasil Kerja Teknisi" dan "Verifikasi Laporan Anomali". Sistem menandai otomatis jika teknisi check-in di luar radius atau pekerjaan diselesaikan terlalu cepat.',
                tag: 'Risk Engine',
            },
            {
                num: '03',
                title: 'Ekspor Berkas & Riwayat Kerja',
                desc: 'Unduh rekap laporan pekerjaan teknisi ke format PDF formal ber-watermark atau ekspor CSV/Excel untuk rekonsiliasi akhir bulan.',
                tag: 'Ekspor Dokumen',
            },
        ],
        tips: [
            'Setelah teknisi melakukan Check-in di lokasi, detail proyek dikunci oleh sistem untuk mencegah manipulasi data.',
            'Alokasi chemical gudang dapat dipantau dari menu Alokasi Proyek tanpa menampilkan angka keuntungan rahasia direktur.',
        ],
    },
    MARKETING: {
        id: 'MARKETING',
        badge: 'Surveyor & Penjualan',
        title: 'Marketing & Surveyor',
        subtitle: 'Penyusunan penawaran harga dual-stage, negosiasi klien, dan pemantauan rasio closing personal.',
        accentColor: 'from-emerald-600 to-emerald-700',
        icon: <Target size={20} className="text-emerald-500" />,
        responsibilities: [
            'Menginput hasil survei lapangan dan membuat draft penawaran komersial (GP-DRF).',
            'Menegosiasikan opsi diskon, masa garansi (1/3/5 tahun), dan skema PPN kepada calon klien.',
            'Memantau KPI rasio closing deal diri sendiri di dashboard MoM terisolasi (Anti Rayap vs Pest Control).',
        ],
        steps: [
            {
                num: '01',
                title: 'Pembuatan Draft Penawaran (GP-DRF)',
                desc: 'Buka menu "Buat & Cek Penawaran". Masukkan ukuran survei (bisa rumus: 37+37+5,5), pilih kategori layanan (Anti Rayap / Pest Control), lalu unduh preview PDF draft.',
                tag: 'Drafting GP-DRF',
            },
            {
                num: '02',
                title: 'Negosiasi & Pengajuan Approval',
                desc: 'Diskusikan revisi penawaran jika klien meminta penyesuaian. Setelah disepakati, mintakan tanda tangan approval resmi ke Direktur agar kode DRF dihapus.',
                tag: 'Closing Klien',
            },
            {
                num: '03',
                title: 'Cek KPI Pribadi di Performa MoM',
                desc: 'Buka menu "Persentase Performa (MoM)". Anda dapat melihat data pribadi: persentase deal Anti Rayap vs Pest Control serta pertumbuhan performa dibanding bulan lalu.',
                tag: 'Data Terisolasi',
            },
        ],
        tips: [
            'Data penawaran staf marketing lain otomatis disembunyikan demi menjaga privasi performa antar-staf.',
            'Format alamat klien kini dipisah menjadi 2 baris (Jalan & Wilayah) lengkap dengan panduan hint pengisian.',
        ],
    },
    INVENTORY: {
        id: 'INVENTORY',
        badge: 'Gudang & Logistik',
        title: 'Staf Gudang & Chemical',
        subtitle: 'Pengelolaan persediaan termitisida/pestisida, pencatatan mutasi, dan alokasi fisik chemical ke proyek.',
        accentColor: 'from-purple-600 to-purple-700',
        icon: <Package size={20} className="text-purple-500" />,
        responsibilities: [
            'Mencatat penerimaan stok obat masuk (IN) dan pengeluaran obat keluar (OUT).',
            'Mengalokasikan jumlah fisik chemical (Botol/Liter) langsung ke masing-masing ID Proyek yang berjalan.',
            'Memantau peringatan stok minimum agar persediaan tidak habis saat teknisi bertugas.',
        ],
        steps: [
            {
                num: '01',
                title: 'Pencatatan Stok Masuk / Pembelian',
                desc: 'Buka tab "Daftar Stok Obat & Alat", klik tombol "Obat Masuk" untuk menambah saldo barang yang baru dikirim supplier.',
                tag: 'Mutasi Masuk',
            },
            {
                num: '02',
                title: 'Alokasi Bahan Kimia ke ID Proyek',
                desc: 'Buka tab "Alokasi Chemical Proyek". Pilih proyek yang dituju dan catat bahan kimia yang diambil teknisi. Nilai keuntungan dan margin finansial dikunci khusus Direktur.',
                tag: 'Alokasi Fisik',
            },
            {
                num: '03',
                title: 'Pantau Peringatan Stok Hampir Habis',
                desc: 'Tinjau tab "Stok Hampir Habis" berlogo merah untuk segera mengajukan pengadaan barang yang saldonya sudah di bawah batas aman.',
                tag: 'Stok Alert',
            },
        ],
        tips: [
            'Seluruh pemotongan stok berjalan lewat transaksi atomik di basis data untuk mencegah selisih hitungan stok.',
            'Disediakan tombol ekspor Excel untuk pembuatan laporan rekap persediaan bulanan.',
        ],
    },
    TEKNISI_LAPANGAN: {
        id: 'TEKNISI_LAPANGAN',
        badge: 'Pelaksana Lapangan',
        title: 'Teknisi Lapangan',
        subtitle: 'Aplikasi mobile PWA untuk eksekusi tugas, presensi GPS, foto bukti, dan input dosis perlakuan.',
        accentColor: 'from-emerald-700 to-teal-800',
        icon: <Smartphone size={20} className="text-emerald-400" />,
        responsibilities: [
            'Melakukan GPS Check-in di lokasi proyek dalam batas toleransi radius (maksimal 300 meter).',
            'Mengambil foto dokumentasi WebP bertanda watermark (sebelum, progres, dan sesudah perlakuan).',
            'Mencatat formulir aplikasi chemical berstandar SNI 2404 dan meminta tanda tangan digital klien.',
        ],
        steps: [
            {
                num: '01',
                title: 'Buka Jadwal di Menu "Tugas"',
                desc: 'Buka antarmuka ponsel Anda, lihat jadwal pekerjaan hari ini, dan tekan tombol "Check-in GPS" saat sudah tiba di lokasi klien.',
                tag: 'GPS Check-in',
            },
            {
                num: '02',
                title: 'Eksekusi & Lampirkan Bukti Foto',
                desc: 'Gunakan kamera bawaan aplikasi. Ambil minimal 3 foto (Sebelum, Progres, Sesudah). Gunakan alat ukur AR atau Fallback Foto jika perlu mengukur panjang pondasi.',
                tag: 'Foto Evidence',
            },
            {
                num: '03',
                title: 'Input Dosis & Check-out Selesai',
                desc: 'Isi catatan bahan kimia yang disemprotkan/diinjeksi. Minta paraf digital klien pada layar ponsel, lalu tekan "Check-out GPS". Jika sinyal hilang, sistem menyimpan di antrean offline.',
                tag: 'Offline Resilience',
            },
        ],
        tips: [
            'Aplikasi tetap berfungsi penuh di basement/tanpa sinyal — data otomatis terkirim begitu ponsel mendapat sinyal kembali.',
            'Navigasi melayang Dynamic Island di bawah akan otomatis sembunyi saat keyboard muncul agar layar tidak tertutup.',
        ],
    },
};

export function RoleGuidebookModal({ isOpen, onClose, initialRole }: RoleGuidebookModalProps) {
    const user = useAuthStore(s => s.user);
    const isDirector = isDirectorUser(user);

    // Kunci panduan secara ketat hanya untuk role pengguna yang sedang login
    const userRole: GuideRole = initialRole || (
        isDirector
            ? 'SUPERADMIN'
            : (user?.role === 'ADMIN' ? 'ADMIN'
                : user?.role === 'MARKETING' ? 'MARKETING'
                    : user?.role === 'INVENTORY' ? 'INVENTORY'
                        : 'TEKNISI_LAPANGAN')
    );

    if (!isOpen) return null;

    const currentGuide = ROLE_GUIDES[userRole] || ROLE_GUIDES.ADMIN;
    return (
        <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 modal-overlay-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guidebook-title"
            onClick={onClose}
        >
            <div
                className="bg-[var(--bg-primary)] w-full max-w-3xl max-h-[90vh] rounded-3xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden modal-card-in select-none"
                onClick={e => e.stopPropagation()}
            >
                {/* Header Modal - Khusus Role Pengguna */}
                <div className="p-4 sm:p-5 border-b border-[var(--border)] bg-white flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center font-bold shrink-0 shadow-2xs">
                            <BookOpen size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 id="guidebook-title" className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight">
                                    Panduan Alur: {currentGuide.title}
                                </h2>
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                    Role Aktif Anda
                                </span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                Instruksi langkah operasional harian dan batasan wewenang resmi akun Anda.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 rounded-xl border border-[var(--border)] bg-[#faf9f7] hover:bg-[#f5f3ef] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        aria-label="Tutup Panduan"
                    >
                        <X size={16} />
                    </button>
                </div>
                {/* Content Area */}
                <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-[var(--text-primary)]">
                    {/* Role Header Banner */}
                    <div className="p-4 rounded-2xl bg-white border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-[#faf9f7] border border-[#e8e5e0] flex items-center justify-center shrink-0">
                                {currentGuide.icon}
                            </div>
                            <div>
                                <span className="inline-block px-2 py-0.5 rounded-md bg-[var(--accent-glow)] text-[var(--accent)] font-bold text-[10px] uppercase tracking-wider mb-1">
                                    {currentGuide.badge}
                                </span>
                                <h3 className="text-base font-extrabold text-[var(--text-primary)] leading-snug">
                                    {currentGuide.title}
                                </h3>
                                <p className="text-[11.5px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                                    {currentGuide.subtitle}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Tanggung Jawab Utama */}
                    <div className="space-y-2">
                        <h4 className="font-extrabold text-xs uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                            <Layers size={13} className="text-[var(--accent)]" />
                            Wewenang &amp; Tanggung Jawab Utama
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            {currentGuide.responsibilities.map((resp, i) => (
                                <div key={i} className="p-3 rounded-xl bg-white border border-[var(--border)] space-y-1">
                                    <div className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px]">
                                        {i + 1}
                                    </div>
                                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                        {resp}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 3 Langkah Cepat Operasional */}
                    <div className="space-y-2.5">
                        <h4 className="font-extrabold text-xs uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                            <ArrowRight size={13} className="text-[var(--accent)]" />
                            Alur 3 Langkah Praktis
                        </h4>
                        <div className="space-y-2.5">
                            {currentGuide.steps.map(step => (
                                <div
                                    key={step.num}
                                    className="p-3.5 rounded-2xl bg-white border border-[var(--border)] flex items-start gap-3 hover:border-emerald-300 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-xl bg-[var(--accent)] text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                        {step.num}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <h5 className="font-bold text-xs sm:text-sm text-[var(--text-primary)]">
                                                {step.title}
                                            </h5>
                                            <span className="px-2 py-0.5 rounded-full bg-[#f5f3ef] text-[#5a554f] font-mono font-bold text-[10px]">
                                                {step.tag}
                                            </span>
                                        </div>
                                        <p className="text-[11.5px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                                            {step.desc}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tips Penting & Batasan Keamanan */}
                    <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                            <Sparkles size={14} className="text-amber-600" />
                            Catatan Penting &amp; Batasan Keamanan Role
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-950/90 leading-relaxed pl-1">
                            {currentGuide.tips.map((tip, i) => (
                                <li key={i}>{tip}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Footer Modal */}
                <div className="p-3.5 sm:p-4 border-t border-[var(--border)] bg-white flex items-center justify-between gap-3 shrink-0">
                    <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline-block">
                        Akun aktif: <strong>{user?.name || 'Pengguna'}</strong> ({currentGuide.badge})
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold text-xs transition-colors cursor-pointer ml-auto flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                        <CheckCircle2 size={14} /> Mengerti, Lanjut Bekerja
                    </button>
                </div>
            </div>
        </div>
    );
}
