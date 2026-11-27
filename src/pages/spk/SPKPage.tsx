import { useState, useEffect, useMemo } from "react";
import {
    ClipboardList, Plus, Search, RefreshCw, Loader2,
    ChevronRight, User, CalendarDays, AlertCircle,
    CheckCircle2, Clock, PlayCircle, X, MapPin,
    FileText, ArrowRight, Wrench, Filter,
    Repeat, CalendarCheck, Eye,
} from "lucide-react";
import { collection, query, where, getDocs, Timestamp } from '@/shared/lib/firebase';
import { db } from '@/shared/lib/firebase';
import { useAuthStore } from '@/app/store/authStore';
import {
    createSPK, getSPKList, updateSPKStatus, reassignSPK,
} from '@/shared/api/spkService';
import { CreateSPKModal } from '@/widgets/spk/CreateSPKModal';
import type { SPK, AppUser, Quotation } from '@/entities/types';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    assigned: {
        label: "Assigned",
        color: "bg-blue-100 text-blue-700",
        icon: <Clock size={11} />,
        next: "in_progress" as SPK["status"],
        nextLabel: "Mulai Pengerjaan",
        nextColor: "bg-amber-500 hover:bg-amber-600",
        nextIcon: <PlayCircle size={13} />,
    },
    in_progress: {
        label: "In Progress",
        color: "bg-amber-100 text-amber-700",
        icon: <PlayCircle size={11} />,
        next: "done" as SPK["status"],
        nextLabel: "Selesaikan",
        nextColor: "bg-emerald-600 hover:bg-emerald-700",
        nextIcon: <CheckCircle2 size={13} />,
    },
    done: {
        label: "Selesai",
        color: "bg-emerald-100 text-emerald-700",
        icon: <CheckCircle2 size={11} />,
        next: null,
        nextLabel: null,
        nextColor: null,
        nextIcon: null,
    },
};

