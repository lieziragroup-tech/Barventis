import { getQuotationById } from "@/shared/api/quotationService";
import { useState, useEffect, useMemo } from "react";
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { Pagination } from '@/shared/ui/Pagination';
import { useNavigate } from "react-router-dom";
import {
    Hash, Plus, Download, Loader2, AlertCircle,
    CheckCircle2, Clock, XCircle, FileText,
    ChevronDown, X, PenLine, Search, Filter, RefreshCw, Trash2,
} from "lucide-react";
import { useAuthStore } from '@/app/store/authStore';
import { getNomorSuratLog, addManualNomorSurat, deleteNomorSurat } from '@/shared/api/nomorSuratService';
import { fmtDateID, TIPE_LABELS } from '@/shared/lib/quotationConfig';
import type { NomorSuratLog, KategoriSurat, TipeKontrak, QuotationStatus, JenisLayanan } from '@/entities/types';

const LOG_PAGE_SIZE = 10;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string; icon: React.ReactNode }> = {
    draft:    { label: "Draft",     color: "bg-slate-100 text-slate-600",      icon: <Clock size={11} /> },
    pending:  { label: "Pending",   color: "bg-amber-100 text-amber-700",      icon: <Clock size={11} /> },
    approved: { label: "Disetujui", color: "bg-emerald-100 text-emerald-700",  icon: <CheckCircle2 size={11} /> },
    rejected:       { label: "Ditolak",         color: "bg-red-100 text-red-600",          icon: <XCircle size={11} /> },
    sent_to_client: { label: "Dikirim Klien",   color: "bg-yellow-100 text-yellow-700",    icon: <Clock size={11} /> },
    deal:           { label: "Deal",             color: "bg-emerald-100 text-emerald-700",  icon: <CheckCircle2 size={11} /> },
    cancelled:      { label: "Batal",            color: "bg-slate-100 text-slate-500",      icon: <XCircle size={11} /> },
};

function StatusBadge({ status }: { status: QuotationStatus }) {
    const cfg = STATUS_CONFIG[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
            {cfg.icon} {cfg.label}
        </span>
    );
}

function KategoriBadge({ kategori, isManual }: { kategori: string; isManual?: boolean }) {
    if (isManual) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
            <PenLine size={10} /> Manual
        </span>
    );
    if (kategori === "AR")  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">AR</span>;
    if (kategori === "PCO") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700">PCO</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">Lainnya</span>;
}

// ─── DELETE CONFIRM MODAL ─────────────────────────────────────────────────────

