import { useState, useEffect, useMemo } from "react";
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { Pagination } from '@/shared/ui/Pagination';
import {
    Send, CheckCircle2, XCircle, Clock, RefreshCw,
    ChevronDown, Search, FileText,
    TrendingUp, AlertCircle, Filter, MessageCircle,
} from "lucide-react";
import { collection, query, where, getDocs, Timestamp } from '@/shared/lib/firebase';
import { db } from '@/shared/lib/firebase';
import { useAuthStore } from '@/app/store/authStore';
import { updateQuotationStatus } from '@/shared/api/quotationService';
import { LAYANAN_CONFIG } from '@/shared/lib/quotationConfig';
import { formatRupiah, formatDate } from '@/shared/lib/utils';
import type { Quotation, QuotationStatus } from '@/entities/types';

// ─── STATUS PIPELINE ──────────────────────────────────────────────────────────

const PIPELINE: { status: QuotationStatus; label: string; color: string; bg: string; icon: React.ReactNode }[] = [
    { status: "approved",       label: "Disetujui Admin",  color: "#3b82f6", bg: "#dbeafe", icon: <CheckCircle2 size={14} /> },
    { status: "sent_to_client", label: "Dikirim ke Klien", color: "#d97706", bg: "#fef3c7", icon: <Send size={14} /> },
    { status: "deal",           label: "Deal",             color: "#16a34a", bg: "#dcfce7", icon: <CheckCircle2 size={14} /> },
    { status: "cancelled",      label: "Batal / Ditolak",  color: "#9ca3af", bg: "#f3f4f6", icon: <XCircle size={14} /> },
];

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: QuotationStatus }) {
    const cfg = PIPELINE.find(p => p.status === status) ?? {
        label: status, color: "#64748b", bg: "#f1f5f9", icon: <Clock size={12} />,
    };
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.icon}
            {cfg.label}
        </span>
    );
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────

