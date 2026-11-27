/**
 * ComingSoonPage — placeholder untuk fitur yang belum dibangun.
 * Dipakai oleh route: /customers, /spk, /reports, /cashflow, /performance, /settings
 */
import { useLocation } from "react-router-dom";
import {
    Users, ClipboardList, Wrench, DollarSign,
    TrendingUp, Settings, Clock,
} from "lucide-react";

const PAGE_META: Record<string, { label: string; icon: React.ReactNode; desc: string }> = {
    "/customers": {
        label: "Pelanggan",
        icon: <Users size={32} className="text-blue-500" />,
        desc: "Kelola data pelanggan, riwayat layanan, dan informasi kontak.",
    },
    "/spk": {
        label: "SPK",
        icon: <ClipboardList size={32} className="text-amber-500" />,
        desc: "Surat Perintah Kerja — penugasan teknisi ke lapangan.",
    },
    "/reports": {
        label: "Laporan Teknisi",
        icon: <Wrench size={32} className="text-emerald-500" />,
        desc: "Laporan pekerjaan teknisi setelah eksekusi SPK di lapangan.",
    },
    "/cashflow": {
        label: "Cashflow",
        icon: <DollarSign size={32} className="text-green-500" />,
        desc: "Pantau arus kas, tagihan, dan pembayaran perusahaan.",
    },
    "/performance": {
        label: "Performa",
        icon: <TrendingUp size={32} className="text-indigo-500" />,
        desc: "Analisis performa tim marketing, teknisi, dan perusahaan.",
    },
    "/settings": {
        label: "Pengaturan",
        icon: <Settings size={32} className="text-slate-500" />,
        desc: "Konfigurasi perusahaan, tarif layanan, dan preferensi sistem.",
    },
};

export function ComingSoonPage() {
    const { pathname } = useLocation();
    const meta = PAGE_META[pathname] ?? {
        label: "Halaman Ini",
        icon: <Clock size={32} className="text-slate-400" />,
        desc: "Fitur ini sedang dalam pengembangan.",
    };

    return (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
                    {meta.icon}
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full mb-3">
                    <Clock size={11} /> Segera Hadir
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">{meta.label}</h1>
                <p className="text-sm text-slate-500 leading-relaxed">{meta.desc}</p>
            </div>
        </div>
    );
}