function fmt(d: Date) {
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDatetime(d: Date) {
    return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatRupiah(n: number) {
    return "Rp " + n.toLocaleString("id-ID");
}

// ─── CREATE SPK MODAL ─────────────────────────────────────────────────────────

// ─── DETAIL / EDIT MODAL ──────────────────────────────────────────────────────

function SPKDetailModal({
    spk,
    canEdit,
    companyId,
    onClose,
    onUpdated,
}: {
    spk: SPK;
    canEdit: boolean;
    companyId: string;
    onClose: () => void;
    onUpdated: () => void;
}) {
    const cfg = STATUS_CONFIG[spk.status];
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [reassigning, setReassigning] = useState(false);
    const [teknisis, setTeknisis] = useState<AppUser[]>([]);
    const [newTechId, setNewTechId] = useState(spk.technicianId);
    const [newDate, setNewDate] = useState(spk.scheduleDate.toISOString().split("T")[0]);
    const [savingReassign, setSavingReassign] = useState(false);

    useEffect(() => {
        if (!reassigning) return;
        getDocs(query(
            collection(db, "users"),
            where("companyId", "==", companyId),
            where("role", "==", "TEKNISI_LAPANGAN"),
            where("isActive", "==", true),
        )).then(snap => {
            setTeknisis(snap.docs.map(d => ({ uid: d.id, ...d.data() } as AppUser)));
        });
    }, [reassigning, companyId]);

    const handleUpdateStatus = async () => {
        if (!cfg.next) return;
        setUpdatingStatus(true);
        try {
            await updateSPKStatus(spk.id, cfg.next);
            onUpdated();
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleReassign = async () => {
        const t = teknisis.find(x => x.uid === newTechId);
        if (!t) return;
        setSavingReassign(true);
        try {
            await reassignSPK(spk.id, newTechId, t.name, new Date(newDate));
            onUpdated();
        } finally {
            setSavingReassign(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-xs font-mono text-slate-400 mb-0.5">{(spk as any).quotationNoSurat}</p>
                        <h3 className="text-base font-bold text-slate-900">{spk.customerName}</h3>
                        <p className="text-sm text-slate-500">{(spk as any).perihal}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 ml-3">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {/* Status badge */}
                    <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                        </span>
                        {spk.status !== "done" && canEdit && !reassigning && (
                            <button
                                onClick={handleUpdateStatus}
                                disabled={updatingStatus}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white transition-colors ${cfg.nextColor} disabled:opacity-50`}
                            >
                                {updatingStatus ? <Loader2 size={11} className="animate-spin" /> : cfg.nextIcon}
                                {cfg.nextLabel}
                            </button>
                        )}
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <InfoBlock icon={<User size={13} />} label="Teknisi" value={spk.technicianName} />
                        <InfoBlock icon={<CalendarDays size={13} />} label="Jadwal" value={fmt(spk.scheduleDate)} />
                        <InfoBlock icon={<MapPin size={13} />} label="Lokasi" value={(spk as any).lokasi || "—"} />
                        <InfoBlock icon={<Wrench size={13} />} label="Layanan" value={spk.serviceType === "TERMITE_CONTROL" ? "Anti Rayap" : "Pest Control"} />
                        {spk.actualStart && (
                            <InfoBlock icon={<PlayCircle size={13} />} label="Mulai" value={fmtDatetime(spk.actualStart)} />
                        )}
                        {spk.actualEnd && (
                            <InfoBlock icon={<CheckCircle2 size={13} />} label="Selesai" value={fmtDatetime(spk.actualEnd)} />
                        )}
                    </div>

                    {(spk as any).notes && (
                        <div className="bg-slate-50 rounded-xl px-4 py-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Catatan</p>
                            <p className="text-sm text-slate-700">{(spk as any).notes}</p>
                        </div>
                    )}

                    <div className="text-xs text-slate-400">
                        Dibuat oleh <span className="font-medium text-slate-600">{(spk as any).createdByName}</span> · {fmt(spk.createdAt)}
                    </div>

                    {/* Reassign */}
                    {canEdit && spk.status !== "done" && (
                        <div className="border-t border-slate-100 pt-4">
                            {!reassigning ? (
                                <button
                                    onClick={() => setReassigning(true)}
                                    className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
                                >
                                    <ArrowRight size={11} /> Ganti Teknisi / Jadwal
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ganti Teknisi / Jadwal</p>
                                    {teknisis.length > 0 && (
                                        <select
                                            value={newTechId}
                                            onChange={e => setNewTechId(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                        >
                                            {teknisis.map(t => (
                                                <option key={t.uid} value={t.uid}>{t.name}</option>
                                            ))}
                                        </select>
                                    )}
                                    <input
                                        type="date"
                                        value={newDate}
                                        onChange={e => setNewDate(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => setReassigning(false)}
                                            className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200">
                                            Batal
                                        </button>
                                        <button onClick={handleReassign} disabled={savingReassign}
                                            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
                                            {savingReassign ? <Loader2 size={11} className="animate-spin" /> : null}
                                            Simpan
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function InfoBlock({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                {icon}
                <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-sm font-medium text-slate-800">{value}</p>
        </div>
    );
}

// ─── RECURRING SCHEDULE MODAL ─────────────────────────────────────────────────

interface RecurringPreviewRow {
    tanggal: string; // ISO date string
    teknisiId: string;
    teknisiNama: string;
    quotationId: string;
    quotationNoSurat: string;
    customerName: string;
    perihal: string;
    lokasi: string;
    serviceType: SPK["serviceType"];
}

function RecurringScheduleModal({
    companyId,
    user,
    onClose,
    onCreated,
}: {
    companyId: string;
    user: AppUser;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [teknisis, setTeknisis] = useState<AppUser[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    // Form state
    const [selectedQuoId, setSelectedQuoId] = useState("");
    const [selectedTekIds, setSelectedTekIds] = useState<string[]>([]);
    const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
    const [interval, setInterval] = useState<"harian" | "mingguan" | "bulanan">("mingguan");
    const [count, setCount] = useState(4); // Berapa kali
    const [notes, setNotes] = useState("");

    const [previewRows, setPreviewRows] = useState<RecurringPreviewRow[] | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [quoSearch, setQuoSearch] = useState("");

    useEffect(() => {
        const load = async () => {
            setLoadingData(true);
            try {
                const [quoSnap, userSnap] = await Promise.all([
                    getDocs(query(
                        collection(db, "quotations"),
                        where("companyId", "==", companyId),
                    )),
                    getDocs(query(
                        collection(db, "users"),
                        where("companyId", "==", companyId),
                        where("role", "==", "TEKNISI_LAPANGAN"),
                        where("isActive", "==", true),
                    )),
                ]);
                const quoList = quoSnap.docs
                    .map(d => {
                        const data = d.data() as Record<string, unknown>;
                        return {
                            id: d.id,
                            noSurat: data.noSurat,
                            kepadaNama: data.kepadaNama,
                            perihal: data.perihal,
                            total: data.total,
                            jenisLayanan: data.jenisLayanan,
                            kategori: data.kategori,
                            kepadaAlamatLines: data.kepadaAlamatLines ?? [],
                            lokasiPekerjaan: data.lokasiPekerjaan,
                            tanggal: (data.tanggal as Timestamp).toDate(),
                            status: data.status,
                        } as unknown as Quotation;
                    })
                    .filter(q => q.status === "approved" || q.status === "deal" || q.status === "sent_to_client");
                setQuotations(quoList);
                setTeknisis(userSnap.docs.map(d => ({ uid: d.id, ...d.data() } as AppUser)));
            } finally {
                setLoadingData(false);
            }
        };
        load();
    }, [companyId]);

    const selectedQuo = useMemo(() => quotations.find(q => q.id === selectedQuoId), [quotations, selectedQuoId]);
    const filteredQuos = useMemo(() => {
        if (!quoSearch) return quotations;
        const s = quoSearch.toLowerCase();
        return quotations.filter(q =>
            q.noSurat.toLowerCase().includes(s) ||
            q.kepadaNama.toLowerCase().includes(s)
        );
    }, [quotations, quoSearch]);

    // Generate tanggal berulang
    function generateDates(start: string, mode: typeof interval, n: number): string[] {
        const dates: string[] = [];
        const d = new Date(start);
        for (let i = 0; i < n; i++) {
            dates.push(d.toISOString().split("T")[0]);
            if (mode === "harian") d.setDate(d.getDate() + 1);
            else if (mode === "mingguan") d.setDate(d.getDate() + 7);
            else d.setMonth(d.getMonth() + 1);
        }
        return dates;
    }

    const handlePreview = () => {
        if (!selectedQuo || selectedTekIds.length === 0 || !startDate || count < 1) return;
        const dates = generateDates(startDate, interval, count);
        const svcType = selectedQuo.kategori === "AR" ? "TERMITE_CONTROL" : "GENERAL_PEST_CONTROL";
        const lokasi = selectedQuo.lokasiPekerjaan || (selectedQuo.kepadaAlamatLines ?? []).join(", ");

        // Rotasi teknisi: setiap jadwal → teknisi berikutnya (round-robin)
        const rows: RecurringPreviewRow[] = dates.map((tgl, idx) => {
            const tek = teknisis.find(t => t.uid === selectedTekIds[idx % selectedTekIds.length])!;
            return {
                tanggal: tgl,
                teknisiId: tek.uid,
                teknisiNama: tek.name,
                quotationId: selectedQuo.id,
                quotationNoSurat: selectedQuo.noSurat,
                customerName: selectedQuo.kepadaNama,
                perihal: selectedQuo.perihal,
                lokasi,
                serviceType: svcType as SPK["serviceType"],
            };
        });
        setPreviewRows(rows);
    };

    const handleConfirm = async () => {
        if (!previewRows) return;
        setSubmitting(true);
        try {
            for (const row of previewRows) {
                await createSPK({
                    quotationId: row.quotationId,
                    quotationNoSurat: row.quotationNoSurat,
                    customerName: row.customerName,
                    technicianId: row.teknisiId,
                    technicianName: row.teknisiNama,
                    scheduleDate: new Date(row.tanggal),
                    serviceType: row.serviceType,
                    perihal: row.perihal,
                    lokasi: row.lokasi,
                    notes: notes.trim() || `Jadwal rutin ${interval} (disetup oleh ${user.name})`,
                    companyId,
                    createdBy: user.uid,
                    createdByName: user.name,
                });
            }
            onCreated();
        } catch (e) {
            alert(`Gagal membuat jadwal: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setSubmitting(false);
        }
    };

    const intervalLabel: Record<typeof interval, string> = {
        harian: "Setiap hari",
        mingguan: "Setiap minggu",
        bulanan: "Setiap bulan",
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Repeat size={16} className="text-blue-600" /> Setup Jadwal Rutin SPK
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Generate beberapa SPK sekaligus untuk jadwal mingguan/bulanan
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                    {loadingData ? (
                        <div className="flex items-center justify-center py-12 text-slate-400">
                            <Loader2 size={20} className="animate-spin mr-2" /> Memuat data...
                        </div>
                    ) : previewRows ? (
                        // Preview mode
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-slate-800">
                                    Preview {previewRows.length} SPK yang akan dibuat:
                                </p>
                                <button
                                    onClick={() => setPreviewRows(null)}
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                >
                                    ← Ubah pengaturan
                                </button>
                            </div>
                            <div className="rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wide text-[10px]">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Tanggal</th>
                                            <th className="px-3 py-2 text-left">Teknisi</th>
                                            <th className="px-3 py-2 text-left">Klien</th>
                                            <th className="px-3 py-2 text-left">Layanan</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {previewRows.map((r, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 font-mono font-semibold text-slate-700">{r.tanggal}</td>
                                                <td className="px-3 py-2 text-slate-700">{r.teknisiNama}</td>
                                                <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate">{r.customerName}</td>
                                                <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate">{r.perihal}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">
                                    Pesan untuk Teknisi (Opsional)
                                </label>
                                <textarea
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                    rows={2}
                                    placeholder="Contoh: Jadwal rutin bulanan, koordinasi 1 hari sebelum..."
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </div>
                        </div>
                    ) : (
                        // Setup mode
                        <div className="space-y-5">
                            {/* Pilih Quotation */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                                    1. Pilih Penawaran Resmi *
                                </label>
                                <div className="relative mb-2">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                        placeholder="Cari nomor surat atau nama klien..."
                                        value={quoSearch}
                                        onChange={e => setQuoSearch(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                    {filteredQuos.map(q => (
                                        <button
                                            key={q.id}
                                            type="button"
                                            onClick={() => setSelectedQuoId(q.id)}
                                            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all text-xs ${
                                                selectedQuoId === q.id
                                                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                                                    : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"
                                            }`}
                                        >
                                            <span className="font-mono font-bold text-slate-800">{q.noSurat}</span>
                                            <span className="text-slate-500 ml-2">{q.kepadaNama} · {q.perihal}</span>
                                        </button>
                                    ))}
                                    {filteredQuos.length === 0 && (
                                        <p className="text-xs text-slate-400 italic text-center py-3">Tidak ada penawaran yang bisa dijadikan jadwal rutin.</p>
                                    )}
                                </div>
                            </div>

                            {/* Pilih Teknisi (multi) */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                                    2. Teknisi yang Bertugas * (bisa lebih dari satu — akan dirotasi)
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {teknisis.map(t => (
                                        <button
                                            key={t.uid}
                                            type="button"
                                            onClick={() => setSelectedTekIds(prev =>
                                                prev.includes(t.uid) ? prev.filter(id => id !== t.uid) : [...prev, t.uid]
                                            )}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all text-xs ${
                                                selectedTekIds.includes(t.uid)
                                                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                                                    : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"
                                            }`}
                                        >
                                            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                                                {t.name[0]?.toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                                                <p className="text-slate-400 text-[10px]">{t.jabatan || "Teknisi"}</p>
                                            </div>
                                            {selectedTekIds.includes(t.uid) && (
                                                <CalendarCheck size={13} className="ml-auto text-blue-500 shrink-0" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                {selectedTekIds.length > 1 && (
                                    <p className="text-[11px] text-blue-600 mt-1.5 font-medium">
                                        Rotasi otomatis: {selectedTekIds.map(id => teknisis.find(t => t.uid === id)?.name).join(" → ")} → ulang
                                    </p>
                                )}
                            </div>

                            {/* Tanggal mulai, interval, jumlah */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">3. Mulai Tanggal *</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        min={new Date().toISOString().split("T")[0]}
                                        onChange={e => setStartDate(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Interval *</label>
                                    <select
                                        value={interval}
                                        onChange={e => setInterval(e.target.value as typeof interval)}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    >
                                        <option value="harian">Harian</option>
                                        <option value="mingguan">Mingguan</option>
                                        <option value="bulanan">Bulanan</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Berapa Kali? *</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={52}
                                        value={count}
                                        onChange={e => setCount(Math.max(1, Math.min(52, Number(e.target.value))))}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                            </div>

                            {/* Ringkasan */}
                            {selectedQuo && selectedTekIds.length > 0 && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
                                    <p className="font-bold mb-1">Ringkasan:</p>
                                    <p>Klien: <strong>{selectedQuo.kepadaNama}</strong> · {selectedQuo.perihal}</p>
                                    <p className="mt-0.5">{count} SPK · {intervalLabel[interval]} · mulai {startDate}</p>
                                    <p className="mt-0.5">Teknisi: {selectedTekIds.map(id => teknisis.find(t => t.uid === id)?.name).join(", ")}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200">
                        Batal
                    </button>
                    {previewRows ? (
                        <button
                            onClick={handleConfirm}
                            disabled={submitting}
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {submitting
                                ? <><Loader2 size={13} className="animate-spin" /> Membuat SPK...</>
                                : <><CalendarCheck size={13} /> Konfirmasi & Buat {previewRows.length} SPK</>
                            }
                        </button>
                    ) : (
                        <button
                            onClick={handlePreview}
                            disabled={!selectedQuo || selectedTekIds.length === 0 || !startDate}
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Eye size={13} /> Preview Jadwal
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

type SpkViewTab = "list" | "calendar" | "analytics-sop";

interface TaskSopRule {
    id: string;
    name: string;
    category: "PEST" | "TERMITE" | "SURVEY";
    recordingMode: string;
    allowPostpone: string;
    geofenceCheckIn: string;
    preCheckInForm: string;
    preCheckOutForm: string;
}

const DEFAULT_SOP_MATRIX: TaskSopRule[] = [
    { id: "fumigasi", name: "DEFAULT PEST FUMIGASI", category: "PEST", recordingMode: "Wajib Foto & Gas PPM", allowPostpone: "Ya (Dengan Alasan)", geofenceCheckIn: "Wajib Dalam Radius", preCheckInForm: "Checklist Seal & Area", preCheckOutForm: "Form Aerasi & BAST" },
    { id: "rodent", name: "RODENT CONTROL", category: "PEST", recordingMode: "Wajib Foto Bait/Trap", allowPostpone: "Ya (Dengan Alasan)", geofenceCheckIn: "Wajib Dalam Radius", preCheckInForm: "Inspeksi Titik Umpan", preCheckOutForm: "Form Konsumsi Umpan" },
    { id: "survey_pco", name: "SURVEY PEST CONTROL", category: "SURVEY", recordingMode: "Foto & Titik Temuan", allowPostpone: "Ya", geofenceCheckIn: "Fleksibel (Auto-Anchor)", preCheckInForm: "Data Area Klien", preCheckOutForm: "Rekomendasi & Luas m²" },
    { id: "survey_ar", name: "SURVEY TERMITE CONTROL", category: "SURVEY", recordingMode: "Foto & Ukuran Rumus", allowPostpone: "Ya", geofenceCheckIn: "Fleksibel (Auto-Anchor)", preCheckInForm: "Data Struktur Bangunan", preCheckOutForm: "Kalkulasi Jalur Injeksi" },
    { id: "wr_pco", name: "WORK REPORT PEST CONTROL", category: "PEST", recordingMode: "Wajib Foto Sebelum/Sesudah", allowPostpone: "Ya", geofenceCheckIn: "Wajib Dalam Radius", preCheckInForm: "Kesiapan APD & Alat", preCheckOutForm: "Input Dosis Chemical & TTD" },
    { id: "wr_ar", name: "WORK REPORT TERMITE", category: "TERMITE", recordingMode: "Wajib Foto Drilling/Injeksi", allowPostpone: "Ya", geofenceCheckIn: "Wajib Dalam Radius", preCheckInForm: "Cek Tekanan Pompa", preCheckOutForm: "Input Liter Termisida & TTD" },
];

const MONTHS_SHORT_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
const DAYS_SHORT_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function SPKPage() {
    const { user } = useAuthStore();
    const activeCompanyId = useAuthStore(s => s.activeCompanyId);
    const companyId = (user?.role === "MASTER_SUPER_ADMIN" || user?.role === "SUPERADMIN")
        ? (activeCompanyId || user?.companyId || "")
        : (user?.companyId ?? "");
    const canCreate = user?.role !== "TEKNISI_LAPANGAN" && user?.role !== "INVENTORY";

    const [viewTab, setViewTab] = useState<SpkViewTab>("list");
    const [spkList, setSpkList] = useState<SPK[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [recurringOpen, setRecurringOpen] = useState(false);
    const [selected, setSelected] = useState<SPK | null>(null);
    const [filterStatus, setFilterStatus] = useState<SPK["status"] | "all">("all");
    const [search, setSearch] = useState("");

    // 7-Day Horizontal Date Carousel state (Screenshot 4: beta.jarivis.com/task)
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>("ALL");
    const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
    const [selectedTechTimeline, setSelectedTechTimeline] = useState<string>("ALL");
    const [sopRules, setSopRules] = useState<TaskSopRule[]>(DEFAULT_SOP_MATRIX);
    const [sopSavedMsg, setSopSavedMsg] = useState<string | null>(null);

    const load = async () => {
        if (!companyId) {
            setSpkList([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const list = await getSPKList({ companyId });
            setSpkList(list);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, [companyId]); // eslint-disable-line

    // Build 7-day carousel dates around weekAnchor
    const weekDaysCarousel = useMemo(() => {
        const base = new Date(weekAnchor);
        const dayOfWeek = base.getDay(); // 0 (Sun) - 6 (Sat)
        const sunday = new Date(base);
        sunday.setDate(base.getDate() - dayOfWeek);

        return Array.from({ length: 7 }).map((_, idx) => {
            const d = new Date(sunday);
            d.setDate(sunday.getDate() + idx);
            const iso = d.toISOString().slice(0, 10);
            const count = spkList.filter(s => s.scheduleDate.toISOString().slice(0, 10) === iso).length;
            return {
                iso,
                dayName: DAYS_SHORT_ID[d.getDay()],
                dayNum: String(d.getDate()).padStart(2, "0"),
                monthShort: MONTHS_SHORT_ID[d.getMonth()],
                count,
            };
        });
    }, [weekAnchor, spkList]);

    const filtered = useMemo(() => {
        let list = spkList;
        if (filterStatus !== "all") list = list.filter(s => s.status === filterStatus);
        if (selectedDateFilter !== "ALL") {
            list = list.filter(s => s.scheduleDate.toISOString().slice(0, 10) === selectedDateFilter);
        }
        if (search) {
            const s = search.toLowerCase();
            list = list.filter(spk =>
                spk.customerName.toLowerCase().includes(s) ||
                (spk as any).perihal?.toLowerCase().includes(s) ||
                spk.technicianName.toLowerCase().includes(s) ||
                (spk as any).quotationNoSurat?.toLowerCase().includes(s)
            );
        }
        return list;
    }, [spkList, filterStatus, selectedDateFilter, search]);

    // Stats
    const stats = useMemo(() => ({
        all: spkList.length,
        assigned: spkList.filter(s => s.status === "assigned").length,
        in_progress: spkList.filter(s => s.status === "in_progress").length,
        done: spkList.filter(s => s.status === "done").length,
    }), [spkList]);

    // Technician columns for Calendar Resource Timeline (Screenshot 9)
    const technicianColumns = useMemo(() => {
        const byTech = new Map<string, { name: string; total: number; done: number; items: SPK[] }>();
        for (const s of spkList) {
            const tName = s.technicianName || "Teknisi Lapangan";
            const cur = byTech.get(tName) ?? { name: tName, total: 0, done: 0, items: [] };
            cur.total += 1;
            if (s.status === "done") cur.done += 1;
            cur.items.push(s);
            byTech.set(tName, cur);
        }
        return Array.from(byTech.values()).map(t => ({
            ...t,
            completionPct: t.total > 0 ? Math.round((t.done / t.total) * 100) : 0,
        }));
    }, [spkList]);

    // 12-Month Completion Heatmap summary (Screenshot 8)
    const monthlyHeatmap = useMemo(() => {
        const counts = Array.from({ length: 12 }).map((_, mIdx) => {
            const monthItems = spkList.filter(s => s.scheduleDate.getMonth() === mIdx);
            const doneCount = monthItems.filter(s => s.status === "done").length;
            return {
                monthIdx: mIdx,
                label: MONTHS_SHORT_ID[mIdx],
                total: monthItems.length,
                done: doneCount,
            };
        });
        return counts;
    }, [spkList]);

    return (
        <div className="space-y-5">

            {/* ── Header & Sub-View Switcher ── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                        <ClipboardList size={22} className="text-[var(--accent)]" /> Master Penugasan &amp; Jadwal SPK
                    </h1>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
                        Kelola Surat Perintah Kerja, kalender timeline teknisi, heatmap penyelesaian 12 bulan, dan standar SOP tugas
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={load}
                        className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                        title="Muat ulang SPK"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                    </button>
                    {canCreate && (
                        <>
                            <button
                                onClick={() => setRecurringOpen(true)}
                                className="flex items-center gap-2 px-3.5 py-2 bg-[var(--bg-card)] text-[var(--text-primary)] text-xs sm:text-sm font-bold rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors border border-[var(--border-subtle)] cursor-pointer"
                            >
                                <Repeat size={15} /> Jadwal Rutin
                            </button>
                            <button
                                onClick={() => setCreateOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white text-xs sm:text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] transition-colors shadow-xs cursor-pointer"
                            >
                                <Plus size={15} /> Buat SPK
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── In-Page Mode Tabs (Menggantikan Submenu Bertingkat di Sidebar) ── */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] pb-2.5">
                {([
                    { id: "list", label: `📋 Daftar & Jadwal SPK (${stats.all})` },
                    { id: "calendar", label: `🗓️ Kalender Timeline Teknisi (${technicianColumns.length} Teknisi)` },
                    { id: "analytics-sop", label: "📊 Analitik Heatmap 12 Bulan & Tipe Tugas" },
                ] as const).map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setViewTab(t.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                            viewTab === t.id
                                ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs"
                                : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {viewTab === "list" && (
                <>
                    {/* ── Topographic Banner + 7-Day Horizontal Date Carousel (Screenshot 4: beta.jarivis.com/task) ── */}
                    <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-[#1e3a8a] via-[#1d4ed8] to-[#0f766e] text-white shadow-md space-y-3.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <span className="text-[10.5px] font-bold uppercase tracking-widest text-blue-200 block">
                                    NAVIGASI TANGGAL PENUGASAN MINGGUAN
                                </span>
                                <h3 className="text-sm sm:text-base font-extrabold">
                                    Pilih Hari Kerja atau Tampilkan Semua Penugasan Terjadwal
                                </h3>
                            </div>
                            <div className="flex items-center gap-1.5 self-start sm:self-auto">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const prev = new Date(weekAnchor);
                                        prev.setDate(prev.getDate() - 7);
                                        setWeekAnchor(prev);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold cursor-pointer"
                                >
                                    &lsaquo; Minggu Lalu
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWeekAnchor(new Date());
                                        setSelectedDateFilter("ALL");
                                    }}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                                        selectedDateFilter === "ALL"
                                            ? "bg-white text-slate-900 shadow-xs"
                                            : "bg-white/15 hover:bg-white/25 text-white"
                                    }`}
                                >
                                    Semua Tanggal ({stats.all})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = new Date(weekAnchor);
                                        next.setDate(next.getDate() + 7);
                                        setWeekAnchor(next);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold cursor-pointer"
                                >
                                    Minggu Depan &rsaquo;
                                </button>
                            </div>
                        </div>

                        {/* 7-Day Snap Carousel */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 overflow-x-auto no-scrollbar">
                            {weekDaysCarousel.map(d => {
                                const isSel = selectedDateFilter === d.iso;
                                return (
                                    <button
                                        key={d.iso}
                                        type="button"
                                        onClick={() => setSelectedDateFilter(isSel ? "ALL" : d.iso)}
                                        className={`p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                                            isSel
                                                ? "bg-white text-slate-900 border-white shadow-md scale-[1.02]"
                                                : "bg-slate-950/35 hover:bg-slate-950/50 text-white border-white/15"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between text-[11px] font-bold opacity-85">
                                            <span>{d.dayName}</span>
                                            <span>{d.dayNum} {d.monthShort}</span>
                                        </div>
                                        <div className="mt-1.5 flex items-baseline justify-between">
                                            <span className="text-lg font-black font-mono">{d.count}</span>
                                            <span className="text-[10px] font-semibold opacity-75">Tugas</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Stat cards (Solid/Interactive Monitoring Style) ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { key: "all", label: "Total SPK", color: "bg-slate-100 text-slate-700", count: stats.all },
                            { key: "assigned", label: "Assigned / Belum Kerja", color: "bg-blue-100 text-blue-700", count: stats.assigned },
                            { key: "in_progress", label: "In Progress", color: "bg-amber-100 text-amber-700", count: stats.in_progress },
                            { key: "done", label: "Selesai", color: "bg-emerald-100 text-emerald-700", count: stats.done },
                        ].map(s => (
                            <button
                                key={s.key}
                                onClick={() => setFilterStatus(s.key as SPK["status"] | "all")}
                                className={`rounded-xl px-4 py-3 text-left transition-all border-2 cursor-pointer ${
                                    filterStatus === s.key
                                        ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/30"
                                        : "border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-slate-300"
                                } shadow-2xs`}
                            >
                                <p className="text-2xl font-black font-mono text-[var(--text-primary)]">{s.count}</p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold mt-1 ${s.color}`}>
                                    {s.label}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* ── Search & filter ── */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="relative flex-1 min-w-[240px]">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                className="w-full pl-8 pr-3 py-2 text-sm border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
                                placeholder="Cari klien, teknisi, nomor surat..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                            {selectedDateFilter !== "ALL" && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedDateFilter("ALL")}
                                    className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold cursor-pointer"
                                >
                                    Tanggal: {selectedDateFilter} &times;
                                </button>
                            )}
                            <Filter size={12} />
                            <span className="font-semibold">{filtered.length} SPK</span>
                        </div>
                    </div>

                    {/* ── Table & Mobile Cards ── */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-xs">
                        {loading ? (
                            <div className="flex items-center justify-center py-16 text-slate-400">
                                <Loader2 size={20} className="animate-spin mr-2" /> Memuat...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-16 text-slate-400">
                                <ClipboardList size={36} className="mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">
                                    {spkList.length === 0 ? "Belum ada SPK." : "Tidak ada hasil pencarian pada filter ini."}
                                </p>
                                {spkList.length === 0 && canCreate && (
                                    <button
                                        onClick={() => setCreateOpen(true)}
                                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        <Plus size={14} /> Buat SPK Pertama
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Desktop table */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr>
                                                {["No. Surat / Perihal", "Klien", "Teknisi", "Jadwal", "Status", ""].map(h => (
                                                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[var(--text-muted)] bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] whitespace-nowrap">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map(spk => {
                                                const cfg = STATUS_CONFIG[spk.status];
                                                return (
                                                    <tr
                                                        key={spk.id}
                                                        className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-tertiary)]/60 transition-colors cursor-pointer"
                                                        onClick={() => setSelected(spk)}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <p className="text-xs font-mono text-[var(--text-muted)]">{(spk as any).quotationNoSurat}</p>
                                                            <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5 max-w-xs truncate">{(spk as any).perihal}</p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm font-medium text-[var(--text-primary)] max-w-[160px] truncate">{spk.customerName}</p>
                                                            {(spk as any).lokasi && (
                                                                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5 max-w-[160px] truncate">
                                                                    <MapPin size={10} /> {(spk as any).lokasi}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center text-xs font-bold text-emerald-700 flex-shrink-0">
                                                                    {spk.technicianName[0]?.toUpperCase()}
                                                                </div>
                                                                <span className="text-sm text-[var(--text-primary)]">{spk.technicianName}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap font-mono">
                                                            {fmt(spk.scheduleDate)}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.color}`}>
                                                                {cfg.icon} {cfg.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <ChevronRight size={16} className="text-slate-300" />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile cards */}
                                <div className="md:hidden divide-y divide-[var(--border-subtle)]">
                                    {filtered.map(spk => {
                                        const cfg = STATUS_CONFIG[spk.status];
                                        return (
                                            <div key={spk.id} className="p-4 cursor-pointer active:bg-[var(--bg-tertiary)]"
                                                onClick={() => setSelected(spk)}>
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-mono text-[var(--text-muted)]">{(spk as any).quotationNoSurat}</p>
                                                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{(spk as any).perihal}</p>
                                                    </div>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${cfg.color}`}>
                                                        {cfg.icon} {cfg.label}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-[var(--text-primary)] truncate">{spk.customerName}</p>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
                                                    <span>{spk.technicianName}</span>
                                                    <span>·</span>
                                                    <span>{fmt(spk.scheduleDate)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}

            {/* ── TAB 2: KALENDER TIMELINE TEKNISI (Screenshot 9: beta.jarivis.com/task/calendar) ── */}
            {viewTab === "calendar" && (
                <div className="clean-card p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                        <div>
                            <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                                Kalender Resource Timeline &amp; Tingkat Penyelesaian Teknisi
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)]">
                                Pantau distribusi beban kerja per teknisi beserta persentase penyelesaian tugasnya
                            </p>
                        </div>

                        {/* Filter Teknisi Ramah Layar HP */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setSelectedTechTimeline("ALL")}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                                    selectedTechTimeline === "ALL"
                                        ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                        : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                                }`}
                            >
                                Semua Teknisi ({technicianColumns.length})
                            </button>
                            {technicianColumns.map(tc => (
                                <button
                                    key={tc.name}
                                    type="button"
                                    onClick={() => setSelectedTechTimeline(tc.name)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                                        selectedTechTimeline === tc.name
                                            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                            : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                                    }`}
                                >
                                    {tc.name} ({tc.completionPct}%)
                                </button>
                            ))}
                        </div>
                    </div>

                    {technicianColumns.length === 0 ? (
                        <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                            Belum ada penugasan teknisi yang terjadwal.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {technicianColumns
                                .filter(tc => selectedTechTimeline === "ALL" || tc.name === selectedTechTimeline)
                                .map(tc => (
                                    <div key={tc.name} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-9 h-9 rounded-full bg-[var(--accent)] text-white font-black text-xs flex items-center justify-center shrink-0">
                                                    {tc.name.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-sm text-[var(--text-primary)] truncate">{tc.name}</h4>
                                                    <span className="text-[11px] text-[var(--text-secondary)]">
                                                        Tingkat Penyelesaian: <strong>{tc.completionPct}%</strong> ({tc.done}/{tc.total})
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="w-full h-2 rounded-full bg-[var(--bg-card)] overflow-hidden border border-[var(--border-subtle)]">
                                            <div
                                                style={{ width: `${tc.completionPct}%` }}
                                                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                                            />
                                        </div>

                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1 pt-1">
                                            {tc.items.map((item, idx) => {
                                                const cfg = STATUS_CONFIG[item.status];
                                                const slotHour = `${String(8 + (idx % 9)).padStart(2, "0")}:00 WIB`;
                                                return (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => setSelected(item)}
                                                        className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent)] cursor-pointer text-xs space-y-1 transition-colors"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="font-mono text-[10.5px] font-bold text-[var(--accent-text)]">
                                                                {slotHour} • {fmt(item.scheduleDate)}
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.color}`}>
                                                                {cfg.label}
                                                            </span>
                                                        </div>
                                                        <p className="font-bold text-[var(--text-primary)] truncate">{item.customerName}</p>
                                                        <p className="text-[11px] text-[var(--text-secondary)] truncate">{(item as any).perihal}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB 3: ANALITIK HEATMAP 12 BULAN & MATRIKS TIPE TUGAS (Screenshot 5 & 8) ── */}
            {viewTab === "analytics-sop" && (
                <div className="space-y-5">
                    {/* Heatmap Kalender Tugas Selesai 12 Bulan (Jan - Des) */}
                    <div className="clean-card p-5 space-y-4">
                        <div>
                            <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                                Heatmap Kalender Tugas Selesai (Januari – Desember)
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)]">
                                Distribusi kepadatan penugasan dan penyelesaian SPK sepanjang tahun berjalan
                            </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                            {monthlyHeatmap.map(m => {
                                const intensity = m.done >= 5 ? "bg-emerald-600 text-white" : m.done >= 2 ? "bg-emerald-500/30 text-emerald-900 dark:text-emerald-200" : m.total > 0 ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" : "bg-[var(--bg-tertiary)] text-[var(--text-muted)]";
                                return (
                                    <div key={m.monthIdx} className="p-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-extrabold text-[var(--text-primary)]">{m.label}</span>
                                            <span className={`px-2 py-0.5 rounded-lg text-[10.5px] font-mono font-bold ${intensity}`}>
                                                {m.done}/{m.total} Selesai
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-7 gap-1 pt-1">
                                            {Array.from({ length: 14 }).map((_, cellIdx) => {
                                                const activeCell = cellIdx < m.done;
                                                const assignedCell = !activeCell && cellIdx < m.total;
                                                return (
                                                    <span
                                                        key={cellIdx}
                                                        className={`h-2.5 rounded-xs ${
                                                            activeCell
                                                                ? "bg-emerald-500"
                                                                : assignedCell
                                                                ? "bg-amber-400"
                                                                : "bg-[var(--bg-tertiary)]"
                                                        }`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Matriks Konfigurasi SOP Tipe Tugas (Screenshot 5: beta.jarivis.com/task/type) */}
                    <div className="clean-card p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                                    Standar Matriks Tipe Tugas &amp; Aturan Bukti Lapangan (SOP PCO &amp; Anti-Rayap)
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)]">
                                    Atur kewajiban rekaman foto, izin penundaan, geofence check-in, serta form pre-check-in/out per layanan
                                </p>
                            </div>
                            {sopSavedMsg && (
                                <span className="px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-600 text-xs font-bold">
                                    {sopSavedMsg}
                                </span>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse min-w-[780px]">
                                <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[10.5px] font-bold uppercase text-[var(--text-muted)]">
                                    <tr>
                                        <th className="py-3 px-3.5">Nama Tipe Tugas</th>
                                        <th className="py-3 px-3.5">Rekaman &amp; Bukti</th>
                                        <th className="py-3 px-3.5">Izinkan Tunda</th>
                                        <th className="py-3 px-3.5">Geofence Check-In</th>
                                        <th className="py-3 px-3.5">Form Pre-Check-In</th>
                                        <th className="py-3 px-3.5">Form Pre-Check-Out</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-subtle)]">
                                    {sopRules.map((rule, idx) => (
                                        <tr key={rule.id} className="hover:bg-[var(--bg-tertiary)]/50">
                                            <td className="py-3 px-3.5 font-extrabold text-[var(--text-primary)]">
                                                <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 text-[10px] mr-1.5">
                                                    {rule.category}
                                                </span>
                                                {rule.name}
                                            </td>
                                            <td className="py-3 px-3.5">
                                                <select
                                                    value={rule.recordingMode}
                                                    onChange={e => {
                                                        const next = [...sopRules];
                                                        next[idx] = { ...rule, recordingMode: e.target.value };
                                                        setSopRules(next);
                                                        setSopSavedMsg("Aturan tipe tugas diperbarui.");
                                                        setTimeout(() => setSopSavedMsg(null), 2000);
                                                    }}
                                                    className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold"
                                                >
                                                    <option>{rule.recordingMode}</option>
                                                    <option>Wajib Foto Kamera Langsung</option>
                                                    <option>Opsional</option>
                                                </select>
                                            </td>
                                            <td className="py-3 px-3.5">
                                                <select
                                                    value={rule.allowPostpone}
                                                    onChange={e => {
                                                        const next = [...sopRules];
                                                        next[idx] = { ...rule, allowPostpone: e.target.value };
                                                        setSopRules(next);
                                                        setSopSavedMsg("Aturan tipe tugas diperbarui.");
                                                        setTimeout(() => setSopSavedMsg(null), 2000);
                                                    }}
                                                    className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold"
                                                >
                                                    <option>Ya (Dengan Alasan)</option>
                                                    <option>Ya</option>
                                                    <option>Tidak Diizinkan</option>
                                                </select>
                                            </td>
                                            <td className="py-3 px-3.5">
                                                <select
                                                    value={rule.geofenceCheckIn}
                                                    onChange={e => {
                                                        const next = [...sopRules];
                                                        next[idx] = { ...rule, geofenceCheckIn: e.target.value };
                                                        setSopRules(next);
                                                        setSopSavedMsg("Aturan tipe tugas diperbarui.");
                                                        setTimeout(() => setSopSavedMsg(null), 2000);
                                                    }}
                                                    className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold"
                                                >
                                                    <option>Wajib Dalam Radius</option>
                                                    <option>Fleksibel (Auto-Anchor)</option>
                                                </select>
                                            </td>
                                            <td className="py-3 px-3.5 text-[var(--text-secondary)] font-medium">{rule.preCheckInForm}</td>
                                            <td className="py-3 px-3.5 text-[var(--text-secondary)] font-medium">{rule.preCheckOutForm}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modals ── */}
            {createOpen && (
                <CreateSPKModal
                    companyId={companyId}
                    user={user!}
                    onClose={() => setCreateOpen(false)}
                    onCreated={() => { setCreateOpen(false); void load(); }}
                />
            )}

            {recurringOpen && (
                <RecurringScheduleModal
                    companyId={companyId}
                    user={user!}
                    onClose={() => setRecurringOpen(false)}
                    onCreated={() => { setRecurringOpen(false); void load(); }}
                />
            )}

            {selected && (
                <SPKDetailModal
                    spk={selected}
                    canEdit={canCreate}
                    companyId={companyId}
                    onClose={() => setSelected(null)}
                    onUpdated={() => { setSelected(null); void load(); }}
                />
            )}
        </div>
    );
}
