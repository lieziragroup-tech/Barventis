import { useState } from "react";
import { useAuth } from '@/app/providers/AuthContext';
import { Ruler, CheckCircle2, MoreVertical } from "lucide-react";
import { Link } from "react-router-dom";

export function FieldDashboardPage() {
    const { user } = useAuth();
    const [status, setStatus] = useState<"idle" | "working">("idle");
    const [selectedSchedule, setSelectedSchedule] = useState<number>(0);

    const schedules = [
        {
            dateLabel: "Jumat, 6 Nov 2026",
            timeRange: "08.00 - 14.00",
            clientName: "RS PON Mahar Mardjono",
            subLocation: "Pest Control • Gedung Utama",
            notes: [
                "Bersihkan & inspeksi area konsumen serta ruang VVIP sesuai SOP karena ada kunjungan tamu VIP",
                "Pastikan presensi GPS di dalam radius proyek (≤ 300m)"
            ]
        },
        {
            dateLabel: "Sabtu, 7 Nov 2026",
            timeRange: "08.00 - 14.00",
            clientName: "RS Permata Sarana Husada",
            subLocation: "Anti Rayap • Jalur Pondasi",
            notes: [
                "Injeksi jalur pondasi & pemeriksaan bait station In-Ground (IG)",
                "Dokumentasikan minimal 3 foto (Sebelum, Progres, Sesudah)"
            ]
        }
    ];

    const activeItem = schedules[selectedSchedule] || schedules[0];

    return (
        <div className="max-w-xl mx-auto overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-sm">
            {/* Top Emerald Hero Section */}
            <div className="bg-[var(--accent)] text-white px-5 pt-5 pb-9">
                <div className="flex items-center justify-end mb-2">
                    <div className="relative w-9 h-9 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-xs font-bold">
                        {(user?.name || "U").slice(0, 2).toUpperCase()}
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 border border-[var(--accent)]" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-white">
                    Selamat Pagi, {user?.name?.split(" ")[0] || "User"}
                </h2>

                <p className="text-sm font-medium text-white/90 mt-3 mb-2.5">Jadwal</p>
                <div className="grid grid-cols-2 gap-3">
                    {schedules.map((sc, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedSchedule(idx)}
                            className={`bg-white text-slate-900 rounded-2xl p-3.5 text-left shadow-md transition-all cursor-pointer border-2 ${
                                selectedSchedule === idx ? "border-emerald-300" : "border-transparent opacity-95"
                            }`}
                        >
                            <p className="text-sm font-bold text-slate-900 leading-snug">{sc.dateLabel}</p>
                            <div className="flex items-center justify-between mt-3">
                                <span className="text-xs font-medium text-slate-700">{sc.timeRange}</span>
                                <MoreVertical size={15} className="text-slate-700" />
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Rounded Sheet Container */}
            <div className="bg-[var(--bg-primary)] rounded-t-[28px] -mt-4 pt-3.5 px-4 pb-6 space-y-4">
                <div className="flex items-center justify-center gap-2">
                    {[0, 1, 2, 3, 4].map(i => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedSchedule(i < schedules.length ? i : 0)}
                            className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                                i === selectedSchedule ? "bg-[var(--accent)]" : "bg-slate-300"
                            }`}
                        />
                    ))}
                </div>

                <h3 className="text-base font-medium text-slate-800">Detail Hari ini</h3>

                {/* Split Task Card */}
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-md overflow-hidden">
                    <div className="p-4">
                        <p className="text-base font-bold text-slate-900 text-right">{activeItem.dateLabel}</p>
                        <div className="flex items-start justify-between gap-3 mt-3">
                            <div>
                                <p className="text-xs sm:text-sm font-semibold text-slate-900">{activeItem.clientName}</p>
                                <p className="text-xs text-slate-600">{activeItem.subLocation}</p>
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-slate-800 shrink-0">{activeItem.timeRange}</span>
                        </div>
                    </div>
                    <div className="border-t border-slate-300 px-4 py-3 bg-white">
                        <p className="text-xs font-medium text-slate-800 mb-1">Notes :</p>
                        <ul className="list-disc pl-4 text-xs text-slate-700 space-y-1">
                            {activeItem.notes.map((n, idx) => (
                                <li key={idx}>{n}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                {status === "idle" ? (
                    <div className="space-y-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setStatus("working")}
                            className="w-full py-3.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-bold text-sm shadow-md transition-colors cursor-pointer"
                        >
                            Clock In
                        </button>
                        <Link
                            to="/field/jobs"
                            className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-semibold text-xs flex items-center justify-center transition-colors"
                        >
                            Lihat Semua Tugas
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-2.5 pt-2">
                        <Link
                            to="/field/ar-measure"
                            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-emerald-50/70 border border-slate-200 text-slate-800 p-3 rounded-xl font-bold text-xs transition-colors"
                        >
                            <Ruler size={15} className="text-[var(--accent)]" />
                            Ukur Panjang Kerja (Meteran Kamera SNI 2404)
                        </Link>
                        <button
                            type="button"
                            onClick={() => setStatus("idle")}
                            className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                            <CheckCircle2 size={16} /> Pekerjaan Selesai &amp; Clock Out
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
