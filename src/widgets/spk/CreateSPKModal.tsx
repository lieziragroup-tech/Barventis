import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, ClipboardList, Loader2, Search, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '@/shared/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from '@/shared/lib/firebase';
import { createSPK } from '@/shared/api/spkService';
import { createProject } from '@/shared/api/projects';
import { geocodeAddress } from '@/shared/utils/geocoding';
import { warrantyToTotalMonths } from '@/shared/lib/warrantyPricingEngine';
import { formatRupiah, cn, formatDate as fmt } from '@/shared/lib/utils';
import type { Quotation, AppUser } from '@/entities/types';

const spkSchema = z.object({
    quotationId: z.string().min(1, "⚠️ Dokumen penawaran belum dipilih. Silakan klik salah satu penawaran di atas."),
    technicianId: z.string().min(1, "⚠️ Teknisi belum ditugaskan. Mohon pilih salah satu teknisi untuk pekerjaan ini."),
    scheduleDate: z.string().min(1, "⚠️ Tanggal pengerjaan wajib diisi. Kapan teknisi harus berangkat?"),
    lokasi: z.string().optional(),
    notes: z.string().optional()
});

type SpkFormValues = z.infer<typeof spkSchema>;

export function CreateSPKModal({
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
    const [quoSearch, setQuoSearch] = useState("");
    const [serverError, setServerError] = useState("");

    const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<SpkFormValues>({
        resolver: zodResolver(spkSchema),
        defaultValues: {
            quotationId: "",
            technicianId: "",
            scheduleDate: "",
            lokasi: "",
            notes: ""
        }
    });

    const quotationId = watch('quotationId');
    const technicianId = watch('technicianId');
    const selectedQuo = useMemo(() => quotations.find(q => q.id === quotationId), [quotations, quotationId]);

    useEffect(() => {
        const load = async () => {
            setLoadingData(true);
            try {
                const [quoSnap, spkSnap, userSnap] = await Promise.all([
                    getDocs(query(
                        collection(db, "quotations"),
                        where("companyId", "==", companyId),
                    )),
                    getDocs(query(
                        collection(db, "spk"),
                        where("companyId", "==", companyId),
                    )),
                    getDocs(query(
                        collection(db, "users"),
                        where("companyId", "==", companyId),
                        where("role", "==", "TEKNISI_LAPANGAN"),
                        where("isActive", "==", true),
                    )),
                ]);

                const usedQIds = new Set(spkSnap.docs.map(d => d.data().quotationId as string));
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
                            objekPekerjaan: data.objekPekerjaan,
                            garansiTahun: data.garansiTahun,
                            garansiNilai: data.garansiNilai,
                            garansiUnit: data.garansiUnit,
                            companyId: data.companyId,
                            tanggal: (data.tanggal as Timestamp).toDate(),
                            status: data.status,
                        } as unknown as Quotation;
                    })
                    .filter(q => (q.status === "approved" || q.status === "deal" || q.status === "sent_to_client") && !usedQIds.has(q.id));

                const tekList = userSnap.docs.map(d => ({ uid: d.id, ...d.data() } as AppUser));

                setQuotations(quoList);
                setTeknisis(tekList);
            } catch (err) {
                console.error("Failed to load data for SPK modal", err);
            } finally {
                setLoadingData(false);
            }
        };
        load();
    }, [companyId]);

    const filteredQuos = useMemo(() => {
        if (!quoSearch) return quotations;
        const s = quoSearch.toLowerCase();
        return quotations.filter(q =>
            q.noSurat.toLowerCase().includes(s) ||
            q.kepadaNama.toLowerCase().includes(s) ||
            q.perihal.toLowerCase().includes(s)
        );
    }, [quotations, quoSearch]);

    const onSubmit = async (data: SpkFormValues) => {
        setServerError("");
        const teknisi = teknisis.find(t => t.uid === data.technicianId);
        if (!selectedQuo || !teknisi) return;

        const alamatLengkap = data.lokasi?.trim() || selectedQuo.lokasiPekerjaan || (selectedQuo.kepadaAlamatLines ?? []).join(", ");
        const svcType = selectedQuo.kategori === "AR" ? "TERMITE_CONTROL" : "GENERAL_PEST_CONTROL";
        const warrantyMonths = warrantyToTotalMonths(
            selectedQuo.garansiNilai ?? selectedQuo.garansiTahun ?? 0,
            selectedQuo.garansiUnit ?? "tahun"
        );

        try {
            await createSPK({
                quotationId: selectedQuo.id,
                quotationNoSurat: selectedQuo.noSurat,
                customerName: selectedQuo.kepadaNama,
                technicianId: data.technicianId,
                technicianName: teknisi.name,
                scheduleDate: new Date(data.scheduleDate),
                serviceType: svcType,
                perihal: selectedQuo.perihal,
                lokasi: alamatLengkap,
                notes: data.notes?.trim() ?? "",
                companyId,
                createdBy: user.uid,
                createdByName: user.name,
            });

            // Jembatan otomatis ke sistem Fieldwork Teknisi (tabel projects + work_reports READY)
            try {
                let initLat = selectedQuo.latitude || 0;
                let initLng = selectedQuo.longitude || 0;
                if ((!initLat || !initLng) && alamatLengkap && alamatLengkap.length >= 5) {
                    try {
                        const geo = await geocodeAddress(alamatLengkap);
                        if (geo) {
                            initLat = geo.lat;
                            initLng = geo.lng;
                        }
                    } catch {
                        // Jika offline / gagal, koordinat 0,0 akan di-anchor otomatis saat teknisi check-in pertama
                    }
                }

                await createProject({
                    projectName: `${selectedQuo.kepadaNama} — ${selectedQuo.noSurat}`,
                    clientName: selectedQuo.kepadaNama,
                    address: alamatLengkap || "Lokasi Pelanggan",
                    latitude: initLat,
                    longitude: initLng,
                    radius: 100,
                    workDate: data.scheduleDate,
                    workType: selectedQuo.perihal,
                    serviceType: svcType,
                    warrantyMonths,
                    contractType: selectedQuo.kategori === "AR" ? "ONE_TIME" : "RECURRING",
                    notes: data.notes?.trim() || `SPK dari Penawaran ${selectedQuo.noSurat}`,
                });
            } catch (projErr) {
                console.warn("[CreateSPKModal] Gagal membuat entri project otomatis:", projErr);
            }

            onCreated();
        } catch (e) {
            setServerError(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <form onSubmit={handleSubmit(onSubmit)} className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
                    <div>
                        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <ClipboardList size={18} className="text-[var(--accent)]" /> Tugaskan Pekerjaan Baru (SPK)
                        </h3>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            Pilih dokumen penawaran resmi yang sudah disetujui untuk diteruskan ke aplikasi lapangan Teknisi.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                    {loadingData ? (
                        <div className="flex items-center justify-center py-12 text-slate-400">
                            <Loader2 size={20} className="animate-spin mr-2" /> Memuat data...
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">1. Pilih Dokumen Penawaran Resmi *</label>
                                <div className="relative mb-2">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                        placeholder="Cari nomor surat atau nama klien..."
                                        value={quoSearch}
                                        onChange={e => setQuoSearch(e.target.value)}
                                    />
                                </div>
                                {filteredQuos.length === 0 ? (
                                    <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                                        <FileText size={24} className="mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">{quotations.length === 0 ? "Saat ini belum ada penawaran disetujui yang menunggu untuk dijadikan SPK." : "Penawaran yang Anda cari tidak ditemukan."}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {filteredQuos.map(q => (
                                            <button
                                                type="button"
                                                key={q.id}
                                                onClick={() => {
                                                    setValue('quotationId', q.id, { shouldValidate: true });
                                                    setValue('lokasi', q.lokasiPekerjaan || (q.kepadaAlamatLines ?? []).join(", "));
                                                }}
                                                className={cn("w-full text-left px-4 py-3 rounded-xl border transition-all", quotationId === q.id ? "border-[var(--accent)] bg-[var(--accent-glow)] ring-1 ring-[var(--accent)]" : "border-slate-200 hover:border-emerald-200 hover:bg-slate-50")}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-900 font-mono">{q.noSurat}</p>
                                                        <p className="text-xs text-slate-600 mt-0.5 truncate">{q.kepadaNama}</p>
                                                        <p className="text-xs text-slate-400 truncate">{q.perihal}</p>
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        <p className="text-xs font-semibold text-slate-700">{formatRupiah(q.total)}</p>
                                                        <p className="text-xs text-slate-400">{fmt(q.tanggal)}</p>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {errors.quotationId && <p className="text-red-500 text-xs mt-1">{errors.quotationId.message}</p>}
                            </div>

                            {selectedQuo && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
                                    <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-emerald-900 font-mono">{selectedQuo.noSurat}</p>
                                        <p className="text-xs text-emerald-700">{selectedQuo.kepadaNama} · {selectedQuo.perihal}</p>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">2. Tugaskan ke Teknisi Siapa? *</label>
                                {teknisis.length === 0 ? (
                                    <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                                        <AlertCircle size={14} /> Belum ada akun teknisi yang aktif. Silakan tambahkan teknisi di menu Manajemen User.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {teknisis.map(t => (
                                            <button
                                                type="button"
                                                key={t.uid}
                                                onClick={() => setValue('technicianId', t.uid, { shouldValidate: true })}
                                                className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all", technicianId === t.uid ? "border-[var(--accent)] bg-[var(--accent-glow)] ring-1 ring-[var(--accent)]" : "border-slate-200 hover:border-emerald-200 hover:bg-slate-50")}
                                            >
                                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0">
                                                    {t.name[0]?.toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                                                    <p className="text-xs text-slate-400 truncate">{t.jabatan || "Teknisi Lapangan"}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {errors.technicianId && <p className="text-red-500 text-xs mt-1">{errors.technicianId.message}</p>}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">3. Kapan Jadwal Pekerjaannya? *</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                        min={new Date().toISOString().split("T")[0]}
                                        {...register('scheduleDate')}
                                    />
                                    {errors.scheduleDate && <p className="text-red-500 text-xs mt-1">{errors.scheduleDate.message}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Lokasi Detail Pekerjaan</label>
                                    <input
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                        placeholder="Ketik alamat lengkap atau patokan lokasi..."
                                        {...register('lokasi')}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Pesan Khusus untuk Teknisi (Opsional)</label>
                                <textarea
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
                                    rows={2}
                                    placeholder="Contoh: Koordinasi dengan PIC sebelum memulai injeksi..."
                                    {...register('notes')}
                                />
                            </div>

                            {serverError && (
                                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {serverError}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors">
                        Batal
                    </button>
                    <button type="submit" disabled={isSubmitting || loadingData} className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm">
                        {isSubmitting ? <><Loader2 size={13} className="animate-spin" /> Sedang memproses...</> : <><ClipboardList size={13} /> Terbitkan SPK & Kirim ke Teknisi</>}
                    </button>
                </div>
            </form>
        </div>
    );
}