function ConfirmModal({
    open, onClose, onConfirm,
    quotation, nextStatus, loading,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    quotation: Quotation | null;
    nextStatus: QuotationStatus | null;
    loading: boolean;
}) {
    if (!open || !quotation || !nextStatus) return null;

    const cfg = {
        sent_to_client: {
            title: "Tandai Sudah Dikirim ke Klien?",
            desc: "Quotation ini akan ditandai sudah dikirim/diteruskan ke klien.",
            btnLabel: "Ya, Sudah Dikirim",
            btnColor: "bg-amber-500 hover:bg-amber-600",
            icon: <Send size={24} className="text-amber-600" />,
            iconBg: "bg-amber-100",
        },
        deal: {
            title: "Konfirmasi Deal?",
            desc: "Klien telah menyetujui penawaran ini. Quotation akan masuk ke Cashflow & Performa.",
            btnLabel: "Konfirmasi Deal",
            btnColor: "bg-green-600 hover:bg-green-700",
            icon: <CheckCircle2 size={24} className="text-green-600" />,
            iconBg: "bg-green-100",
        },
        cancelled: {
            title: "Tandai Batal?",
            desc: "Klien tidak setuju atau penawaran dibatalkan. Status akan menjadi Batal.",
            btnLabel: "Tandai Batal",
            btnColor: "bg-slate-600 hover:bg-slate-700",
            icon: <XCircle size={24} className="text-slate-500" />,
            iconBg: "bg-slate-100",
        },
    }[nextStatus as string] ?? null;

    if (!cfg) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
                <div className={`w-12 h-12 ${cfg.iconBg} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                    {cfg.icon}
                </div>
                <h3 className="text-base font-bold text-slate-900 text-center mb-1">{cfg.title}</h3>
                <p className="text-sm text-slate-500 text-center mb-1">
                    <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs">{quotation.noSurat}</code>
                </p>
                <p className="text-sm text-slate-500 text-center mb-2">
                    <strong>{quotation.kepadaNama}</strong>
                </p>
                <p className="text-sm text-slate-600 font-semibold text-center mb-4">{formatRupiah(quotation.total)}</p>
                <p className="text-xs text-slate-400 text-center bg-slate-50 rounded-lg px-3 py-2 mb-5">{cfg.desc}</p>
                <div className="flex gap-2">
                    <button onClick={onClose} disabled={loading}
                        className="flex-1 px-4 py-2 text-sm rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium">
                        Batal
                    </button>
                    <button onClick={onConfirm} disabled={loading}
                        className={`flex-1 px-4 py-2 text-sm rounded-lg text-white font-medium ${cfg.btnColor} disabled:opacity-50 flex items-center justify-center gap-2`}>
                        {loading && <RefreshCw size={13} className="animate-spin" />}
                        {cfg.btnLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── QUOTATION CARD ───────────────────────────────────────────────────────────

function QuotationCard({
    q,
    onAction,
    acting,
}: {
    q: Quotation;
    onAction: (q: Quotation, next: QuotationStatus) => void;
    acting: boolean;
}) {
    const [open, setOpen] = useState(false);
    const layananLabel = LAYANAN_CONFIG[q.jenisLayanan]?.label ?? q.jenisLayanan;

    const nextActions: { status: QuotationStatus; label: string; color: string }[] = [];
    if (q.status === "approved") {
        nextActions.push({ status: "sent_to_client", label: "Tandai Dikirim", color: "bg-amber-500 text-white hover:bg-amber-600" });
    }
    if (q.status === "sent_to_client") {
        nextActions.push({ status: "deal",      label: "Deal ✓",  color: "bg-green-600 text-white hover:bg-green-700" });
        nextActions.push({ status: "cancelled", label: "Batal",   color: "bg-slate-200 text-slate-700 hover:bg-slate-300" });
    }
    if (q.status === "approved") {
        nextActions.push({ status: "cancelled", label: "Batal",   color: "bg-slate-200 text-slate-700 hover:bg-slate-300" });
    }

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <code className="text-xs font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                {q.noSurat}
                            </code>
                            <StatusBadge status={q.status} />
                        </div>
                        <p className="font-semibold text-slate-900 text-sm truncate">{q.kepadaNama}</p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{layananLabel} · {q.marketingNama}</p>
                        {q.kepadaWa && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[11px] text-slate-600 font-mono bg-slate-100 px-2 py-0.5 rounded-full">
                                📞 {q.kepadaWa}
                            </span>
                        )}
                    </div>
                    <div className="text-right shrink-0">
                        <p className="font-bold text-slate-800 font-mono text-sm">{formatRupiah(q.total)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatDate(q.tanggal)}</p>
                    </div>
                </div>

                {/* Action buttons */}
                {nextActions.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                        {nextActions.map(a => (
                            <button key={a.status} onClick={() => onAction(q, a.status)}
                                disabled={acting}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 ${a.color}`}>
                                {a.status === "sent_to_client" && <Send size={11} />}
                                {a.status === "deal" && <CheckCircle2 size={11} />}
                                {a.status === "cancelled" && <XCircle size={11} />}
                                {a.label}
                            </button>
                        ))}
                        <button onClick={() => setOpen(o => !o)}
                            className="ml-auto p-1.5 text-slate-400 hover:text-slate-600">
                            <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                    </div>
                )}
            </div>

            {/* Detail expand */}
            {open && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 text-xs text-slate-500 space-y-1">
                    <p><span className="font-semibold text-slate-700">Layanan:</span> {layananLabel}</p>
                    {q.kepadaAlamatLines?.[0] && <p><span className="font-semibold text-slate-700">Alamat:</span> {q.kepadaAlamatLines[0]}</p>}
                    {q.kepadaWa && <p><span className="font-semibold text-slate-700">WhatsApp:</span> <span className="text-green-600 font-mono">{q.kepadaWa}</span></p>}
                    {q.approvedAt && <p><span className="font-semibold text-slate-700">Disetujui:</span> {formatDate(q.approvedAt)}</p>}
                    {(q as any).sentToClientAt && <p><span className="font-semibold text-slate-700">Dikirim:</span> {formatDate((q as any).sentToClientAt)}</p>}
                    {(q as any).dealAt && <p><span className="font-semibold text-slate-700">Deal:</span> {formatDate((q as any).dealAt)}</p>}
                </div>
            )}
        </div>
    );
}

