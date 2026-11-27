import { useState, useEffect, useMemo } from "react";
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { Pagination } from '@/shared/ui/Pagination';
import {
    ClipboardList, RefreshCw, Search, CheckCircle2,
    Clock, XCircle, AlertCircle, ChevronDown, ChevronUp,
    Banknote, Wrench, Loader2, Save, Filter,
    Shield, Bug,
} from "lucide-react";
import { collection, query, where, getDocs, Timestamp } from '@/shared/lib/firebase';
import { db } from '@/shared/lib/firebase';
import { useAuthStore } from '@/app/store/authStore';
import {
    getTrackingByCompany, upsertTracking, generateTerminAR,
    generateCicilanBulanan, computeStatusPembayaran,
    type OrderTracking,
    type StatusPembayaran, type StatusPengerjaan,
    type TerminAR, type CicilanPCO as CicilanBulanan,
} from '@/shared/api/trackingService';
import type { Quotation } from '@/entities/types';
import { formatRupiah, formatDate } from '@/shared/lib/utils';
import { fmtIDR } from '@/shared/lib/quotationConfig';

// ─── CONFIGS ──────────────────────────────────────────────────────────────────

const PEMBAYARAN_CFG: Record<StatusPembayaran, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    belum_bayar: { label: "Belum Bayar", color: "#dc2626", bg: "#fee2e2", icon: <AlertCircle size={12} /> },
    dp: { label: "DP", color: "#d97706", bg: "#fef3c7", icon: <Banknote size={12} /> },
    lunas: { label: "Lunas", color: "#15803d", bg: "#dcfce7", icon: <CheckCircle2 size={12} /> },
    nunggak: { label: "Nunggak", color: "#7c3aed", bg: "#f3e8ff", icon: <AlertCircle size={12} /> },
};

const PENGERJAAN_CFG: Record<StatusPengerjaan, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    pending: { label: "Pending", color: "#64748b", bg: "#f1f5f9", icon: <Clock size={12} /> },
    berlanjut: { label: "Berlanjut", color: "#1d4ed8", bg: "#dbeafe", icon: <RefreshCw size={12} /> },
    selesai: { label: "Selesai", color: "#15803d", bg: "#dcfce7", icon: <CheckCircle2 size={12} /> },
    dibatalkan: { label: "Dibatalkan", color: "#6b7280", bg: "#f3f4f6", icon: <XCircle size={12} /> },
};

const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300";

function PembayaranBadge({ status }: { status: StatusPembayaran }) {
    const c = PEMBAYARAN_CFG[status];
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: c.bg, color: c.color }}>
            {c.icon} {c.label}
        </span>
    );
}
function PengerjaanBadge({ status }: { status: StatusPengerjaan }) {
    const c = PENGERJAAN_CFG[status];
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: c.bg, color: c.color }}>
            {c.icon} {c.label}
        </span>
    );
}

// ─── AR TERMIN SECTION ────────────────────────────────────────────────────────