function DeleteModal({
    log, onClose, onConfirm, loading,
}: {
    log: NomorSuratLog;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={22} className="text-red-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900 text-center mb-1">Hapus Nomor Surat?</h3>
                <p className="text-sm text-slate-500 text-center mb-1">
                    <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs">{log.noSurat}</code>
                </p>
                <p className="text-sm text-slate-500 text-center mb-4">Kepada <strong>{log.kepada}</strong></p>
                {log.quoId && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-700 text-center">
                        ⚠ Nomor ini terhubung ke quotation. Quotation tidak ikut terhapus.
                    </div>
                )}
                <div className="flex gap-2">
                    <button onClick={onClose} disabled={loading}
                        className="flex-1 px-4 py-2 text-sm rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium">
                        Batal
                    </button>
                    <button onClick={onConfirm} disabled={loading}
                        className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Hapus
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── MODAL TAMBAH MANUAL ──────────────────────────────────────────────────────

interface ManualModalProps {
    companyId: string;
    byUid: string;
    byName: string;
    onClose: () => void;
    onAdded: () => void;
}

function ManualEntryModal({ companyId, byUid, byName, onClose, onAdded }: ManualModalProps) {
    const [noSurat, setNoSurat]       = useState("");
    const [kategori, setKategori]     = useState<KategoriSurat | "LAINNYA">("AR");
    const [tipe, setTipe]             = useState<TipeKontrak>("U");
    const [kepada, setKepada]         = useState("");
    const [keterangan, setKeterangan] = useState("");
    const [tanggal, setTanggal]       = useState(() => new Date().toISOString().split("T")[0]);
    const [loading, setLoading]       = useState(false);
    const [err, setErr]               = useState("");

    useEffect(() => {
        const dateObj = new Date(tanggal);
        const year  = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const catCode = kategori === "LAINNYA" ? "MISC" : kategori;
        const generated = `GP-${catCode}/${tipe}/${year}/${month}/`;
        setNoSurat(prev => generated + (prev.split("/").pop() || "XXXX"));
    }, [kategori, tipe, tanggal]);

    const handleSave = async () => {
        if (!noSurat.trim() || noSurat.endsWith("XXXX")) { setErr("Lengkapi nomor surat dengan benar."); return; }
        if (!kepada.trim()) { setErr("Nama tujuan wajib diisi."); return; }
        setLoading(true); setErr("");
        try {
            await addManualNomorSurat({
                noSurat: noSurat.trim(), kategori: kategori as KategoriSurat,
                tipe, jenisLayanan: "manual_entry" as JenisLayanan,
                kepada: kepada.trim(), byUid, byName, companyId,
                keteranganManual: keterangan.trim(), dibuat: new Date(tanggal),
            });
            onAdded();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Terjadi kesalahan.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                        <PenLine size={15} className="text-amber-600" /> Tambah Nomor Manual
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Kategori</label>
                            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                                value={kategori} onChange={e => setKategori(e.target.value as any)}>
                                <option value="AR">Anti Rayap</option>
                                <option value="PCO">Pest Control</option>
                                <option value="LAINNYA">Lainnya</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Tipe</label>
                            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                                value={tipe} onChange={e => setTipe(e.target.value as TipeKontrak)}>
                                <option value="U">Umum</option>
                                <option value="K">Kontrak</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Tanggal Surat</label>
                        <input type="date" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                            value={tanggal} onChange={e => setTanggal(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nomor Surat <span className="text-red-500">*</span></label>
                        <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 font-mono font-bold text-blue-600"
                            placeholder="GP-AR/U/2026/03/0001" value={noSurat} onChange={e => setNoSurat(e.target.value)} />
                        <p className="text-[10px] text-slate-400 italic">Sesuaikan bagian akhir nomor urut.</p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Ditujukan Kepada <span className="text-red-500">*</span></label>
                        <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                            placeholder="Nama klien / perusahaan" value={kepada} onChange={e => setKepada(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Keterangan</label>
                        <textarea className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                            rows={2} placeholder="Opsional" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
                    </div>
                    {err && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            <AlertCircle size={14} /> {err}
                        </div>
                    )}
                </div>
                <div className="flex gap-3 px-5 pb-5">
                    <button onClick={onClose} disabled={loading}
                        className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50">Batal</button>
                    <button onClick={handleSave} disabled={loading}
                        className="flex-1 px-4 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 flex items-center justify-center gap-2">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {loading ? "Menyimpan..." : "Simpan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export function NomorSuratLogPage() {
    const navigate = useNavigate();
    const { user } = useAuthStore();

    const [logs, setLogs]             = useState<NomorSuratLog[]>([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState("");
    const [showModal, setShowModal]   = useState(false);
    const [showFilter, setShowFilter] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<NomorSuratLog | null>(null);
    const [deleting, setDeleting]         = useState(false);

    const [searchQ, setSearchQ]     = useState("");
    const [fKategori, setFKategori] = useState<"" | KategoriSurat | "LAINNYA">("");
    const [fTipe, setFTipe]         = useState<"" | TipeKontrak>("");
    const [fStatus, setFStatus]     = useState<"" | QuotationStatus>("");
    const [page, setPage] = useState(1);

    // Debounce 300ms — filter di client, tidak memicu pembacaan ulang database
    const debouncedSearch = useDebouncedValue(searchQ, 300);

    const isAdmin   = user?.role === "ADMIN";
    const canManage = user?.role === "ADMIN";

    const fetchLogs = async () => {
        if (!user?.companyId) return;
        setLoading(true); setError("");
        try {
            const data = await getNomorSuratLog({ companyId: user.companyId });
            setLogs(data);
        } catch {
            setError("Gagal memuat data. Periksa koneksi.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchLogs(); }, [user?.companyId]);

    // Memoized client-side filtering; only runs after the debounce window or a filter change.
    const filtered = useMemo(() => logs.filter(log => {
        const q = debouncedSearch.trim().toLowerCase();
        if (q && !log.noSurat.toLowerCase().includes(q) &&
            !log.kepada.toLowerCase().includes(q) &&
            !log.byName.toLowerCase().includes(q)) return false;
        if (fKategori && log.kategori !== fKategori) return false;
        if (fTipe && log.tipe !== fTipe) return false;
        if (fStatus && log.status !== fStatus) return false;
        return true;
    }), [logs, debouncedSearch, fKategori, fTipe, fStatus]);
    const pagedLogs = useMemo(() => filtered.slice((page - 1) * LOG_PAGE_SIZE, page * LOG_PAGE_SIZE), [filtered, page]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE));
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const stats = useMemo(() => ({
        total:    logs.length,
        approved: logs.filter(l => l.status === "approved").length,
        pending:  logs.filter(l => l.status === "pending").length,
        manual:   logs.filter(l => l.isManual).length,
    }), [logs]);

    const hasFilter = fKategori || fTipe || fStatus || debouncedSearch;

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteNomorSurat(deleteTarget.id);
            setLogs(prev => prev.filter(l => l.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch {
            alert("Gagal menghapus. Coba lagi.");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Hash size={20} className="text-blue-600" /> Log Nomor Surat
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">Dokumentasi nomor surat otomatis & manual</p>
                </div>
                {canManage && (
                    <button onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors shrink-0">
                        <PenLine size={14} /> <span className="hidden sm:inline">Tambah</span> Manual
                    </button>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Total Surat",   value: stats.total,    color: "text-slate-700",   bg: "bg-white border border-slate-200" },
                    { label: "Disetujui",     value: stats.approved, color: "text-emerald-700", bg: "bg-emerald-50 border border-emerald-100" },
                    { label: "Pending",       value: stats.pending,  color: "text-amber-700",   bg: "bg-amber-50 border border-amber-100" },
                    { label: "Manual",        value: stats.manual,   color: "text-blue-700",    bg: "bg-blue-50 border border-blue-100" },
                ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-3`}>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Search + Filter bar */}
            <div className="flex gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-100">
                    <Search size={14} className="text-slate-400 shrink-0" />
                    <input
                        className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400 min-w-0"
                        placeholder="Cari nomor, klien, pembuat..."
                        value={searchQ}
                        onChange={e => { setSearchQ(e.target.value); setPage(1); }}
                    />
                    {searchQ && (
                        <button onClick={() => { setSearchQ(""); setPage(1); }} className="text-slate-400 hover:text-slate-600 shrink-0">
                            <X size={13} />
                        </button>
                    )}
                </div>
                <button onClick={() => setShowFilter(f => !f)}
                    className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-sm font-medium transition-colors shrink-0
                        ${hasFilter ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    <Filter size={14} />
                    Filter
                    {hasFilter && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    <ChevronDown size={12} className={`transition-transform ${showFilter ? "rotate-180" : ""}`} />
                </button>
                <button onClick={fetchLogs} disabled={loading}
                    className="p-2 border border-slate-200 bg-white text-slate-500 rounded-xl hover:bg-slate-50 shrink-0">
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Filter panel */}
            {showFilter && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3">
                    <div className="space-y-1 min-w-28 flex-1">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Kategori</label>
                        <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                            value={fKategori} onChange={e => { setFKategori(e.target.value as any); setPage(1); }}>
                            <option value="">Semua</option>
                            <option value="AR">Anti Rayap</option>
                            <option value="PCO">Pest Control</option>
                        </select>
                    </div>
                    <div className="space-y-1 min-w-24 flex-1">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Tipe</label>
                        <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                            value={fTipe} onChange={e => { setFTipe(e.target.value as any); setPage(1); }}>
                            <option value="">Semua</option>
                            <option value="U">Umum</option>
                            <option value="K">Kontrak</option>
                        </select>
                    </div>
                    <div className="space-y-1 min-w-28 flex-1">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Status</label>
                        <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                            value={fStatus} onChange={e => { setFStatus(e.target.value as any); setPage(1); }}>
                            <option value="">Semua</option>
                            <option value="approved">Disetujui</option>
                            <option value="pending">Pending</option>
                            <option value="rejected">Ditolak</option>
                            <option value="draft">Draft</option>
                        </select>
                    </div>
                    <button onClick={() => { setFKategori(""); setFTipe(""); setFStatus(""); setSearchQ(""); setPage(1); }}
                        className="self-end px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                        Reset
                    </button>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Table / Cards */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <Loader2 size={24} className="animate-spin mr-2" /> Memuat data...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <Hash size={32} className="mb-3 opacity-20" />
                        <p className="font-medium text-slate-500">Tidak ada data</p>
                        <p className="text-sm mt-1">{hasFilter ? "Coba ubah filter." : "Belum ada nomor surat."}</p>
                    </div>
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide font-semibold">
                                        <th className="px-4 py-3 text-left">Nomor Surat</th>
                                        <th className="px-4 py-3 text-left">Ditujukan Kepada</th>
                                        <th className="px-4 py-3 text-left">Pembuat</th>
                                        <th className="px-4 py-3 text-left">Tanggal</th>
                                        <th className="px-4 py-3 text-left">Status</th>
                                        <th className="px-4 py-3 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody key={page} className="divide-y divide-slate-50 result-enter">
                                    {pagedLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <code className="text-xs font-bold font-mono text-slate-800">{log.noSurat}</code>
                                                    <KategoriBadge kategori={log.kategori} isManual={log.isManual} />
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${log.tipe === "K" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                                                        {TIPE_LABELS[log.tipe]}
                                                    </span>
                                                </div>
                                                {log.keteranganManual && (
                                                    <p className="text-[10px] text-slate-400 mt-0.5 italic">{log.keteranganManual}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 font-medium max-w-[180px] truncate">{log.kepada}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">{log.byName}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateID(log.dibuat)}</td>
                                            <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-1">
                                                    {log.quoId && !log.isManual && (
                                                        <button onClick={() => navigate("/quotations")} title="Lihat Quotation"
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                                            <FileText size={14} />
                                                        </button>
                                                    )}
                                                    {!log.isManual && log.quoId && (
                                                        <DownloadPdfButton quoId={log.quoId} noSurat={log.noSurat} />
                                                    )}
                                                    {isAdmin && (
                                                        <button onClick={() => setDeleteTarget(log)} title="Hapus"
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden divide-y divide-slate-100 result-enter" key={`mobile-${page}`}>
                            {pagedLogs.map(log => (
                                <div key={log.id} className="p-4 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                            <code className="text-xs font-bold font-mono text-slate-800 break-all">{log.noSurat}</code>
                                            <KategoriBadge kategori={log.kategori} isManual={log.isManual} />
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${log.tipe === "K" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                                                {TIPE_LABELS[log.tipe]}
                                            </span>
                                        </div>
                                        <StatusBadge status={log.status} />
                                    </div>
                                    <p className="text-sm font-medium text-slate-700 truncate">{log.kepada}</p>
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-xs text-slate-400">{log.byName} · {fmtDateID(log.dibuat)}</p>
                                            {log.keteranganManual && <p className="text-[10px] text-slate-400 italic mt-0.5">{log.keteranganManual}</p>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {log.quoId && !log.isManual && (
                                                <button onClick={() => navigate("/quotations")} title="Lihat"
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                                                    <FileText size={14} />
                                                </button>
                                            )}
                                            {!log.isManual && log.quoId && (
                                                <DownloadPdfButton quoId={log.quoId} noSurat={log.noSurat} />
                                            )}
                                            {isAdmin && (
                                                <button onClick={() => setDeleteTarget(log)} title="Hapus"
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Pagination page={page} pageSize={LOG_PAGE_SIZE} totalItems={filtered.length}
                            onPageChange={setPage} itemLabel="nomor surat" />
                    </>
                )}
            </div>

            {/* Modals */}
            {showModal && user && (
                <ManualEntryModal
                    companyId={user.companyId} byUid={user.uid} byName={user.name}
                    onClose={() => setShowModal(false)}
                    onAdded={() => { setShowModal(false); fetchLogs(); }}
                />
            )}
            {deleteTarget && (
                <DeleteModal
                    log={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={handleDelete}
                    loading={deleting}
                />
            )}
        </div>
    );
}

// ─── DOWNLOAD BUTTON ──────────────────────────────────────────────────────────

function DownloadPdfButton({ quoId, noSurat }: { quoId: string; noSurat: string }) {
    const [loading, setLoading] = useState(false);
    const handleClick = async () => {
        setLoading(true);
        try {
                        const quo = await getQuotationById(quoId);
            if (!quo?.pdfUrl) { alert("PDF tidak ditemukan."); return; }
            window.open(quo.pdfUrl, "_blank", "noopener,noreferrer");
        } catch {
            alert("Gagal mengunduh PDF.");
        } finally {
            setLoading(false);
        }
    };
    return (
        <button onClick={handleClick} disabled={loading} title="Download PDF"
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        </button>
    );
}