const STATUS_PAGE_SIZE = 10;

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export function StatusPHPage() {
    const { user } = useAuthStore();
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebouncedValue(search, 300);
    const [filterStatus, setFilterStatus] = useState<QuotationStatus | "active" | "all">("active");
    const [actionTarget, setActionTarget] = useState<{ q: Quotation; next: QuotationStatus } | null>(null);
    const [acting, setActing] = useState(false);

    const load = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const snap = await getDocs(query(
                collection(db, "quotations"),
                where("companyId", "==", user.companyId),
                where("status", "in", ["approved", "sent_to_client", "deal", "cancelled"]),
                // Marketing hanya melihat dan menindaklanjuti penawaran miliknya sendiri.
                ...(user.role === "MARKETING" ? [where("marketingUid", "==", user.uid)] : []),
            ));
            const rows = snap.docs.map(d => {
                const x = d.data() as Record<string, unknown>;
                return {
                    id: d.id,
                    ...x,
                    tanggal: x.tanggal ? (x.tanggal as Timestamp).toDate() : new Date(),
                    approvedAt: x.approvedAt ? (x.approvedAt as Timestamp).toDate() : undefined,
                    sentToClientAt: x.sentToClientAt ? (x.sentToClientAt as Timestamp).toDate() : undefined,
                    dealAt: x.dealAt ? (x.dealAt as Timestamp).toDate() : undefined,
                } as Quotation;
            });
            rows.sort((a, b) => b.tanggal.getTime() - a.tanggal.getTime());
            setQuotations(rows);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [user]);

    const stats = useMemo(() => ({
        approved:       quotations.filter(q => q.status === "approved").length,
        sent_to_client: quotations.filter(q => q.status === "sent_to_client").length,
        deal:           quotations.filter(q => q.status === "deal").length,
        cancelled:      quotations.filter(q => q.status === "cancelled").length,
        totalDeal:      quotations.filter(q => q.status === "deal").reduce((s, q) => s + q.total, 0),
    }), [quotations]);

    const displayed = useMemo(() => {
        let rows = [...quotations];
        if (filterStatus === "active") rows = rows.filter(q => q.status === "approved" || q.status === "sent_to_client");
        else if (filterStatus !== "all") rows = rows.filter(q => q.status === filterStatus);
        if (debouncedSearch.trim()) {
            const s = debouncedSearch.trim().toLowerCase();
            rows = rows.filter(q =>
                q.noSurat.toLowerCase().includes(s) ||
                q.kepadaNama.toLowerCase().includes(s) ||
                q.marketingNama.toLowerCase().includes(s)
            );
        }
        return rows;
    }, [quotations, filterStatus, debouncedSearch]);
    const pagedDisplayed = useMemo(() => displayed.slice((page - 1) * STATUS_PAGE_SIZE, page * STATUS_PAGE_SIZE), [displayed, page]);
    const totalPages = Math.max(1, Math.ceil(displayed.length / STATUS_PAGE_SIZE));
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const handleAction = async () => {
        if (!actionTarget) return;
        setActing(true);
        try {
            await updateQuotationStatus(actionTarget.q.id, actionTarget.next, user?.name);
            setActionTarget(null);
            await load();
        } finally {
            setActing(false);
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-screen-lg mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Send size={20} className="text-blue-600" />
                        Status Penawaran Harga
                    </h1>
                    <p className="text-sm text-slate-400 mt-0.5">Kelola status penawaran setelah disetujui admin</p>
                </div>
                <button onClick={load} className="p-2 border border-slate-200 bg-white rounded-xl text-slate-400 hover:bg-slate-50">
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Flow diagram */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Alur Status</p>
                <div className="flex items-center gap-2 flex-wrap">
                    {PIPELINE.map((p, i) => (
                        <div key={p.status} className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                                style={{ background: p.bg, color: p.color }}>
                                {p.icon} {p.label}
                                <span className="font-bold ml-1">
                                    {p.status === "approved" ? stats.approved :
                                     p.status === "sent_to_client" ? stats.sent_to_client :
                                     p.status === "deal" ? stats.deal : stats.cancelled}
                                </span>
                            </div>
                            {i < PIPELINE.length - 2 && (
                                <span className="text-slate-300 text-sm">→</span>
                            )}
                            {i === PIPELINE.length - 2 && (
                                <span className="text-slate-300 text-sm">↗</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-blue-700">{stats.approved}</p>
                    <p className="text-xs text-blue-500 mt-1">Perlu Dikirim</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-amber-700">{stats.sent_to_client}</p>
                    <p className="text-xs text-amber-500 mt-1">Menunggu Konfirmasi</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{stats.deal}</p>
                    <p className="text-xs text-emerald-500 mt-1">Deal</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                    <p className="text-lg font-bold text-slate-700 leading-tight">
                        {stats.deal + stats.cancelled > 0
                            ? Math.round(stats.deal / (stats.deal + stats.cancelled) * 100)
                            : 0}%
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Win Rate</p>
                </div>
            </div>

            {/* Total deal value */}
            {stats.totalDeal > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                    <TrendingUp size={18} className="text-emerald-600 shrink-0" />
                    <div>
                        <p className="text-xs text-emerald-600 font-semibold">Total Nilai Deal</p>
                        <p className="text-base font-bold text-emerald-700 font-mono">{formatRupiah(stats.totalDeal)}</p>
                    </div>
                </div>
            )}

            {/* Filter bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex gap-2 flex-wrap items-center">
                <div className="relative flex-1 min-w-48">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Cari nomor, klien, marketing..."
                        className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <Filter size={13} className="text-slate-400" />
                {([
                    { val: "active",        label: "Aktif" },
                    { val: "approved",      label: "Perlu Dikirim" },
                    { val: "sent_to_client",label: "Menunggu Klien" },
                    { val: "deal",          label: "Deal" },
                    { val: "cancelled",     label: "Batal" },
                    { val: "all",           label: "Semua" },
                ] as const).map(f => (
                    <button key={f.val} onClick={() => { setFilterStatus(f.val as typeof filterStatus); setPage(1); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                            ${filterStatus === f.val ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Quotation list */}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                    <RefreshCw size={20} className="animate-spin mr-2" /> Memuat data...
                </div>
            ) : displayed.length === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-white border border-slate-200 rounded-2xl">
                    <FileText size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-slate-500">Tidak ada data</p>
                    <p className="text-sm mt-1">
                        {filterStatus === "active"
                            ? "Tidak ada penawaran yang perlu ditindaklanjuti saat ini."
                            : "Tidak ada penawaran dengan filter ini."}
                    </p>
                </div>
            ) : (
                <div className="space-y-3 result-enter" key={page}>
                    {/* Banner: ada yang perlu dikirim */}
                    {filterStatus === "active" && stats.approved > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
                            <AlertCircle size={15} className="text-blue-600 shrink-0" />
                            <p className="text-sm text-blue-800">
                                <strong>{stats.approved} penawaran</strong> sudah disetujui admin dan perlu dikirim ke klien.
                            </p>
                        </div>
                    )}
                    {pagedDisplayed.map(q => (
                        <QuotationCard key={q.id} q={q}
                            onAction={(q, next) => setActionTarget({ q, next })}
                            acting={acting}
                        />
                    ))}
                    <Pagination page={page} pageSize={STATUS_PAGE_SIZE} totalItems={displayed.length}
                        onPageChange={setPage} itemLabel="penawaran" />
                </div>
            )}

            <ConfirmModal
                open={!!actionTarget}
                onClose={() => setActionTarget(null)}
                onConfirm={handleAction}
                quotation={actionTarget?.q ?? null}
                nextStatus={actionTarget?.next ?? null}
                loading={acting}
            />
        </div>
    );
}