function ARTerminSection({
    termin, total, onChange,
}: {
    termin: TerminAR;
    total: number;
    onChange: (t: TerminAR) => void;
}) {
    return (
        <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-purple-600 flex items-center gap-1.5">
                <Shield size={12} /> Termin Pembayaran — Anti Rayap
            </p>

            {/* ── Termin 1: DP ── */}
            <div className={`rounded-xl p-4 border-2 transition-colors ${termin.dibayarDP ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-sm font-bold text-slate-800">Termin 1 — DP</p>
                        <p className="text-xs text-slate-500">{total > 0 ? Math.round(termin.nominalDP / total * 100) : 0}% dari total kontrak</p>
                    </div>
                    <p className="text-base font-bold text-slate-800 font-mono">{fmtIDR(termin.nominalDP)}</p>
                </div>
                <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => onChange({ ...termin, dibayarDP: !termin.dibayarDP, tanggalBayarDP: !termin.dibayarDP ? new Date() : undefined })}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                            ${termin.dibayarDP ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                        <CheckCircle2 size={13} />
                        {termin.dibayarDP ? "Sudah Dibayar ✓" : "Tandai Lunas"}
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Nominal DP (Rp)</label>
                        <input type="number" className={inputCls} value={termin.nominalDP}
                            onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                onChange({ ...termin, nominalDP: val, nominalPelunasan: Math.max(0, total - val) });
                            }} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Tanggal Bayar DP</label>
                        <input type="date" className={inputCls}
                            value={termin.tanggalBayarDP ? termin.tanggalBayarDP.toISOString().slice(0, 10) : ""}
                            onChange={e => onChange({ ...termin, tanggalBayarDP: e.target.value ? new Date(e.target.value) : undefined })} />
                    </div>
                </div>
                <div className="mt-2">
                    <label className="block text-xs text-slate-500 mb-1">Catatan DP</label>
                    <input className={inputCls} value={termin.catatanDP ?? ""} placeholder="mis: Transfer BCA 14 Mar"
                        onChange={e => onChange({ ...termin, catatanDP: e.target.value })} />
                </div>
            </div>

            {/* ── Termin 2: Pelunasan ── */}
            <div className={`rounded-xl p-4 border-2 transition-colors ${termin.dibayarPelunasan ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-sm font-bold text-slate-800">Termin 2 — Pelunasan</p>
                        <p className="text-xs text-slate-500">Sisa {total > 0 ? Math.round(termin.nominalPelunasan / total * 100) : 0}% setelah pekerjaan selesai</p>
                    </div>
                    <p className="text-base font-bold text-slate-800 font-mono">{fmtIDR(termin.nominalPelunasan)}</p>
                </div>
                <div className="flex items-center gap-3 mb-3">
                    <button
                        disabled={!termin.dibayarDP}
                        onClick={() => onChange({ ...termin, dibayarPelunasan: !termin.dibayarPelunasan, tanggalBayarPelunasan: !termin.dibayarPelunasan ? new Date() : undefined })}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                            ${termin.dibayarPelunasan ? "bg-emerald-500 text-white border-emerald-500"
                                : !termin.dibayarDP ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                        <CheckCircle2 size={13} />
                        {termin.dibayarPelunasan ? "Sudah Dibayar ✓" : "Tandai Lunas"}
                    </button>
                    {!termin.dibayarDP && (
                        <p className="text-xs text-amber-600 italic">Selesaikan DP terlebih dahulu</p>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Nominal Pelunasan (Rp)</label>
                        <div className="px-3 py-2 text-sm font-bold bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                            {fmtIDR(termin.nominalPelunasan)}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Tanggal Bayar Pelunasan</label>
                        <input type="date" className={inputCls}
                            value={termin.tanggalBayarPelunasan ? termin.tanggalBayarPelunasan.toISOString().slice(0, 10) : ""}
                            onChange={e => onChange({ ...termin, tanggalBayarPelunasan: e.target.value ? new Date(e.target.value) : undefined })} />
                    </div>
                </div>
                <div className="mt-2">
                    <label className="block text-xs text-slate-500 mb-1">Catatan Pelunasan</label>
                    <input className={inputCls} value={termin.catatanPelunasan ?? ""} placeholder="mis: Pelunasan setelah aplikasi selesai"
                        onChange={e => onChange({ ...termin, catatanPelunasan: e.target.value })} />
                </div>
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between text-xs px-1">
                <span className="text-slate-500">Total dibayar:</span>
                <span className={`font-bold ${termin.dibayarDP && termin.dibayarPelunasan ? "text-emerald-600" : "text-slate-700"}`}>
                    {fmtIDR((termin.dibayarDP ? termin.nominalDP : 0) + (termin.dibayarPelunasan ? termin.nominalPelunasan : 0))}
                    {" "}/{" "}{fmtIDR(total)}
                </span>
            </div>
        </div>
    );
}

// ─── PCO CICILAN SECTION ──────────────────────────────────────────────────────

function PCOCicilanSection({
    cicilan, durasi, tanggalMulai,
    onCicilanChange, onDurasiChange, onTanggalMulaiChange, total,
    isNew,
}: {
    cicilan: CicilanBulanan[];
    durasi: number;
    tanggalMulai: string;
    onCicilanChange: (c: CicilanBulanan[]) => void;
    onDurasiChange: (d: number) => void;
    onTanggalMulaiChange: (t: string) => void;
    total: number;
    isNew: boolean;
}) {
    const toggleBulan = (idx: number) => {
        const updated = cicilan.map((c, i) => i === idx
            ? { ...c, dibayar: !c.dibayar, tanggalBayar: !c.dibayar ? new Date() : undefined }
            : c
        );
        onCicilanChange(updated);
    };

    const updateCatatan = (idx: number, catatan: string) => {
        const updated = cicilan.map((c, i) => i === idx ? { ...c, catatan } : c);
        onCicilanChange(updated);
    };

    const perBulan = cicilan[0]?.nominal ?? Math.round(total / Math.max(durasi, 1));
    const sudahDibayar = cicilan.filter(c => c.dibayar).length;

    return (
        <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-600 flex items-center gap-1.5">
                <Bug size={12} /> Cicilan Bulanan — Pest Control
            </p>

            {/* Setup durasi + tanggal mulai (hanya untuk tracking baru atau saat belum ada cicilan) */}
            {(isNew || cicilan.length === 0) && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-cyan-700">Setup Kontrak</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Durasi Kontrak (bulan)</label>
                            <input type="number" min={1} max={60} className={inputCls} value={durasi}
                                onChange={e => onDurasiChange(parseInt(e.target.value) || 1)} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Mulai Kontrak</label>
                            <input type="date" className={inputCls} value={tanggalMulai}
                                onChange={e => onTanggalMulaiChange(e.target.value)} />
                        </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-cyan-200">
                        <p className="text-xs text-slate-500">Tagihan per bulan</p>
                        <p className="text-lg font-bold text-cyan-700">{fmtIDR(total)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">selama {durasi} bulan → total kontrak {fmtIDR(total * durasi)}</p>
                    </div>
                </div>
            )}

            {cicilan.length > 0 && (
                <>
                    {/* Progress */}
                    {/* Summary strip */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">Tagihan per bulan</p>
                            <p className="text-base font-bold text-cyan-700">{fmtIDR(cicilan[0]?.nominal ?? 0)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-500">{sudahDibayar} dari {cicilan.length} bulan lunas</p>
                            <p className={`text-base font-bold ${sudahDibayar === cicilan.length ? "text-emerald-600" : "text-slate-700"}`}>
                                {fmtIDR(cicilan.filter(c => c.dibayar).reduce((s, c) => s + c.nominal, 0))} diterima
                            </p>
                        </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 mb-3 overflow-hidden">
                        <div className="h-full bg-cyan-500 rounded-full transition-all"
                            style={{ width: `${cicilan.length > 0 ? sudahDibayar / cicilan.length * 100 : 0}%` }} />
                    </div>

                    {/* Cicilan list */}
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {cicilan.map((c, idx) => (
                            <div key={c.bulan}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all
                                    ${c.dibayar
                                        ? "border-emerald-200 bg-emerald-50"
                                        : "border-slate-200 bg-white hover:border-cyan-200"}`}>
                                {/* Checkbox */}
                                <button onClick={() => toggleBulan(idx)}
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all
                                        ${c.dibayar
                                            ? "bg-emerald-500 border-emerald-500 text-white"
                                            : "border-slate-300 bg-white hover:border-cyan-400"}`}>
                                    {c.dibayar && <CheckCircle2 size={11} />}
                                </button>

                                {/* Label bulan */}
                                <span className={`text-sm font-semibold flex-1 ${c.dibayar ? "text-emerald-700" : "text-slate-700"}`}>
                                    {c.label}
                                </span>

                                {/* Tanggal bayar jika sudah */}
                                {c.dibayar && c.tanggalBayar && (
                                    <span className="text-[10px] text-emerald-500 shrink-0">
                                        {c.tanggalBayar.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                    </span>
                                )}

                                {/* Nominal */}
                                <span className={`text-xs font-bold font-mono shrink-0 ${c.dibayar ? "text-emerald-600" : "text-slate-400"}`}>
                                    {fmtIDR(c.nominal)}
                                </span>

                                {/* Catatan inline jika sudah bayar */}
                                {c.dibayar && (
                                    <input
                                        className="w-24 px-2 py-0.5 text-xs border border-emerald-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-cyan-300"
                                        placeholder="Catatan..."
                                        value={c.catatan ?? ""}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => updateCatatan(idx, e.target.value)} />
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────

function EditModal({
    open, onClose, onSaved, tracking, quotation,
}: {
    open: boolean;
    onClose: () => void;
    onSaved: (t: OrderTracking) => void;
    tracking: OrderTracking | null;
    quotation: Quotation;
}) {
    const isAR = quotation.kategori === "AR";
    const isNew = !tracking;

    // AR state
    const [terminAR, setTerminAR] = useState<TerminAR>(() => generateTerminAR(quotation.total));

    // PCO state
    const [cicilan, setCicilan] = useState<CicilanBulanan[]>([]);
    const [durasi, setDurasi] = useState(12);
    const [tanggalMulaiKontrak, setTanggalMulaiKontrak] = useState(() =>
        new Date().toISOString().slice(0, 10)
    );

    // Pengerjaan state
    const [statusPengerjaan, setStatusPengerjaan] = useState<StatusPengerjaan>("pending");
    const [catatanPengerjaan, setCatatanPengerjaan] = useState("");
    const [tanggalMulai, setTanggalMulai] = useState("");
    const [tanggalSelesai, setTanggalSelesai] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (tracking) {
            if (tracking.terminAR) setTerminAR(tracking.terminAR);
            else setTerminAR(generateTerminAR(quotation.total));
            if (tracking.cicilanBulanan) setCicilan(tracking.cicilanBulanan);
            else setCicilan([]);
            setDurasi(tracking.durasiKontrak ?? 12);
            setTanggalMulaiKontrak(tracking.tanggalMulaiKontrak ? tracking.tanggalMulaiKontrak.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
            setStatusPengerjaan(tracking.statusPengerjaan);
            setCatatanPengerjaan(tracking.catatanPengerjaan ?? "");
            setTanggalMulai(tracking.tanggalMulai ? tracking.tanggalMulai.toISOString().slice(0, 10) : "");
            setTanggalSelesai(tracking.tanggalSelesai ? tracking.tanggalSelesai.toISOString().slice(0, 10) : "");
        } else {
            setTerminAR(generateTerminAR(quotation.total));
            setCicilan([]);
            setDurasi(12);
            setTanggalMulaiKontrak(new Date().toISOString().slice(0, 10));
            setStatusPengerjaan("pending");
            setCatatanPengerjaan("");
            setTanggalMulai("");
            setTanggalSelesai("");
        }
    }, [open, tracking, quotation.total]);

    // Generate cicilan PCO hanya saat CREATE BARU
    // Jika UPDATE (isNew=false), jangan generate ulang agar data cicilan yang sudah ada tidak tertimpa
    useEffect(() => {
        if (!isAR && isNew && tanggalMulaiKontrak) {
            const mulai = new Date(tanggalMulaiKontrak);
            setCicilan(generateCicilanBulanan(quotation.total, durasi, mulai));
        }
    }, [durasi, tanggalMulaiKontrak, isAR, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            // PCO: generate cicilan hanya jika benar-benar baru (isNew) dan belum ada cicilan
            // Jika update existing tracking, gunakan cicilan yang sudah ada dari state
            let cicilanFinal = cicilan;
            if (!isAR && isNew && cicilanFinal.length === 0) {
                const mulaiDate = tanggalMulaiKontrak ? new Date(tanggalMulaiKontrak) : new Date();
                cicilanFinal = generateCicilanBulanan(quotation.total, durasi, mulaiDate);
                setCicilan(cicilanFinal);
            }

            const computed = computeStatusPembayaran({
                kategori: quotation.kategori as "AR" | "PCO",
                terminAR: isAR ? terminAR : undefined,
                cicilanBulanan: !isAR ? cicilanFinal : undefined,
                statusPembayaran: "belum_bayar",
                nominalDibayar: 0,
            });

            const data: any = {
                quotationId: quotation.id,
                noSurat: quotation.noSurat,
                kepadaNama: quotation.kepadaNama,
                total: quotation.total,
                kategori: quotation.kategori as "AR" | "PCO",
                companyId: quotation.companyId,
                marketingUid: quotation.marketingUid,
                marketingNama: quotation.marketingNama,
                tanggalDeal: (quotation as any).dealAt,
                statusPembayaran: computed,
                nominalDibayar: 0,
                terminAR: isAR ? terminAR : undefined,
                cicilanBulanan: !isAR ? cicilanFinal : undefined,
                durasiKontrak: !isAR ? durasi : undefined,
                tanggalMulaiKontrak: !isAR && tanggalMulaiKontrak ? new Date(tanggalMulaiKontrak) : undefined,
                statusPengerjaan,
                catatanPengerjaan: catatanPengerjaan || undefined,
                tanggalMulai: tanggalMulai ? new Date(tanggalMulai) : undefined,
                tanggalSelesai: tanggalSelesai ? new Date(tanggalSelesai) : undefined,
            };

            await upsertTracking(data);

            const updated: OrderTracking = {
                ...(tracking ?? {
                    id: quotation.id,
                    quotationId: quotation.id,
                    noSurat: quotation.noSurat,
                    kepadaNama: quotation.kepadaNama,
                    total: quotation.total,
                    kategori: quotation.kategori as "AR" | "PCO",
                    companyId: quotation.companyId,
                    marketingUid: quotation.marketingUid,
                    marketingNama: quotation.marketingNama,
                    createdAt: new Date(),
                }),
                statusPembayaran: computed,
                nominalDibayar: 0,
                terminAR: isAR ? terminAR : undefined,
                cicilanBulanan: !isAR ? cicilanFinal : undefined,
                durasiKontrak: !isAR ? durasi : undefined,
                tanggalMulaiKontrak: !isAR && tanggalMulaiKontrak ? new Date(tanggalMulaiKontrak) : undefined,
                statusPengerjaan,
                catatanPengerjaan: catatanPengerjaan || undefined,
                tanggalMulai: tanggalMulai ? new Date(tanggalMulai) : undefined,
                tanggalSelesai: tanggalSelesai ? new Date(tanggalSelesai) : undefined,
                updatedAt: new Date(),
            };

            onSaved(updated);
        } catch (err: unknown) {
            // ✅ Tampilkan error ke user agar tidak silent fail
            const msg = err instanceof Error ? err.message : String(err);
            setSaveError(msg || "Gagal menyimpan. Coba lagi.");
            console.error("[handleSave] error:", err);
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:rounded-2xl sm:max-w-lg shadow-2xl flex flex-col max-h-[100dvh] sm:max-h-[92vh] rounded-t-2xl">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 shrink-0">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <ClipboardList size={16} className="text-blue-600" />
                        {isNew ? "Buat Tracking" : "Update Tracking"}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${quotation.kategori === "AR" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"}`}>
                            {quotation.kategori === "AR" ? "🛡 Anti Rayap" : "🦟 Pest Control"}
                        </span>
                        <code className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{quotation.noSurat}</code>
                        <span className="text-sm font-semibold text-slate-700">{quotation.kepadaNama}</span>
                        <span className="text-sm font-bold text-slate-800 ml-auto font-mono">{formatRupiah(quotation.total)}</span>
                    </div>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

                    {/* ── Pembayaran sesuai kategori ── */}
                    {isAR ? (
                        <ARTerminSection termin={terminAR} total={quotation.total} onChange={setTerminAR} />
                    ) : (
                        <PCOCicilanSection
                            cicilan={cicilan} durasi={durasi} tanggalMulai={tanggalMulaiKontrak}
                            onCicilanChange={setCicilan}
                            onDurasiChange={setDurasi}
                            onTanggalMulaiChange={setTanggalMulaiKontrak}
                            total={quotation.total} isNew={isNew}
                        />
                    )}

                    {/* ── Pengerjaan ── */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
                            <Wrench size={13} /> Status Pengerjaan
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {(Object.entries(PENGERJAAN_CFG) as [StatusPengerjaan, typeof PENGERJAAN_CFG[StatusPengerjaan]][]).map(([val, cfg]) => (
                                <button key={val} type="button" onClick={() => setStatusPengerjaan(val)}
                                    className={`px-3 py-2.5 border rounded-xl text-left text-xs font-medium transition-all
                                        ${statusPengerjaan === val ? "ring-2 font-semibold" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                                    style={statusPengerjaan === val ? { background: cfg.bg, color: cfg.color, borderColor: cfg.color } : {}}>
                                    <span className="flex items-center gap-1.5">{cfg.icon} {cfg.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-2">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Tanggal Mulai</label>
                                <input type="date" className={inputCls} value={tanggalMulai}
                                    onChange={e => setTanggalMulai(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Tanggal Selesai</label>
                                <input type="date" className={inputCls} value={tanggalSelesai}
                                    onChange={e => setTanggalSelesai(e.target.value)} />
                            </div>
                        </div>
                        <textarea className={`${inputCls} resize-none`} rows={2}
                            value={catatanPengerjaan} placeholder="Keterangan tambahan pengerjaan..."
                            onChange={e => setCatatanPengerjaan(e.target.value)} />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex gap-2 shrink-0">
                    <button onClick={onClose} className="flex-1 py-2.5 text-sm rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium">
                        Batal
                    </button>
                    {saveError && (
                        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                            ⚠ {saveError}
                        </div>
                    )}
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 py-2.5 text-sm rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {saving ? "Menyimpan..." : "Simpan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── TRACKING CARD ────────────────────────────────────────────────────────────

function TrackingCard({ quotation, tracking, onEdit }: {
    quotation: Quotation;
    tracking: OrderTracking | null;
    onEdit: () => void;
}) {
    const [open, setOpen] = useState(false);
    const isAR = quotation.kategori === "AR";
    const sisa = quotation.total - (tracking?.nominalDibayar ?? 0);
    const pct = quotation.total > 0 ? Math.min(100, Math.round((tracking?.nominalDibayar ?? 0) / quotation.total * 100)) : 0;

    // AR progress summary
    const arDP = tracking?.terminAR?.dibayarDP;
    const arLunas = tracking?.terminAR?.dibayarPelunasan;

    // PCO progress summary
    const pcoTotal = tracking?.cicilanBulanan?.length ?? 0;
    const pcoBayar = tracking?.cicilanBulanan?.filter(c => c.dibayar).length ?? 0;

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${isAR ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"}`}>
                                {isAR ? "🛡 AR" : "🦟 PCO"}
                            </span>
                            <code className="text-xs font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded truncate">{quotation.noSurat}</code>
                            {tracking && (
                                <>
                                    <PembayaranBadge status={tracking.statusPembayaran} />
                                    <PengerjaanBadge status={tracking.statusPengerjaan} />
                                </>
                            )}
                        </div>
                        <p className="font-semibold text-slate-900 text-sm truncate">{quotation.kepadaNama}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                            {quotation.kepadaWa && <span className="font-mono text-slate-700 font-medium">📞 {quotation.kepadaWa}</span>}
                            <span>· {quotation.marketingNama}</span>
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="font-bold text-slate-800 font-mono text-sm">{formatRupiah(quotation.total)}</p>
                        {tracking && sisa > 0 && <p className="text-xs text-red-500 font-medium">Sisa {formatRupiah(sisa)}</p>}
                        {tracking && sisa <= 0 && <p className="text-xs text-emerald-600 font-medium">✓ Lunas</p>}
                    </div>
                </div>

                {/* Progress visual */}
                {tracking && (
                    <div className="mb-3">
                        {isAR ? (
                            // AR: 2 step indicator
                            <div className="flex items-center gap-2 py-1">
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold flex-1 justify-center
                                    ${arDP ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                                    <CheckCircle2 size={11} /> DP {arDP ? "✓" : "○"}
                                </div>
                                <div className={`h-0.5 w-4 rounded ${arDP ? "bg-emerald-400" : "bg-slate-200"}`} />
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold flex-1 justify-center
                                    ${arLunas ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                                    <CheckCircle2 size={11} /> Lunas {arLunas ? "✓" : "○"}
                                </div>
                            </div>
                        ) : (
                            // PCO: progress bar cicilan
                            pcoTotal > 0 && (
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                        <span>Cicilan bulan ke-{pcoBayar} dari {pcoTotal}</span>
                                        <span>{Math.round(pcoBayar / pcoTotal * 100)}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex gap-px">
                                        {tracking.cicilanBulanan!.map((c, i) => (
                                            <div key={i} className={`flex-1 rounded-sm transition-colors ${c.dibayar ? "bg-cyan-500" : "bg-slate-200"}`} />
                                        ))}
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button onClick={onEdit}
                        className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">
                        {tracking ? "Update Tracking" : "+ Tambah Tracking"}
                    </button>
                    {tracking && (
                        <button onClick={() => setOpen(o => !o)} className="p-1.5 text-slate-400 hover:text-slate-600">
                            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Detail expand */}
            {open && tracking && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 text-xs text-slate-600 space-y-1.5">
                    {isAR && tracking.terminAR && (
                        <>
                            {tracking.terminAR.catatanDP && <p><span className="font-semibold">Catatan DP:</span> {tracking.terminAR.catatanDP}</p>}
                            {tracking.terminAR.tanggalBayarDP && <p><span className="font-semibold">Bayar DP:</span> {formatDate(tracking.terminAR.tanggalBayarDP)}</p>}
                            {tracking.terminAR.catatanPelunasan && <p><span className="font-semibold">Catatan Pelunasan:</span> {tracking.terminAR.catatanPelunasan}</p>}
                            {tracking.terminAR.tanggalBayarPelunasan && <p><span className="font-semibold">Bayar Lunas:</span> {formatDate(tracking.terminAR.tanggalBayarPelunasan)}</p>}
                        </>
                    )}
                    {!isAR && tracking.durasiKontrak && (
                        <p><span className="font-semibold">Durasi:</span> {tracking.durasiKontrak} bulan · mulai {tracking.tanggalMulaiKontrak ? formatDate(tracking.tanggalMulaiKontrak) : "-"}</p>
                    )}
                    {tracking.tanggalMulai && <p><span className="font-semibold">Mulai kerja:</span> {formatDate(tracking.tanggalMulai)}</p>}
                    {tracking.tanggalSelesai && <p><span className="font-semibold">Selesai:</span> {formatDate(tracking.tanggalSelesai)}</p>}
                    {tracking.catatanPengerjaan && <p><span className="font-semibold">Catatan:</span> {tracking.catatanPengerjaan}</p>}
                    <p className="text-slate-400">Diupdate: {formatDate(tracking.updatedAt)}</p>
                </div>
            )}
        </div>
    );
}

const TRACKING_PAGE_SIZE = 10;

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export function TrackingPage() {
    const { user } = useAuthStore();
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [trackingMap, setTrackingMap] = useState<Record<string, OrderTracking>>({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebouncedValue(search, 300);
    const [filterKategori, setFilterKategori] = useState<"all" | "AR" | "PCO">("all");
    const [filterPembayaran, setFilterPembayaran] = useState<StatusPembayaran | "all">("all");
    const [filterPengerjaan] = useState<StatusPengerjaan | "all">("all");
    const [editTarget, setEditTarget] = useState<Quotation | null>(null);

    const load = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const snap = await getDocs(query(
                collection(db, "quotations"),
                where("companyId", "==", user.companyId),
                where("status", "==", "deal"),
            ));
            const rows = snap.docs.map(d => {
                const x = d.data() as Record<string, unknown>;
                return {
                    id: d.id, ...x,
                    tanggal: x.tanggal ? (x.tanggal as Timestamp).toDate() : new Date(),
                    dealAt: x.dealAt ? (x.dealAt as Timestamp).toDate() : undefined,
                } as Quotation;
            });
            rows.sort((a, b) => ((b as any).dealAt ?? b.tanggal).getTime() - ((a as any).dealAt ?? a.tanggal).getTime());
            setQuotations(rows);

            const trackings = await getTrackingByCompany(user.companyId);
            const map: Record<string, OrderTracking> = {};
            trackings.forEach(t => { map[t.quotationId] = t; });
            setTrackingMap(map);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [user]);

    const stats = useMemo(() => {
        const tr = Object.values(trackingMap);
        const arQ = quotations.filter(q => q.kategori === "AR");
        const pcoQ = quotations.filter(q => q.kategori === "PCO");
        return {
            totalDeal: quotations.length,
            arCount: arQ.length,
            pcoCount: pcoQ.length,
            lunas: tr.filter(t => t.statusPembayaran === "lunas").length,
            nunggak: tr.filter(t => t.statusPembayaran === "nunggak").length,
            berlanjut: tr.filter(t => t.statusPengerjaan === "berlanjut").length,
            totalDibayar: tr.reduce((s, t) => s + t.nominalDibayar, 0),
        };
    }, [quotations, trackingMap]);

    const displayed = useMemo(() => {
        let rows = [...quotations];
        if (filterKategori !== "all") rows = rows.filter(q => q.kategori === filterKategori);
        if (filterPembayaran !== "all") rows = rows.filter(q => trackingMap[q.id]?.statusPembayaran === filterPembayaran);
        if (filterPengerjaan !== "all") rows = rows.filter(q => trackingMap[q.id]?.statusPengerjaan === filterPengerjaan);
        if (debouncedSearch.trim()) {
            const s = debouncedSearch.trim().toLowerCase();
            rows = rows.filter(q =>
                q.noSurat.toLowerCase().includes(s) ||
                q.kepadaNama.toLowerCase().includes(s) ||
                q.marketingNama.toLowerCase().includes(s)
            );
        }
        return rows;
    }, [quotations, trackingMap, filterKategori, filterPembayaran, filterPengerjaan, debouncedSearch]);
    const pagedDisplayed = useMemo(() => displayed.slice((page - 1) * TRACKING_PAGE_SIZE, page * TRACKING_PAGE_SIZE), [displayed, page]);
    const totalPages = Math.max(1, Math.ceil(displayed.length / TRACKING_PAGE_SIZE));
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    return (
        <div className="p-4 md:p-6 max-w-screen-lg mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <ClipboardList size={20} className="text-blue-600" /> Tracking Order
                    </h1>
                    <p className="text-sm text-slate-400 mt-0.5">
                        <span className="text-purple-600 font-semibold">AR: 2 termin (DP + Pelunasan)</span>
                        {" · "}
                        <span className="text-cyan-600 font-semibold">PCO: cicilan bulanan</span>
                    </p>
                </div>
                <button onClick={load} className="p-2 border border-slate-200 bg-white rounded-xl text-slate-400 hover:bg-slate-50">
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-2xl font-bold text-blue-700">{stats.totalDeal}</p>
                    <p className="text-xs text-slate-400 mt-1">Total Deal</p>
                    <p className="text-[10px] text-slate-300 mt-0.5">AR {stats.arCount} · PCO {stats.pcoCount}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <p className="text-2xl font-bold text-emerald-700">{stats.lunas}</p>
                    <p className="text-xs text-emerald-500 mt-1">Lunas</p>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                    <p className="text-2xl font-bold text-purple-700">{stats.nunggak}</p>
                    <p className="text-xs text-purple-500 mt-1">Nunggak</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-sm font-bold text-blue-700 truncate">{formatRupiah(stats.totalDibayar)}</p>
                    <p className="text-xs text-blue-500 mt-1">Total Diterima</p>
                </div>
            </div>

            {/* Filters */}
            {/* Filters */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Cari nomor surat, klien, marketing..."
                        className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div className="overflow-x-auto no-scrollbar">
                    <div className="flex gap-2 items-center min-w-max">
                        <Filter size={12} className="text-slate-400 shrink-0" />
                        {(["all", "AR", "PCO"] as const).map(v => (
                            <button key={v} onClick={() => { setFilterKategori(v); setPage(1); }}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap active:scale-[0.97]
                                    ${filterKategori === v
                                        ? v === "AR" ? "bg-purple-600 text-white" : v === "PCO" ? "bg-cyan-600 text-white" : "bg-blue-600 text-white"
                                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                                {v === "all" ? "Semua" : v === "AR" ? "🛡 Anti Rayap" : "🦟 Pest Control"}
                            </button>
                        ))}
                        <span className="text-slate-200">|</span>
                        {(["all", "belum_bayar", "dp", "lunas", "nunggak"] as const).map(v => (
                            <button key={v} onClick={() => { setFilterPembayaran(v); setPage(1); }}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap active:scale-[0.97]
                                    ${filterPembayaran === v ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                                {v === "all" ? "Semua Bayar" : PEMBAYARAN_CFG[v].label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader2 size={20} className="animate-spin mr-2" /> Memuat data...
                </div>
            ) : displayed.length === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-white border border-slate-200 rounded-2xl">
                    <ClipboardList size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-slate-500">Belum ada order</p>
                    <p className="text-sm mt-1">Order muncul setelah quotation berstatus Deal.</p>
                </div>
            ) : (
                <div className="space-y-3 result-enter" key={page}>
                    {pagedDisplayed.map(q => (
                        <TrackingCard key={q.id} quotation={q}
                            tracking={trackingMap[q.id] ?? null}
                            onEdit={() => setEditTarget(q)} />
                    ))}
                    <Pagination page={page} pageSize={TRACKING_PAGE_SIZE} totalItems={displayed.length}
                        onPageChange={setPage} itemLabel="order" />
                </div>
            )}

            {/* Edit Modal */}
            {editTarget && (
                <EditModal
                    open={!!editTarget}
                    onClose={() => setEditTarget(null)}
                    quotation={editTarget}
                    tracking={trackingMap[editTarget.id] ?? null}
                    onSaved={(updated) => {
                        setTrackingMap(prev => ({ ...prev, [editTarget.id]: updated }));
                        setEditTarget(null);
                    }}
                />
            )}
        </div>
    );
}