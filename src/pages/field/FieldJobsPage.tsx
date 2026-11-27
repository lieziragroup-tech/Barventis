import React, { useState, useEffect, useMemo } from "react";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { Pagination } from "@/shared/ui/Pagination";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/providers/AuthContext";
import { getSPKList } from "@/shared/api/spkService";
import type { SPK } from "@/entities/types";
import { FieldSignatureModal } from "../../components/common/FieldSignatureModal";
import {
    Search, RefreshCw, PenTool, Plus, ExternalLink, Phone
} from "lucide-react";

const SPK_PAGE_SIZE = 8;

export function FieldJobsPage() {
    const { user } = useAuth();
    const [spks, setSpks] = useState<SPK[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<"all" | "assigned" | "in_progress" | "done">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebouncedValue(searchQuery, 300);
    const [signingSPK, setSigningSPK] = useState<SPK | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const list = await getSPKList({
                companyId: user?.companyId || "comp_guci_01",
            });
            setSpks(list);
        } catch {
            // handled
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [user]);

    const filtered = useMemo(() => {
        const q = debouncedSearch.trim().toLowerCase();
        return spks.filter(s => {
            if (filterStatus !== "all" && s.status !== filterStatus) return false;
            if (!q) return true;
            return s.customerName.toLowerCase().includes(q) ||
                s.lokasi.toLowerCase().includes(q) ||
                (s.quotationNoSurat || "").toLowerCase().includes(q) ||
                s.perihal.toLowerCase().includes(q);
        });
    }, [spks, filterStatus, debouncedSearch]);
    const pagedSpks = useMemo(() => filtered.slice((page - 1) * SPK_PAGE_SIZE, page * SPK_PAGE_SIZE), [filtered, page]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / SPK_PAGE_SIZE));
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="clean-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] tracking-tight">Daftar Penugasan Kerja</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Jadwal penanganan operasional layanan di lokasi klien
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={loadData}
                        className="p-2.5 rounded-xl border border-[var(--border)] bg-[#faf9f7] hover:bg-[#f5f3ef] text-[var(--text-secondary)] transition-colors cursor-pointer shrink-0"
                        title="Segarkan data"
                    >
                        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    </button>
                    <Link
                        to="/quotations/new"
                        className="px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                    >
                        <Plus size={14} /> Buat Penawaran
                    </Link>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        placeholder="Cari nama klien, lokasi, nomor surat..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-[var(--border)] rounded-xl text-xs sm:text-sm focus:outline-none focus:border-[var(--accent)]"
                    />
                </div>

                <div className="flex bg-[#f5f3ef] border border-[#e8e5e0] p-1 rounded-xl text-xs font-bold overflow-x-auto shrink-0">
                    {(["all", "assigned", "in_progress", "done"] as const).map((st) => (
                        <button
                            key={st}
                            onClick={() => { setFilterStatus(st); setPage(1); }}
                            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                                filterStatus === st ? "bg-white text-[var(--text-primary)] font-bold shadow-xs" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                        >
                            {st === "all" ? "Semua" : st === "assigned" ? "Terjadwal" : st === "in_progress" ? "Berjalan" : "Selesai"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Work Orders List */}
            <div className="space-y-3 result-enter" key={page}>
                {loading ? (
                    <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
                        <RefreshCw size={20} className="animate-spin mx-auto text-slate-400 mb-2" />
                        <p className="text-xs text-slate-500">Memuat penugasan...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
                        <p className="text-xs text-slate-500">Tidak ada penugasan yang sesuai kriteria.</p>
                    </div>
                ) : (
                    pagedSpks.map((spk) => (
                        <div
                            key={spk.id}
                            className="clean-card p-5 sm:p-6 space-y-3.5 hover:border-emerald-300 transition-colors"
                        >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-base font-semibold text-slate-900">{spk.customerName}</h3>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                        <span>{spk.serviceType === "TERMITE_CONTROL" ? "Anti Rayap" : "Pest Control"}</span>
                                        <span>·</span>
                                        <span className="font-mono">{spk.quotationNoSurat || spk.id}</span>
                                        <span>·</span>
                                        <span>
                                            {new Date(spk.scheduleDate).toLocaleDateString("id-ID", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            })}
                                        </span>
                                    </div>
                                </div>

                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded self-start ${
                                    spk.status === "in_progress"
                                        ? "bg-amber-50 text-amber-800 border border-amber-200"
                                        : spk.status === "done"
                                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                        : "bg-slate-100 text-slate-700 border border-slate-200"
                                }`}>
                                    {spk.status === "in_progress" ? "Sedang Berjalan" : spk.status === "done" ? "Selesai" : "Terjadwal"}
                                </span>
                            </div>

                            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <div className="font-medium text-slate-800">{spk.perihal}</div>
                                {spk.notes && <div className="text-slate-500 mt-1 text-[11px]">{spk.notes}</div>}
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-2">
                                <span className="truncate">Lokasi: {spk.lokasi}</span>
                                <div className="flex items-center gap-3 shrink-0">
                                    <a
                                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(spk.lokasi)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-700 hover:text-blue-800 font-medium inline-flex items-center gap-1 text-[11px]"
                                    >
                                        <ExternalLink size={12} /> Buka Peta
                                    </a>
                                    <a
                                        href="https://wa.me/6281298765001"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-emerald-700 hover:text-emerald-800 font-medium inline-flex items-center gap-1 text-[11px]"
                                    >
                                        <Phone size={12} /> Hubungi Klien
                                    </a>
                                </div>
                            </div>

                            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                                <span className="text-slate-500 text-[11px]">
                                    Teknisi: <strong className="text-slate-700 font-medium">{spk.technicianName}</strong>
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setSigningSPK(spk)}
                                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center gap-1"
                                    >
                                        <PenTool size={12} /> TTD Klien
                                    </button>
                                    <Link
                                        to="/field/dashboard"
                                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium"
                                    >
                                        Buka Detail
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))
                )}
                {!loading && filtered.length > 0 && (
                    <Pagination page={page} pageSize={SPK_PAGE_SIZE} totalItems={filtered.length}
                        onPageChange={setPage} itemLabel="penugasan" />
                )}
            </div>

            {signingSPK && (
                <FieldSignatureModal
                    isOpen={true}
                    title={`Tanda Tangan Klien - ${signingSPK.customerName}`}
                    subtitle={`Verifikasi pekerjaan: ${signingSPK.perihal}`}
                    onClose={() => setSigningSPK(null)}
                    onSave={() => setSigningSPK(null)}
                />
            )}
        </div>
    );
}
