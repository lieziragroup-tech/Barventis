import { useState, useEffect, useMemo } from "react";
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { Pagination } from '@/shared/ui/Pagination';
import {
    Users, Search, X, RefreshCw, Loader2, FileText,
    ChevronDown, ChevronUp, CheckCircle2, MessageCircle,
    Shield, Clock, AlertTriangle, CalendarCheck,
    MapPin, ClipboardCheck, Phone, Building2, Wrench,
    Navigation, ExternalLink, Eye, AlertCircle, CheckSquare,
    Edit3, Crosshair, Compass, Map as MapIcon,
} from "lucide-react";
import { collection, query, where, getDocs, doc, setDoc, Timestamp } from '@/shared/lib/firebase';
import { db } from '@/shared/lib/firebase';
import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/app/store/authStore';
import { getQuotations, updateCustomerProfileQuotations } from '@/shared/api/quotationService';
import * as XLSX from "xlsx";
import { UploadCloud, Download, Plus, Send } from "lucide-react";
import { getCustomerRecapPermission, setCustomerRecapPermission } from '@/shared/lib/permenkesRecapEngine';
import { formatDate } from '@/shared/lib/utils';
import { LAYANAN_CONFIG } from '@/shared/lib/quotationConfig';
import type { Quotation, ServiceType } from '@/entities/types';
import { MapPicker } from '@/widgets/common/MapPicker';
import { KontrolRayapPage } from './KontrolRayapPage';
import { searchAddressSuggestions, type AddressSuggestion } from '@/shared/utils/geocoding';
import { fetchMyProjects, createProject } from '@/shared/api/projects';

interface ControlChecklist {
    id: string; tanggal: Date; teknisi: string; catatan: string;
    hasilKontrol: "baik" | "perlu_tindak_lanjut" | "darurat";
}
interface WarrantyInfo {
    quotationId: string; noSurat: string; garansiTahun: number; jenisGaransi?: string;
    dealAt: Date; expiredAt: Date; isActive: boolean; daysRemaining: number;
}
interface ServiceRecord {
    noSurat: string; kategori: "AR" | "PCO"; jenisLayanan: string;
    tanggal: Date; status: string; marketingNama: string;
    garansiTahun?: number; jenisGaransi?: string;
}
// ─── WILAYAH CLASSIFIER ──────────────────────────────────────────────────────

function extractWilayah(alamat: string): string {
    if (!alamat) return "Tidak Diketahui";
    const l = alamat.toLowerCase();
    if (l.includes("jakarta utara")  || l.includes("jakut"))           return "Jakarta Utara";
    if (l.includes("jakarta selatan")|| l.includes("jaksel"))          return "Jakarta Selatan";
    if (l.includes("jakarta barat")  || l.includes("jakbar"))          return "Jakarta Barat";
    if (l.includes("jakarta timur")  || l.includes("jaktim"))          return "Jakarta Timur";
    if (l.includes("jakarta pusat")  || l.includes("jakpus"))          return "Jakarta Pusat";
    if (l.includes("jakarta"))                                           return "Jakarta";
    if (l.includes("tangerang selatan") || l.includes("tangsel"))      return "Tangerang Selatan";
    if (l.includes("tangerang"))                                         return "Tangerang";
    if (l.includes("pamulang"))                                          return "Tangerang Selatan";
    if (l.includes("bogor"))                                             return "Bogor";
    if (l.includes("depok"))                                             return "Depok";
    if (l.includes("bekasi"))                                            return "Bekasi";
    if (l.includes("bandung"))                                           return "Bandung";
    if (l.includes("surabaya"))                                          return "Surabaya";
    if (l.includes("semarang"))                                          return "Semarang";
    if (l.includes("medan"))                                             return "Medan";
    if (l.includes("yogyakarta") || l.includes("jogja"))               return "Yogyakarta";
    if (l.includes("bali"))                                              return "Bali";
    const words = alamat.split(/[\s,./]+/).filter(w => w.length > 3);
    return words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase() : "Lainnya";
}

interface DerivedCustomer {
    id: string; name: string; address: string; addressFull: string[];
    up?: string; wa: string;
    wilayah: string;
    latitude?: number;
    longitude?: number;
    services: ServiceRecord[]; totalQuotations: number; totalDeal: number;
    lastServiceDate: Date | null; jasaDigunakan: string[];
    warranties: WarrantyInfo[]; activeWarranty: WarrantyInfo | null;
    needsAdminDetails?: boolean;
    checklists: ControlChecklist[];
}

const STATUS_COLOR: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600", pending: "bg-amber-100 text-amber-700",
    approved: "bg-blue-100 text-blue-700", rejected: "bg-red-100 text-red-600",
    sent_to_client: "bg-cyan-100 text-cyan-700", deal: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-slate-100 text-slate-400",
};
const STATUS_LABEL: Record<string, string> = {
    draft: "Terdaftar", pending: "Terjadwal", approved: "Terverifikasi",
    rejected: "Dibatalkan", sent_to_client: "Dilaporkan", deal: "Selesai Dilaporkan", cancelled: "Batal",
};

function getSmartCustomerInitials(rawName: string): string {
    const cleaned = rawName
        .replace(/\([^)]*\)/g, " ")
        .replace(/\b(PT\.?|CV\.?|UD\.?|RS\.?|RSUD|Bpk\.?|Bapak|Ibu|Dr\.?|Prof\.?|Persero|Tbk\.?|KC|UP3)\b/gi, " ")
        .trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return rawName.trim().slice(0, 2).toUpperCase() || "PL";
}

function WarrantyBadge({ w }: { w: WarrantyInfo | null }) {
    if (!w) return null;
    const expiring = w.isActive && w.daysRemaining <= 60;
    const cls = !w.isActive
        ? "bg-red-50 border-red-200 text-red-700"
        : expiring
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-emerald-50 border-emerald-200 text-emerald-700";
    const dotCls = !w.isActive
        ? "bg-red-500"
        : expiring
        ? "bg-amber-500"
        : "bg-emerald-500";
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10.5px] font-semibold border ${cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
            {!w.isActive
                ? "Garansi Habis"
                : expiring
                ? `Segera Kontrol (${w.daysRemaining} hr)`
                : `Garansi Aktif (${w.daysRemaining} hr)`}
        </span>
    );
}

function ChecklistModal({ customer, onClose, onSaved }: {
    customer: DerivedCustomer; onClose: () => void; onSaved: (c: ControlChecklist) => void;
}) {
    const { user } = useAuthStore();
    const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
    const [catatan, setCatatan] = useState("");
    const [hasil, setHasil] = useState<ControlChecklist["hasilKontrol"]>("baik");
    const [saving, setSaving] = useState(false);
    const opts = [
        { val: "baik" as const, label: "Baik", cls: "bg-emerald-50 border-emerald-300 text-emerald-700" },
        { val: "perlu_tindak_lanjut" as const, label: "Perlu Tindak Lanjut", cls: "bg-amber-50 border-amber-300 text-amber-700" },
        { val: "darurat" as const, label: "Darurat", cls: "bg-red-50 border-red-300 text-red-700" },
    ];
    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const id = `${customer.id}_${Date.now()}`;
            const entry: ControlChecklist = { id, tanggal: new Date(tanggal), teknisi: user.name, catatan, hasilKontrol: hasil };
            await setDoc(doc(db, "customerChecklists", id), {
                customerId: customer.id, customerName: customer.name, companyId: user.companyId,
                tanggal: Timestamp.fromDate(entry.tanggal), teknisi: entry.teknisi,
                catatan: entry.catatan, hasilKontrol: entry.hasilKontrol,
                createdAt: Timestamp.fromDate(new Date()),
            });
            onSaved(entry); onClose();
        } finally { setSaving(false); }
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <ClipboardCheck size={18} className="text-blue-600" />
                    <h3 className="font-bold text-slate-900">Tambah Kontrol Berkala</h3>
                    <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <p className="text-xs text-slate-500">Pelanggan: <strong>{customer.name}</strong></p>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Tanggal Kontrol</label>
                        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Hasil Kontrol</label>
                        <div className="grid grid-cols-3 gap-2">
                            {opts.map(o => (
                                <button key={o.val} type="button" onClick={() => setHasil(o.val)}
                                    className={`px-2 py-2 text-xs font-semibold border rounded-xl transition-all ${hasil === o.val ? o.cls + " ring-2 ring-offset-1" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Catatan</label>
                        <textarea rows={3} value={catatan} onChange={e => setCatatan(e.target.value)}
                            placeholder="Kondisi lapangan, temuan, tindakan..."
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2.5 text-sm rounded-xl bg-slate-100 text-slate-600 font-medium hover:bg-slate-200">Batal</button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 py-2.5 text-sm rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={14} />} Simpan
                    </button>
                </div>
            </div>
        </div>
    );
}

function EditCustomerProfileModal({
    customer,
    companyId,
    onClose,
    onSaved,
}: {
    customer: DerivedCustomer;
    companyId: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState(customer.name);
    const [wa, setWa] = useState(customer.wa || "");
    const [up, setUp] = useState(customer.up || "");
    const [address, setAddress] = useState(customer.address || "");
    const [wilayah, setWilayah] = useState(
        customer.wilayah && customer.wilayah !== "Tidak Diketahui"
            ? customer.wilayah
            : extractWilayah(customer.address || "")
    );
    const [lat, setLat] = useState<number>(customer.latitude || -6.200000);
    const [lng, setLng] = useState<number>(customer.longitude || 106.816666);
    const [hasCoords, setHasCoords] = useState<boolean>(Boolean(customer.latitude && customer.longitude));

    // Address search state (Google Maps style autocomplete)
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    const debouncedSearchQ = useDebouncedValue(searchQuery, 350);

    useEffect(() => {
        if (!debouncedSearchQ || debouncedSearchQ.trim().length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        let active = true;
        setIsSearching(true);
        searchAddressSuggestions(debouncedSearchQ)
            .then(res => {
                if (active) {
                    setSuggestions(res);
                    setShowSuggestions(res.length > 0);
                }
            })
            .catch(() => {
                if (active) setSuggestions([]);
            })
            .finally(() => {
                if (active) setIsSearching(false);
            });

        return () => { active = false; };
    }, [debouncedSearchQ]);

    const handleSelectSuggestion = (s: AddressSuggestion) => {
        setAddress(s.displayName);
        setLat(s.lat);
        setLng(s.lng);
        setHasCoords(true);
        const detectedWil = extractWilayah(s.displayName);
        if (detectedWil && detectedWil !== "Tidak Diketahui") {
            setWilayah(detectedWil);
        }
        setShowSuggestions(false);
        setSearchQuery("");
    };

    const handleUseCurrentGPS = () => {
        if (!navigator.geolocation) {
            alert("Perangkat ini tidak mendukung sensor GPS.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => {
                setLat(pos.coords.latitude);
                setLng(pos.coords.longitude);
                setHasCoords(true);
            },
            err => {
                alert(err.code === err.PERMISSION_DENIED ? "Izin GPS ditolak oleh peramban." : "Gagal membaca posisi GPS.");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setSaveError("Nama pelanggan wajib diisi.");
            return;
        }
        setSaving(true);
        setSaveError("");
        try {
            await updateCustomerProfileQuotations({
                companyId,
                originalName: customer.name,
                newName: name.trim(),
                wa: wa.trim(),
                up: up.trim(),
                address: address.trim(),
                addressFull: address.trim() ? [address.trim()] : [],
                latitude: hasCoords ? lat : undefined,
                longitude: hasCoords ? lng : undefined,
            });
            onSaved();
            onClose();
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Gagal menyimpan perubahan profil klien.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-800">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <MapPin size={18} className="text-blue-600" /> Edit Profil &amp; Titik Lokasi Klien
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Perbarui kontak, alamat, serta koordinat peta untuk penugasan dan presisi geofencing teknisi
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Form Content */}
                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                    {saveError && (
                        <div className="flex items-center gap-2 p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-xl">
                            <AlertCircle size={14} className="shrink-0" /> {saveError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Kolom Kiri: Data Klien */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Building2 size={13} className="text-slate-500" /> Informasi Utama
                            </h4>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Klien / Perusahaan *</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Contoh: PT Bank Victoria Tbk"
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Kontak WhatsApp</label>
                                    <input
                                        type="text"
                                        value={wa}
                                        onChange={e => setWa(e.target.value)}
                                        placeholder="0812-3456-7890"
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">U.P. / PIC</label>
                                    <input
                                        type="text"
                                        value={up}
                                        onChange={e => setUp(e.target.value)}
                                        placeholder="Bpk. Hendra"
                                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Wilayah Operasional</label>
                                <input
                                    type="text"
                                    value={wilayah}
                                    onChange={e => setWilayah(e.target.value)}
                                    placeholder="Jakarta Selatan, Tangerang, dll"
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Lengkap Lokasi</label>
                                <textarea
                                    rows={3}
                                    value={address}
                                    onChange={e => {
                                        setAddress(e.target.value);
                                        const autoW = extractWilayah(e.target.value);
                                        if (autoW && autoW !== "Tidak Diketahui") setWilayah(autoW);
                                    }}
                                    placeholder="Jl. RS Fatmawati No. 85, Cilandak, Jakarta Selatan..."
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none leading-relaxed"
                                />
                            </div>
                        </div>

                        {/* Kolom Kanan: Rekomendasi Alamat & Peta Interaktif */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Compass size={13} className="text-slate-500" /> Peta &amp; Rekomendasi Lokasi
                            </h4>

                            {/* Autocomplete Search Bar ala Google Maps */}
                            <div className="relative">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => {
                                            setSearchQuery(e.target.value);
                                            setShowSuggestions(true);
                                        }}
                                        onFocus={() => {
                                            if (suggestions.length > 0) setShowSuggestions(true);
                                        }}
                                        placeholder="Cari gedung / tempat (ala Google Maps)..."
                                        className="w-full pl-9 pr-8 py-2 text-xs border border-blue-200 rounded-xl bg-blue-50/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                    {isSearching && (
                                        <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />
                                    )}
                                    {searchQuery && !isSearching && (
                                        <button
                                            type="button"
                                            onClick={() => { setSearchQuery(""); setShowSuggestions(false); }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                {/* Dropdown Rekomendasi Alamat */}
                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[500] max-h-52 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
                                        {suggestions.map((item, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => handleSelectSuggestion(item)}
                                                className="w-full px-3.5 py-2.5 text-left hover:bg-blue-50/80 transition-colors flex items-start gap-2.5 cursor-pointer"
                                            >
                                                <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                                                    <MapPin size={13} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-slate-900 truncate">{item.mainText}</p>
                                                    <p className="text-[10.5px] text-slate-500 line-clamp-1">{item.secondaryText}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Peta Interaktif Leaflet MapPicker */}
                            <div className="rounded-xl overflow-hidden border border-slate-200 shadow-2xs">
                                <MapPicker
                                    latitude={lat}
                                    longitude={lng}
                                    onChange={(newLat, newLng) => {
                                        setLat(newLat);
                                        setLng(newLng);
                                        setHasCoords(true);
                                    }}
                                    className="h-44 w-full"
                                />
                            </div>

                            {/* Quick Tools & Koordinat */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={handleUseCurrentGPS}
                                        className="px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                        title="Gunakan posisi GPS perangkat saat ini"
                                    >
                                        <Crosshair size={13} className="text-emerald-700" />
                                        Posisi GPS Saya Saat Ini
                                    </button>

                                    {hasCoords && (
                                        <a
                                            href={`https://www.google.com/maps?q=${lat},${lng}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-blue-600 hover:underline font-semibold flex items-center gap-1"
                                        >
                                            <ExternalLink size={11} /> Cek di Google Maps
                                        </a>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <label className="block text-[10.5px] font-semibold text-slate-500 mb-0.5">Latitude</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={lat}
                                            onChange={e => {
                                                const v = parseFloat(e.target.value);
                                                if (!isNaN(v)) { setLat(v); setHasCoords(true); }
                                            }}
                                            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10.5px] font-semibold text-slate-500 mb-0.5">Longitude</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={lng}
                                            onChange={e => {
                                                const v = parseFloat(e.target.value);
                                                if (!isNaN(v)) { setLng(v); setHasCoords(true); }
                                            }}
                                            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
                    <p className="text-[11px] text-slate-500">
                        {hasCoords ? `Koordinat aktif: ${lat.toFixed(6)}, ${lng.toFixed(6)}` : "Belum ada koordinat tersimpan"}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                        >
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            Simpan Perubahan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CustomerCard({ customer, indexNumber, expanded, onToggle, onAddChecklist, onEditProfile, onScheduleTechnician }: {
    customer: DerivedCustomer; indexNumber: number; expanded: boolean; onToggle: () => void; onAddChecklist: () => void; onEditProfile: () => void; onScheduleTechnician: () => void;
}) {
    const lastCl = [...customer.checklists].sort((a, b) => b.tanggal.getTime() - a.tanggal.getTime())[0];
    const latestW = customer.activeWarranty ?? customer.warranties[0] ?? null;
    const isOverdue = (latestW && !latestW.isActive) || lastCl?.hasilKontrol === "darurat";
    const isExpiring = (latestW && latestW.isActive && latestW.daysRemaining <= 60) || lastCl?.hasilKontrol === "perlu_tindak_lanjut";
    const initials = getSmartCustomerInitials(customer.name);
    const codeLabel = `CUST-${String(indexNumber).padStart(3, "0")}`;

    const hasTermite = customer.jasaDigunakan.some(j => j.toLowerCase().includes("rayap")) || customer.services.some(s => s.kategori === "AR");
    const hasPest = customer.jasaDigunakan.some(j => j.toLowerCase().includes("pest") || j.toLowerCase().includes("hama")) || customer.services.some(s => s.kategori === "PCO");

    const avatarToneCls = hasTermite
        ? "bg-amber-50/90 border-amber-200/80 text-amber-800"
        : "bg-sky-50/90 border-sky-200/80 text-sky-800";

    const cardBorderCls = isOverdue
        ? "border-red-200/90 bg-white hover:border-red-300"
        : isExpiring
        ? "border-amber-200/90 bg-white hover:border-amber-300"
        : "border-slate-200/85 bg-white hover:border-slate-300";

    const warrantyStatusDot = !latestW
        ? "bg-slate-400"
        : !latestW.isActive
        ? "bg-red-500"
        : latestW.daysRemaining <= 60
        ? "bg-amber-500"
        : "bg-emerald-500";

    const warrantyHeadline = !latestW
        ? "Standar"
        : !latestW.isActive
        ? "Garansi Habis"
        : latestW.daysRemaining <= 60
        ? "Segera Kontrol"
        : "Garansi Aktif";

    const warrantySubtext = !latestW
        ? "Kunjungan reguler"
        : !latestW.isActive
        ? "Perlu jadwal ulang"
        : latestW.daysRemaining >= 365
        ? `Sisa ~${(latestW.daysRemaining / 365).toFixed(1)} tahun (${latestW.daysRemaining} hr)`
        : `Sisa ${latestW.daysRemaining} hari lagi`;

    return (
        <div className={`border rounded-2xl overflow-hidden transition-all duration-150 shadow-2xs ${cardBorderCls}`}>
            <div
                onClick={onToggle}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
                className="w-full p-4 sm:px-5 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
            >
                {/* ZONA 1: Identitas & Alamat Pelanggan */}
                <div className="flex items-start gap-3.5 min-w-0 lg:w-[40%] xl:w-[42%]">
                    <div className={`w-11 h-11 rounded-xl border flex flex-col items-center justify-center shrink-0 ${avatarToneCls}`}>
                        <span className="text-xs font-extrabold tracking-tight leading-none">
                            {initials}
                        </span>
                        <span className="text-[9px] font-mono opacity-75 mt-0.5 leading-none">
                            #{String(indexNumber).padStart(2, "0")}
                        </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-900 leading-snug truncate">
                                {customer.name}
                            </p>
                            {customer.wilayah && customer.wilayah !== "Tidak Diketahui" && (
                                <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/80 shrink-0">
                                    {customer.wilayah}
                                </span>
                            )}
                        </div>

                        <p className="text-xs text-slate-500 line-clamp-1">
                            {customer.address || "Alamat lokasi belum dilengkapi"}
                        </p>

                        <div className="flex items-center gap-3 flex-wrap pt-0.5">
                            <span className="text-[11px] font-mono text-slate-400">
                                {codeLabel}
                            </span>
                            {customer.wa ? (
                                <a
                                    href={`https://wa.me/${customer.wa.replace(/^0/, "62").replace(/\D/g, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="text-[11px] font-mono font-semibold text-emerald-700 hover:underline"
                                >
                                    WA: {customer.wa}
                                </a>
                            ) : (
                                <span className="text-[11px] text-slate-400">
                                    Kontak belum diisi
                                </span>
                            )}
                            {customer.up && (
                                <span className="text-[11px] text-slate-500">
                                    · PIC: {customer.up}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ZONA 2: Ringkasan Operasional & Pelaporan (3 Kolom Rapi dengan Tone Lembut) */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:flex-1 bg-slate-50/90 border border-slate-200/75 rounded-xl px-3.5 py-2.5">
                    {/* Kolom Layanan & Kunjungan */}
                    <div className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Layanan
                        </span>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                            {hasTermite && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
                                    Anti Rayap
                                </span>
                            )}
                            {(hasPest || !hasTermite) && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-sky-50 text-sky-800 border border-sky-200/80">
                                    Pest Control
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] font-mono font-semibold text-slate-600 mt-1">
                            {customer.services.length}x laporan kunjungan
                        </p>
                    </div>

                    {/* Kolom Status Pin Peta GPS */}
                    <div className="min-w-0 border-l border-slate-200/80 pl-2.5 sm:pl-3">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Titik Lokasi
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${customer.latitude && customer.longitude ? "bg-emerald-500" : "bg-amber-500"}`} />
                            <p className="text-xs font-bold text-slate-800 truncate">
                                {customer.latitude && customer.longitude ? "Pin GPS Aktif" : "Belum Ada Pin"}
                            </p>
                        </div>
                        <p className="text-[10.5px] font-mono text-slate-500 truncate mt-0.5">
                            {customer.latitude && customer.longitude
                                ? `${customer.latitude.toFixed(4)}, ${customer.longitude.toFixed(4)}`
                                : "Perlu ditandai"}
                        </p>
                    </div>

                    {/* Kolom Status Garansi & Kontrol */}
                    <div className="min-w-0 border-l border-slate-200/80 pl-2.5 sm:pl-3">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Masa Garansi
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${warrantyStatusDot}`} />
                            <p className="text-xs font-bold text-slate-800 truncate">
                                {warrantyHeadline}
                            </p>
                        </div>
                        <p className="text-[10.5px] text-slate-500 truncate mt-0.5">
                            {lastCl ? `Kontrol: ${formatDate(lastCl.tanggal)}` : warrantySubtext}
                        </p>
                    </div>
                </div>

                {/* ZONA 3: Tombol Aksi Cepat */}
                <div className="shrink-0 flex items-center justify-end gap-2 pt-1 lg:pt-0 border-t lg:border-t-0 border-slate-200/60">
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onEditProfile(); }}
                        className="h-8 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold cursor-pointer transition-colors"
                        title="Edit profil pelanggan & titik koordinat GPS"
                    >
                        Atur Lokasi
                    </button>
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onScheduleTechnician(); }}
                        className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors shadow-2xs inline-flex items-center gap-1"
                        title="Jadwalkan kunjungan proyek ke Teknisi Lapangan"
                    >
                        <Send size={12} /> Jadwalkan
                    </button>
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onAddChecklist(); }}
                        className="h-8 px-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
                        title="Catat / Handle Jadwal Kontrol Pelanggan"
                    >
                        Catat Kontrol
                    </button>
                    <span className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500">
                        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </span>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-slate-100">
                    {/* Info Klien */}
                    <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                            <Building2 size={10} /> Informasi Klien
                        </p>
                        {customer.wilayah && customer.wilayah !== "Tidak Diketahui" && (
                            <div className="flex items-center gap-2 text-xs mb-1">
                                <MapPin size={12} className="text-blue-400 shrink-0" />
                                <span className="text-slate-600">Wilayah: <strong className="text-blue-600">{customer.wilayah}</strong></span>
                            </div>
                        )}
                        {customer.address && (
                            <div className="flex items-center gap-2 text-xs">
                                <Navigation size={12} className="text-blue-500 shrink-0" />
                                <div className="flex items-center gap-2 flex-wrap">
                                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.addressFull.filter(Boolean).join(", "))}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline font-semibold text-[10px] flex items-center gap-0.5">
                                        <ExternalLink size={10}/> Lihat di Maps
                                    </a>
                                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customer.addressFull.filter(Boolean).join(", "))}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="text-emerald-600 hover:underline font-semibold text-[10px] flex items-center gap-0.5">
                                        <Navigation size={10}/> Navigasi
                                    </a>
                                </div>
                            </div>
                        )}
                        {customer.latitude && customer.longitude ? (
                            <div className="flex items-center gap-2 text-xs">
                                <Crosshair size={12} className="text-emerald-600 shrink-0" />
                                <span className="text-slate-600">
                                    Titik Koordinat: <strong className="font-mono text-emerald-700">{customer.latitude.toFixed(6)}, {customer.longitude.toFixed(6)}</strong>
                                </span>
                                <a href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="text-emerald-600 hover:underline font-semibold text-[10px] flex items-center gap-0.5 ml-1">
                                    <ExternalLink size={10} /> Google Maps
                                </a>
                                <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); onEditProfile(); }}
                                    className="text-blue-600 hover:underline font-semibold text-[10px] flex items-center gap-0.5 ml-1 cursor-pointer"
                                >
                                    <Edit3 size={10} /> Ubah Pin
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-xs">
                                <Crosshair size={12} className="text-amber-500 shrink-0" />
                                <span className="text-slate-400 italic">Titik GPS belum ditandai</span>
                                <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); onEditProfile(); }}
                                    className="text-blue-600 hover:underline font-semibold text-[10px] flex items-center gap-0.5 ml-1 cursor-pointer"
                                >
                                    + Tandai di Peta
                                </button>
                            </div>
                        )}
                        {customer.addressFull.filter(Boolean).length > 0 && (
                            <div className="flex items-start gap-2 text-xs">
                                <MapPin size={12} className="text-slate-400 shrink-0 mt-0.5" />
                                <div>{customer.addressFull.filter(Boolean).map((l, i) => <p key={i} className="text-slate-700">{l}</p>)}</div>
                            </div>
                        )}
                        {customer.up && (
                            <div className="flex items-center gap-2 text-xs">
                                <Phone size={12} className="text-slate-400 shrink-0" />
                                <span className="text-slate-700">U.p. {customer.up}</span>
                            </div>
                        )}
                        {customer.wa && (
                            <div className="flex items-center gap-2 text-xs">
                                <MessageCircle size={12} className="text-green-500 shrink-0" />
                                <a href={`https://wa.me/${customer.wa.replace(/^0/, "62").replace(/\D/g, "")}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="text-green-600 hover:underline font-medium">{customer.wa}</a>
                            </div>
                        )}
                        {customer.lastServiceDate && (
                            <div className="flex items-center gap-2 text-xs">
                                <Wrench size={12} className="text-slate-400 shrink-0" />
                                <span className="text-slate-600">Terakhir dikerjakan: <strong>{formatDate(customer.lastServiceDate)}</strong></span>
                            </div>
                        )}
                    </div>

                    {/* Garansi */}
                    {customer.warranties.length > 0 && (
                        <div className="px-5 py-4 bg-purple-50 border-b border-purple-100">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500 mb-3 flex items-center gap-1">
                                <Shield size={10} /> Status Garansi
                            </p>
                            <div className="space-y-2">
                                {customer.warranties.map(w => (
                                    <div key={w.quotationId} className={`p-3 rounded-xl border text-xs ${w.isActive ? "bg-white border-purple-200" : "bg-slate-50 border-slate-200 opacity-60"}`}>
                                        <div className="flex items-center justify-between mb-1">
                                            <code className="font-mono font-bold text-purple-700">{w.noSurat}</code>
                                            {w.isActive
                                                ? <span className="font-bold text-emerald-600">{w.daysRemaining} hari lagi</span>
                                                : <span className="text-slate-400">Kadaluarsa</span>}
                                        </div>
                                        <p className="text-slate-600">{w.jenisGaransi ?? "Anti Rayap"} · {w.garansiTahun} tahun</p>
                                        <p className="text-slate-400 mt-0.5">{formatDate(w.dealAt)} — {formatDate(w.expiredAt)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Kontrol Berkala */}
                    <div className="px-5 py-4 border-b border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                                <ClipboardCheck size={10} /> Kontrol Berkala
                            </p>
                            <button onClick={e => { e.stopPropagation(); onAddChecklist(); }}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                                + Tambah
                            </button>
                        </div>
                        {customer.checklists.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">Belum ada riwayat kontrol.</p>
                        ) : (
                            <div className="space-y-2 max-h-44 overflow-y-auto">
                                {[...customer.checklists].sort((a, b) => b.tanggal.getTime() - a.tanggal.getTime()).map(c => (
                                    <div key={c.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs
                                        ${c.hasilKontrol === "baik" ? "bg-emerald-50 border-emerald-100"
                                        : c.hasilKontrol === "darurat" ? "bg-red-50 border-red-100"
                                        : "bg-amber-50 border-amber-100"}`}>
                                        <div className="shrink-0 mt-0.5">
                                            {c.hasilKontrol === "baik" ? <CheckCircle2 size={13} className="text-emerald-600" />
                                            : c.hasilKontrol === "darurat" ? <AlertTriangle size={13} className="text-red-600" />
                                            : <Clock size={13} className="text-amber-600" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-semibold text-slate-700">{formatDate(c.tanggal)}</span>
                                                <span className="text-slate-400 text-[10px] shrink-0">{c.teknisi}</span>
                                            </div>
                                            {c.catatan && <p className="text-slate-500 mt-0.5">{c.catatan}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Riwayat Kunjungan & Pelaporan Kerja */}
                    <div className="px-5 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1">
                            <FileText size={10} /> Riwayat Kunjungan &amp; Laporan Kerja
                        </p>
                        <div className="space-y-2">
                            {customer.services.sort((a, b) => b.tanggal.getTime() - a.tanggal.getTime()).map(s => (
                                <div key={s.noSurat} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <code className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${s.kategori === "AR" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"}`}>
                                            {s.noSurat}
                                        </code>
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[s.status] ?? "bg-slate-100 text-slate-500"}`}>
                                            {STATUS_LABEL[s.status] ?? "Terdata"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-700 font-medium">{s.jenisLayanan}</p>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        <span className="text-[10px] text-slate-400">{formatDate(s.tanggal)}</span>
                                        <span className="text-[10px] text-slate-400">· Pelaksana: {s.marketingNama}</span>
                                        {s.garansiTahun && s.garansiTahun > 0 && (
                                            <span className="text-[10px] text-purple-600 font-semibold">
                                                · Garansi {s.garansiTahun}thn ({s.jenisGaransi ?? "Anti Rayap"})
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── SCHEDULE TO TECHNICIAN MODAL ────────────────────────────────────────────

function ScheduleToTechnicianModal({
    customer,
    onClose,
    onScheduled,
}: {
    customer: DerivedCustomer;
    onClose: () => void;
    onScheduled: () => void;
}) {
    const hasTermite = customer.jasaDigunakan.some(j => j.toLowerCase().includes("rayap")) ||
        customer.services.some(s => s.kategori === "AR");
    const todayStr = new Date().toISOString().slice(0, 10);
    const defaultWarrantyMonths = customer.activeWarranty?.garansiTahun
        ? customer.activeWarranty.garansiTahun * 12
        : (customer.warranties[0]?.garansiTahun ? customer.warranties[0].garansiTahun * 12 : 0);
    const fullAddr = customer.addressFull.filter(Boolean).join(", ") || customer.address || "";
    const latestCl = [...customer.checklists].sort((a, b) => b.tanggal.getTime() - a.tanggal.getTime())[0];

    const [projectName, setProjectName] = useState(
        `${hasTermite ? "Kontrol / Treatment Rayap" : "Layanan Pest Control"} — ${customer.name}`
    );
    const [serviceType, setServiceType] = useState<ServiceType>(
        hasTermite ? "TERMITE_CONTROL" : "GENERAL_PEST_CONTROL"
    );
    const [workDate, setWorkDate] = useState(todayStr);
    const [startTime, setStartTime] = useState("09:00");
    const [radius, setRadius] = useState(100);
    const [address, setAddress] = useState(fullAddr);
    const [latitude, setLatitude] = useState(customer.latitude ? String(customer.latitude) : "-6.310000");
    const [longitude, setLongitude] = useState(customer.longitude ? String(customer.longitude) : "106.710000");
    const [notes, setNotes] = useState(
        [
            customer.wa ? `Kontak PIC/WA: ${customer.wa}` : "",
            latestCl?.catatan ? `Riwayat terakhir: ${latestCl.catatan.slice(0, 200)}` : "",
        ].filter(Boolean).join(" | ")
    );
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectName.trim() || !address.trim()) {
            setErr("Nama proyek dan alamat wajib diisi.");
            return;
        }
        const latNum = Number(latitude);
        const lngNum = Number(longitude);
        if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
            setErr("Koordinat latitude/longitude harus berupa angka valid.");
            return;
        }
        setSaving(true);
        setErr("");
        try {
            await createProject({
                projectName: projectName.trim(),
                clientName: customer.name,
                address: address.trim(),
                latitude: latNum,
                longitude: lngNum,
                radius: Math.max(25, Number(radius) || 100),
                workDate,
                workType: projectName.trim(),
                serviceType,
                contractType: "ONE_TIME",
                warrantyMonths: defaultWarrantyMonths,
                scheduledStartTime: startTime || "09:00",
                notes: notes.trim() || undefined,
            });
            alert(`Jadwal tugas untuk "${customer.name}" berhasil dikirim ke Daftar Tugas Teknisi (${workDate}).`);
            onScheduled();
            onClose();
        } catch (error) {
            setErr(error instanceof Error ? error.message : "Gagal menjadwalkan ke teknisi.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Send size={16} className="text-blue-600" /> Jadwalkan ke Teknisi
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Kirim penugasan lapangan untuk <strong>{customer.name}</strong> ke aplikasi Teknisi
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                    {err && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                            {err}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Judul Tugas / Pekerjaan</label>
                        <input
                            type="text"
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Jenis Layanan</label>
                            <select
                                value={serviceType}
                                onChange={e => setServiceType(e.target.value as ServiceType)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            >
                                <option value="TERMITE_CONTROL">Anti Rayap (Termite Control)</option>
                                <option value="GENERAL_PEST_CONTROL">General Pest Control</option>
                                <option value="RODENT_CONTROL">Rodent Control (Tikus)</option>
                                <option value="MOSQUITO_CONTROL">Fogging / Nyamuk</option>
                                <option value="FUMIGATION">Fumigasi</option>
                                <option value="DISINFECTION">Disinfeksi</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Kunjungan</label>
                            <input
                                type="date"
                                value={workDate}
                                onChange={e => setWorkDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Jam Mulai</label>
                            <input
                                type="time"
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Radius Haversine (meter)</label>
                            <input
                                type="number"
                                min={25}
                                max={5000}
                                value={radius}
                                onChange={e => setRadius(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Alamat Lokasi</label>
                        <textarea
                            rows={2}
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            required
                        />
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                                Koordinat GPS Check-In
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                customer.latitude && customer.longitude
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                            }`}>
                                {customer.latitude && customer.longitude ? "Dari Pin Pelanggan" : "Default — bisa disesuaikan"}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="text"
                                value={latitude}
                                onChange={e => setLatitude(e.target.value)}
                                placeholder="Latitude"
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                            />
                            <input
                                type="text"
                                value={longitude}
                                onChange={e => setLongitude(e.target.value)}
                                placeholder="Longitude"
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Catatan untuk Teknisi</label>
                        <textarea
                            rows={2}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Instruksi lapangan, nama PIC, riwayat garansi, dsb."
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 cursor-pointer"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {saving ? <><Loader2 size={14} className="animate-spin" /> Menjadwalkan...</> : <><Send size={14} /> Kirim ke Teknisi</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── BULK IMPORT PREVIEW MODAL ───────────────────────────────────────────────

interface ImportRow {
    nama: string;
    kontak: string;
    alamat: string;
    wilayah: string;
    kategoriProyek: "AR" | "PCO";
    jenisLayanan: string;
    proyek: string;
    garansiTahun: number;
    tanggalMulai: string;
    noPH: string;
    noSPK: string;
    pestisida: string;
    marketing: string;
    riwayatKerjaKontrol: string;
    sumberSheet: string;
    _status: "ok" | "duplicate" | "error";
    _reason?: string;
}

interface ImportProgressState {
    current: number;
    total: number;
    phase: string;
}

function BulkImportPreviewModal({
    rows,
    existingNames,
    onConfirm,
    onClose,
    importing,
    progress,
}: {
    rows: ImportRow[];
    existingNames: Set<string>;
    onConfirm: (validRows: ImportRow[]) => void;
    onClose: () => void;
    importing: boolean;
    progress: ImportProgressState | null;
}) {
    const tagged = useMemo<ImportRow[]>(() => {
        const seenInFile = new Set<string>();
        return rows.map(r => {
            if (!r.nama.trim()) return { ...r, _status: "error", _reason: "Nama kosong" };
            const key = r.nama.trim().toLowerCase().replace(/\s+/g, "_");
            if (existingNames.has(key)) return { ...r, _status: "duplicate", _reason: "Sudah ada di database" };
            if (seenInFile.has(key)) return { ...r, _status: "duplicate", _reason: "Duplikat di dalam file" };
            seenInFile.add(key);
            return { ...r, _status: "ok" };
        });
    }, [rows, existingNames]);

    const okRows = useMemo(() => tagged.filter(r => r._status === "ok"), [tagged]);
    const dupRows = useMemo(() => tagged.filter(r => r._status === "duplicate"), [tagged]);
    const errRows = useMemo(() => tagged.filter(r => r._status === "error"), [tagged]);
    const withHistoryCount = useMemo(() => okRows.filter(r => Boolean(r.riwayatKerjaKontrol.trim())).length, [okRows]);
    const previewSlice = useMemo(() => tagged.slice(0, 100), [tagged]);
    const progressPct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={importing ? undefined : onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[88vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Eye size={16} className="text-blue-600" /> Preview Bulk Import Pelanggan & Garansi
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Total {rows.length.toLocaleString("id-ID")} baris terbaca · Import diproses bertahap (100 baris/batch) agar aman untuk Supabase Free Tier
                        </p>
                    </div>
                    <button onClick={onClose} disabled={importing} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 disabled:opacity-40">
                        <X size={18} />
                    </button>
                </div>

                {/* Ringkasan */}
                <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2.5 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
                        <CheckSquare size={13} /> {okRows.length.toLocaleString("id-ID")} siap import
                    </span>
                    {withHistoryCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-bold text-blue-700">
                            <ClipboardCheck size={13} /> {withHistoryCount.toLocaleString("id-ID")} dengan riwayat kerja/kontrol
                        </span>
                    )}
                    {dupRows.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-bold text-amber-700">
                            <AlertTriangle size={13} /> {dupRows.length.toLocaleString("id-ID")} duplikat (dilewati)
                        </span>
                    )}
                    {errRows.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-bold text-red-700">
                            <AlertCircle size={13} /> {errRows.length.toLocaleString("id-ID")} error (dilewati)
                        </span>
                    )}
                </div>

                {/* Progress Bar saat importing */}
                {importing && progress && (
                    <div className="px-6 py-3 bg-blue-50/70 border-b border-blue-100 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-blue-800">
                            <span className="flex items-center gap-1.5">
                                <Loader2 size={13} className="animate-spin" /> {progress.phase}
                            </span>
                            <span className="font-mono">{progress.current.toLocaleString("id-ID")} / {progress.total.toLocaleString("id-ID")} ({progressPct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-600 transition-all duration-200"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Tabel Preview (maks 100 baris agar tetap ringan) */}
                <div className="overflow-auto flex-1 px-6 py-3">
                    {tagged.length > 100 && (
                        <p className="text-[11px] text-slate-500 mb-2">
                            Menampilkan 100 baris pertama sebagai pratinjau. Seluruh <strong>{okRows.length.toLocaleString("id-ID")}</strong> data valid akan tetap diimpor saat tombol konfirmasi diklik.
                        </p>
                    )}
                    <table className="w-full text-left text-xs border-collapse min-w-[760px]">
                        <thead className="sticky top-0 bg-white">
                            <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wide text-[10px]">
                                <th className="px-3 py-2 rounded-l-lg">Status</th>
                                <th className="px-3 py-2">Nama Pelanggan</th>
                                <th className="px-3 py-2">Kontak WA</th>
                                <th className="px-3 py-2">Alamat</th>
                                <th className="px-3 py-2">Garansi</th>
                                <th className="px-3 py-2">Tgl Mulai</th>
                                <th className="px-3 py-2 rounded-r-lg">Kat.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {previewSlice.map((r, i) => (
                                <tr key={i} className={
                                    r._status === "ok" ? "bg-white" :
                                    r._status === "duplicate" ? "bg-amber-50/60" : "bg-red-50/60"
                                }>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {r._status === "ok" ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                                <CheckCircle2 size={11} /> OK
                                            </span>
                                        ) : r._status === "duplicate" ? (
                                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold" title={r._reason}>
                                                <AlertTriangle size={11} /> Duplikat
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-red-700 font-semibold" title={r._reason}>
                                                <AlertCircle size={11} /> Error
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-slate-800 max-w-[160px] truncate" title={r.nama}>{r.nama || "—"}</td>
                                    <td className="px-3 py-2 text-slate-600 max-w-[110px] truncate font-mono text-[11px]">{r.kontak || "—"}</td>
                                    <td className="px-3 py-2 text-slate-500 max-w-[190px] truncate" title={r.alamat}>{r.alamat || "—"}</td>
                                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap font-mono">{r.garansiTahun > 0 ? `${r.garansiTahun} Thn` : "—"}</td>
                                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap font-mono text-[11px]">{r.tanggalMulai || "—"}</td>
                                    <td className="px-3 py-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            r.kategoriProyek === "AR"
                                                ? "bg-purple-100 text-purple-700"
                                                : "bg-cyan-100 text-cyan-700"
                                        }`}>{r.kategoriProyek}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose} disabled={importing} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 disabled:opacity-40 cursor-pointer">
                        Batal
                    </button>
                    <button
                        onClick={() => onConfirm(okRows)}
                        disabled={okRows.length === 0 || importing}
                        className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {importing
                            ? <><Loader2 size={13} className="animate-spin" /> Menyimpan Batch...</>
                            : <><CheckSquare size={13} /> Import {okRows.length.toLocaleString("id-ID")} Pelanggan</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

const CUSTOMER_PAGE_SIZE = 10;


function ManualCustomerModal({
    companyId,
    marketingUid,
    marketingNama,
    onClose,
    onSaved,
}: {
    companyId: string;
    marketingUid: string;
    marketingNama: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState("");
    const [wa, setWa] = useState("");
    const [up, setUp] = useState("");
    const [address, setAddress] = useState("");
    const [kategori, setKategori] = useState<"PCO" | "AR">("PCO");
    const [allowMonthlyRecap, setAllowMonthlyRecap] = useState(false);
    const [buildingsText, setBuildingsText] = useState("GEDUNG A, GEDUNG B, AREA LUAR");
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setErr("Nama pelanggan wajib diisi.");
            return;
        }
        setSaving(true);
        setErr("");
        try {
            setCustomerRecapPermission(name.trim(), {
                allowMonthlyRecap,
                defaultBuildings: buildingsText.split(",").map(s => s.trim()).filter(Boolean),
            });
            const nowIso = new Date().toISOString();
            const { error } = await supabase.from("quotations").insert({
                company_id: companyId,
                marketing_uid: marketingUid,
                status: "draft",
                payload: {
                    noSurat: `CUST-MANUAL/${Date.now().toString().slice(-5)}`,
                    kepadaNama: name.trim(),
                    kepadaUp: up.trim() || undefined,
                    kepadaWa: wa.trim() || undefined,
                    kepadaKontak: wa.trim() || undefined,
                    kepadaAlamat: address.trim(),
                    kepadaAlamatLines: address.trim() ? [address.trim()] : [],
                    perihal: "Registrasi Master Pelanggan Manual",
                    kategori,
                    jenisLayanan: kategori === "AR" ? "anti_rayap_injeksi" : "pest_umum",
                    tipeKontrak: "U",
                    tanggal: nowIso,
                    companyId,
                    marketingUid,
                    marketingNama,
                    status: "draft",
                    allowMonthlyRecap,
                },
            });
            if (error) throw error;
            onSaved();
            onClose();
        } catch (ex) {
            setErr(ex instanceof Error ? ex.message : "Gagal menyimpan pelanggan baru.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-slate-800">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-base font-bold text-slate-900">Tambah Pelanggan Manual</h3>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                        <X size={18} />
                    </button>
                </div>
                {err && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                        {err}
                    </div>
                )}
                <form onSubmit={handleSave} className="space-y-3 text-xs">
                    <div>
                        <label className="block font-semibold text-slate-700 mb-1">Nama Pelanggan / Instansi *</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Contoh: RS PON Prof. Dr. dr. Mahar Mardjono"
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block font-semibold text-slate-700 mb-1">Kategori Layanan</label>
                            <select
                                value={kategori}
                                onChange={e => setKategori(e.target.value as "PCO" | "AR")}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                            >
                                <option value="PCO">Pest &amp; Rodent Control (PCO)</option>
                                <option value="AR">Anti Rayap (AR)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block font-semibold text-slate-700 mb-1">PIC / U.P.</label>
                            <input
                                type="text"
                                value={up}
                                onChange={e => setUp(e.target.value)}
                                placeholder="Nama PIC"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block font-semibold text-slate-700 mb-1">Nomor Telepon / WhatsApp</label>
                        <input
                            type="text"
                            value={wa}
                            onChange={e => setWa(e.target.value)}
                            placeholder="0812-xxxx-xxxx"
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                        />
                    </div>
                    <div>
                        <label className="block font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
                        <textarea
                            rows={2}
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                            placeholder="Alamat lokasi pelanggan..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl resize-none"
                        />
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                        <label className="flex items-center justify-between font-bold text-slate-800 cursor-pointer">
                            <span>Izinkan Laporan Rekapitulasi Bulanan (Permenkes)</span>
                            <input
                                type="checkbox"
                                checked={allowMonthlyRecap}
                                onChange={e => setAllowMonthlyRecap(e.target.checked)}
                            />
                        </label>
                        {allowMonthlyRecap && (
                            <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Daftar Gedung / Zona Standar (pisahkan dengan koma)
                                </label>
                                <input
                                    type="text"
                                    value={buildingsText}
                                    onChange={e => setBuildingsText(e.target.value)}
                                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white font-bold disabled:opacity-50"
                        >
                            {saving ? "Menyimpan..." : "Simpan Pelanggan"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export type CustomerHubTab = "master" | "garansi" | "analisis" | "pengaturan";

export function CustomersPage({ initialSubTab = "master" }: { initialSubTab?: CustomerHubTab } = {}) {
    const { user } = useAuthStore();
    const [hubTab, setHubTab] = useState<CustomerHubTab>(
        initialSubTab === "analisis" ? "master" : initialSubTab === "pengaturan" ? "garansi" : initialSubTab
    );
    const [onlyMissingPin, setOnlyMissingPin] = useState(false);
    const [serviceFilter, setServiceFilter] = useState<"ALL" | "AR" | "PCO">("ALL");
    const [showReminderSettings, setShowReminderSettings] = useState(false);
    const [customerViewMode, setCustomerViewMode] = useState<'card' | 'table'>('card');
    const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
    const [contractReminderEnabled, setContractReminderEnabled] = useState(true);
    const [reminderDays1, setReminderDays1] = useState(14);
    const [reminderDays2, setReminderDays2] = useState(30);
    const [reminderSaved, setReminderSaved] = useState(false);

    useEffect(() => {
        if (initialSubTab === "analisis") {
            setHubTab("master");
        } else if (initialSubTab === "pengaturan") {
            setHubTab("garansi");
            setShowReminderSettings(true);
        } else {
            setHubTab(initialSubTab);
        }
    }, [initialSubTab]);
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [fieldProjects, setFieldProjects] = useState<any[]>([]);
    const [checklists, setChecklists] = useState<(ControlChecklist & { customerId: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQ, setSearchQ] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<"date" | "name" | "deal" | "area">("date");
    const [filterWarranty, setFilterWarranty] = useState(false);
    const [checklistTarget, setChecklistTarget] = useState<DerivedCustomer | null>(null);
    const [editCustomerTarget, setEditCustomerTarget] = useState<DerivedCustomer | null>(null);
    const [scheduleTarget, setScheduleTarget] = useState<DerivedCustomer | null>(null);
    const [showAddManualModal, setShowAddManualModal] = useState(false);
    const [importPreviewRows, setImportPreviewRows] = useState<ImportRow[] | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);

    const downloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        const wsData = XLSX.utils.aoa_to_sheet([
            [
                "NamaPelanggan", "KontakWA", "AlamatLokasi", "Wilayah", "Kategori",
                "JenisLayanan", "Proyek", "GaransiTahun", "TanggalMulai",
                "NoPH", "NoSPK", "Pestisida", "Marketing", "RiwayatKerjaKontrol", "SumberSheet",
            ],
            [
                "[Contoh] PT Guci Emas Pratama", "0812-3456-7890",
                "Jl. Ganda Sasmita No. 1, Serua, Ciputat, Tangerang Selatan", "Tangerang Selatan",
                "AR", "anti_rayap_injeksi", "Paska Konstruksi (Hapus baris contoh ini sebelum import)",
                3, "2025-01-15", "0101/GP-PCO/PH/I/25", "0050/GP-PCO/KK/I/25",
                "Cypergard 100 EC", "Kantor", "[2025-02-15] Kontrol berkala 1: Tidak ditemukan rayap aktif", "Template",
            ],
        ]);
        const wsGuide = XLSX.utils.aoa_to_sheet([
            ["Nama Kolom", "Wajib?", "Format / Nilai Valid", "Keterangan"],
            ["NamaPelanggan", "Wajib", "Teks", "Nama pemilik / perusahaan pelanggan"],
            ["KontakWA", "Opsional", "Teks nomor HP/Telp", "Nomor WhatsApp atau telepon PIC lokasi"],
            ["AlamatLokasi", "Wajib", "Teks alamat lengkap", "Alamat proyek / rumah tinggal untuk pemetaan wilayah"],
            ["Wilayah", "Opsional", "Teks", "Contoh: Jakarta Selatan, Tangerang Selatan, Bekasi, Bogor"],
            ["Kategori", "Wajib", "AR atau PCO", "AR = Anti Rayap, PCO = Pest Control"],
            ["JenisLayanan", "Opsional", "Kode layanan", "anti_rayap_injeksi, anti_rayap_soil, anti_rayap_baiting, pest_umum, pest_rodent, pest_fogging"],
            ["Proyek", "Opsional", "Teks deskripsi", "Contoh: Paska Konstruksi, Pra Konstruksi, Retreatment"],
            ["GaransiTahun", "Opsional", "Angka bulat (0-10)", "Durasi garansi dalam tahun (isi 0 jika non-garansi)"],
            ["TanggalMulai", "Opsional", "YYYY-MM-DD", "Tanggal mulai/selesai proyek (contoh: 2025-01-15)"],
            ["NoPH", "Opsional", "Teks", "Nomor surat Penawaran Harga (jika ada)"],
            ["NoSPK", "Opsional", "Teks", "Nomor Kontrak Kerja / SPK (jika ada)"],
            ["Pestisida", "Opsional", "Teks", "Nama chemical / pestisida yang diaplikasikan"],
            ["Marketing", "Opsional", "Teks", "Nama surveyor, marketing, atau sumber relasi"],
            ["RiwayatKerjaKontrol", "Opsional", "Teks ringkasan", "Catatan pekerjaan & hasil kontrol berkala (otomatis masuk tab Kontrol)"],
            ["SumberSheet", "Opsional", "Teks", "Penanda asal arsip/sheet data"],
        ]);
        XLSX.utils.book_append_sheet(wb, wsData, "Data_Pelanggan");
        XLSX.utils.book_append_sheet(wb, wsGuide, "Panduan_Kolom");
        XLSX.writeFile(wb, "Template_Bulk_Import_Pelanggan_Fieldwork.xlsx");
    };

    const normalizeExcelDate = (raw: unknown): string => {
        if (!raw) return "";
        if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
            return raw.toISOString().slice(0, 10);
        }
        const s = String(raw).trim();
        if (!s) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
        if (dmy) {
            const yr = dmy[3].length === 2 ? (Number(dmy[3]) >= 70 ? `19${dmy[3]}` : `20${dmy[3]}`) : dmy[3];
            return `${yr}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
        }
        const parsed = new Date(s);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
        return "";
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const wb = XLSX.read(evt.target?.result, { type: "array", cellDates: true });
                const sheetName = wb.SheetNames.includes("Data_Pelanggan")
                    ? "Data_Pelanggan"
                    : wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
                if (data.length === 0) {
                    alert("File kosong atau format tidak sesuai.");
                    return;
                }
                const rows: ImportRow[] = data
                    .map(row => {
                        const nama = String(row["NamaPelanggan"] ?? row["Nama"] ?? "").trim();
                        const katRaw = String(row["Kategori"] ?? row["KategoriProyek"] ?? "AR").trim().toUpperCase();
                        const kategoriProyek: "AR" | "PCO" = katRaw === "PCO" ? "PCO" : "AR";
                        const jenisRaw = String(row["JenisLayanan"] ?? "").trim();
                        const jenisLayanan = jenisRaw || (kategoriProyek === "AR" ? "anti_rayap_injeksi" : "pest_umum");
                        const garansiRaw = Number(row["GaransiTahun"] ?? 0);
                        return {
                            nama,
                            kontak: String(row["KontakWA"] ?? row["Kontak"] ?? "").trim(),
                            alamat: String(row["AlamatLokasi"] ?? row["Alamat"] ?? "").trim(),
                            wilayah: String(row["Wilayah"] ?? "").trim(),
                            kategoriProyek,
                            jenisLayanan,
                            proyek: String(row["Proyek"] ?? (kategoriProyek === "AR" ? "Anti Rayap" : "Pest Control")).trim(),
                            garansiTahun: Number.isFinite(garansiRaw) && garansiRaw >= 0 ? Math.round(garansiRaw) : 0,
                            tanggalMulai: normalizeExcelDate(row["TanggalMulai"]),
                            noPH: String(row["NoPH"] ?? "").trim(),
                            noSPK: String(row["NoSPK"] ?? "").trim(),
                            pestisida: String(row["Pestisida"] ?? "").trim(),
                            marketing: String(row["Marketing"] ?? "").trim(),
                            riwayatKerjaKontrol: String(row["RiwayatKerjaKontrol"] ?? "").trim(),
                            sumberSheet: String(row["SumberSheet"] ?? "").trim(),
                            _status: "ok" as const,
                        };
                    })
                    .filter(r => r.nama && !r.nama.toLowerCase().startsWith("[contoh]"));

                if (rows.length === 0) {
                    alert("Tidak ada baris pelanggan valid yang ditemukan (baris [Contoh] dilewati otomatis).");
                    return;
                }
                setImportPreviewRows(rows);
            } catch (err) {
                alert(`Gagal membaca file: ${err instanceof Error ? err.message : String(err)}`);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleConfirmImport = async (validRows: ImportRow[]) => {
        if (!user?.companyId) return;
        setIsImporting(true);
        const BATCH_SIZE = 100;
        const nowIso = new Date().toISOString();
        let importedCustomers = 0;
        let importedChecklists = 0;

        try {
            // 1. Insert ke public.quotations per batch 100 baris (status = "deal" agar garansi & riwayat tampil)
            for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
                const chunk = validRows.slice(i, i + BATCH_SIZE);
                setImportProgress({
                    current: Math.min(i + chunk.length, validRows.length),
                    total: validRows.length,
                    phase: `Menyimpan data pelanggan (batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validRows.length / BATCH_SIZE)})...`,
                });

                const insertPayload = chunk.map((row, idx) => {
                    const startDateIso = row.tanggalMulai
                        ? new Date(`${row.tanggalMulai}T08:00:00.000Z`).toISOString()
                        : nowIso;
                    const noSurat = row.noPH || row.noSPK || `IMP-${new Date().getFullYear()}-${String(i + idx + 1).padStart(4, "0")}`;
                    const notesParts = [
                        row.noSPK ? `SPK: ${row.noSPK}` : "",
                        row.pestisida ? `Pestisida: ${row.pestisida}` : "",
                        row.sumberSheet ? `Arsip: ${row.sumberSheet}` : "",
                        row.riwayatKerjaKontrol ? `Riwayat: ${row.riwayatKerjaKontrol}` : "",
                    ].filter(Boolean);

                    return {
                        company_id: user.companyId,
                        marketing_uid: user.uid,
                        status: "deal",
                        payload: {
                            noSurat,
                            stage: "OFFICIAL",
                            kepadaNama: row.nama,
                            kepadaWa: row.kontak || undefined,
                            kepadaAlamatLines: row.alamat ? [row.alamat] : [],
                            perihal: row.proyek || (row.kategoriProyek === "AR" ? "Anti Rayap" : "Pest Control"),
                            kategori: row.kategoriProyek,
                            jenisLayanan: row.jenisLayanan || (row.kategoriProyek === "AR" ? "anti_rayap_injeksi" : "pest_umum"),
                            garansiTahun: row.garansiTahun > 0 ? row.garansiTahun : undefined,
                            jenisGaransi: row.garansiTahun > 0
                                ? (row.kategoriProyek === "AR" ? "Garansi Anti Rayap" : "Garansi Layanan")
                                : undefined,
                            tipeKontrak: "ONE_TIME",
                            tanggal: startDateIso,
                            dealAt: startDateIso,
                            marketingNama: row.marketing || user.name || "Arsip Import",
                            marketingUid: user.uid,
                            companyId: user.companyId,
                            status: "deal",
                            notesMarketing: notesParts.join(" | ") || undefined,
                        },
                    };
                });

                const { error } = await supabase.from("quotations").insert(insertPayload);
                if (error) throw error;
                importedCustomers += chunk.length;
            }

            // 2. Insert riwayat kerja / kontrol ke public.customer_checklists per batch 100 baris
            const checklistRows = validRows.filter(r => Boolean(r.riwayatKerjaKontrol.trim()));
            for (let i = 0; i < checklistRows.length; i += BATCH_SIZE) {
                const chunk = checklistRows.slice(i, i + BATCH_SIZE);
                setImportProgress({
                    current: Math.min(i + chunk.length, checklistRows.length),
                    total: checklistRows.length,
                    phase: `Menyimpan riwayat kerja/kontrol (batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(checklistRows.length / BATCH_SIZE)})...`,
                });

                const clPayload = chunk.map((row, idx) => {
                    const custKey = row.nama.trim().toLowerCase().replace(/\s+/g, "_");
                    const dateIso = row.tanggalMulai
                        ? new Date(`${row.tanggalMulai}T08:00:00.000Z`).toISOString()
                        : nowIso;
                    return {
                        id: `imp_cl_${Date.now()}_${i + idx}_${Math.random().toString(36).slice(2, 6)}`,
                        company_id: user.companyId,
                        payload: {
                            customerId: custKey,
                            tanggal: dateIso,
                            teknisi: row.marketing || "Arsip Import",
                            catatan: row.riwayatKerjaKontrol,
                            hasilKontrol: "baik",
                        },
                    };
                });

                const { error: clErr } = await supabase.from("customer_checklists").insert(clPayload);
                if (clErr) {
                    console.warn("[BulkImport] Sebagian riwayat kontrol dilewati:", clErr.message);
                    break;
                }
                importedChecklists += chunk.length;
            }

            setImportPreviewRows(null);
            setImportProgress(null);
            alert(
                `Berhasil mengimpor ${importedCustomers.toLocaleString("id-ID")} data pelanggan` +
                (importedChecklists > 0 ? ` beserta ${importedChecklists.toLocaleString("id-ID")} catatan riwayat kerja/kontrol.` : ".")
            );
            load();
        } catch (err) {
            alert(
                `Import terhenti setelah ${importedCustomers.toLocaleString("id-ID")} pelanggan: ` +
                `${err instanceof Error ? err.message : String(err)}`
            );
        } finally {
            setIsImporting(false);
            setImportProgress(null);
        }
    };

    const debouncedSearch = useDebouncedValue(searchQ, 300);
    const canSeeAll = user?.role !== "MARKETING";

    const load = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Load field projects & work reports + manual customer records
            const [quotesData, projRes, mergedProjects] = await Promise.all([
                getQuotations({
                    companyId: user.companyId,
                    byUid: canSeeAll ? undefined : user.uid,
                }).catch(() => [] as Quotation[]),
                supabase
                    .from("projects")
                    .select("id, client_name, project_name, address, latitude, longitude, service_type, warranty_months, work_date, created_at")
                    .eq("company_id", user.companyId)
                    .order("created_at", { ascending: false })
                    .limit(300),
                fetchMyProjects().catch(() => []),
            ]);
            setQuotations(quotesData);

            const dbRows = projRes.data || [];
            const fallbackRows = mergedProjects.map(mp => ({
                id: mp.id,
                client_name: mp.clientName || mp.projectName,
                project_name: mp.projectName,
                address: mp.address,
                latitude: mp.latitude,
                longitude: mp.longitude,
                service_type: mp.serviceType,
                warranty_months: mp.warrantyMonths,
                work_date: mp.workDate,
                created_at: mp.createdAt,
            }));
            const seenIds = new Set(dbRows.map((r: any) => String(r.id)));
            const combinedProjects = [
                ...dbRows,
                ...fallbackRows.filter(f => !seenIds.has(String(f.id))),
            ];
            setFieldProjects(combinedProjects);
        } catch (err) {
            console.error("[CustomersPage] load projects error:", err);
        }

        // Load checklists separately with pagination (>1000 rows) — don't block quotations if this fails
        try {
            const allCl: (ControlChecklist & { customerId: string })[] = [];
            const CL_PAGE_SIZE = 1000;
            for (let p = 0; p < 10; p++) {
                const { data: clData, error: clErr } = await supabase
                    .from("customer_checklists")
                    .select("id, payload, created_at")
                    .eq("company_id", user.companyId)
                    .range(p * CL_PAGE_SIZE, (p + 1) * CL_PAGE_SIZE - 1);
                if (clErr || !clData || clData.length === 0) break;
                for (const row of clData as any[]) {
                    const x = row.payload || {};
                    const parsedDate = x.tanggal ? new Date(x.tanggal) : new Date(row.created_at || Date.now());
                    allCl.push({
                        id: String(row.id),
                        customerId: String(x.customerId || ""),
                        tanggal: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
                        teknisi: String(x.teknisi || "Tim Lapangan"),
                        catatan: String(x.catatan || ""),
                        hasilKontrol: (x.hasilKontrol as ControlChecklist["hasilKontrol"]) || "baik",
                    });
                }
                if (clData.length < CL_PAGE_SIZE) break;
            }
            setChecklists(allCl);
        } catch {
            setChecklists([]);
        }

        setLoading(false);
    };

    useEffect(() => { load(); }, [user]);

    const customerMap = useMemo(() => {
        const map = new Map<string, DerivedCustomer>();
        const now = new Date();

        quotations.forEach(q => {
            const key = q.kepadaNama.trim().toLowerCase().replace(/\s+/g, "_");
            if (!map.has(key)) {
                const addr0 = q.kepadaAlamatLines?.[0] ?? "";
                map.set(key, {
                    id: key, name: q.kepadaNama,
                    address: addr0,
                    addressFull: q.kepadaAlamatLines ?? [],
                    up: q.kepadaUp, wa: q.kepadaWa ?? "",
                    wilayah: extractWilayah(addr0),
                    latitude: q.latitude,
                    longitude: q.longitude,
                    services: [], totalQuotations: 0, totalDeal: 0,
                    lastServiceDate: null, jasaDigunakan: [],
                    warranties: [], activeWarranty: null, checklists: [],
                });
            }
            const c = map.get(key)!;
            c.totalQuotations++;
            if (!c.latitude && q.latitude) c.latitude = q.latitude;
            if (!c.longitude && q.longitude) c.longitude = q.longitude;

            const jasa = LAYANAN_CONFIG[q.jenisLayanan]?.label.split("—")[1]?.trim() ?? q.jenisLayanan;
            c.services.push({
                noSurat: q.noSurat, kategori: q.kategori,
                jenisLayanan: jasa, tanggal: q.tanggal,
                status: q.status, marketingNama: q.marketingNama,
                garansiTahun: q.garansiTahun, jenisGaransi: q.jenisGaransi,
            });
            if (!c.jasaDigunakan.includes(jasa)) c.jasaDigunakan.push(jasa);

            if (q.status === "deal") {
                c.totalDeal++;
                const dealDate = (q as any).dealAt instanceof Date ? (q as any).dealAt : null;
                if (dealDate && (!c.lastServiceDate || dealDate > c.lastServiceDate)) {
                    c.lastServiceDate = dealDate;
                }
                if (q.garansiTahun && q.garansiTahun > 0 && dealDate) {
                    const expiredAt = new Date(dealDate);
                    expiredAt.setFullYear(expiredAt.getFullYear() + q.garansiTahun);
                    const daysRemaining = Math.ceil((expiredAt.getTime() - now.getTime()) / 86400000);
                    const w: WarrantyInfo = {
                        quotationId: q.id, noSurat: q.noSurat,
                        garansiTahun: q.garansiTahun, jenisGaransi: q.jenisGaransi,
                        dealAt: dealDate, expiredAt,
                        isActive: daysRemaining > 0, daysRemaining: Math.max(0, daysRemaining),
                    };
                    c.warranties.push(w);
                    if (w.isActive && (!c.activeWarranty || w.expiredAt > c.activeWarranty.expiredAt)) {
                        c.activeWarranty = w;
                    }
                }
            }

            if (!c.address && q.kepadaAlamatLines?.[0]) {
                c.address = q.kepadaAlamatLines[0];
                c.addressFull = q.kepadaAlamatLines;
            }
            if (!c.up && q.kepadaUp) c.up = q.kepadaUp;
            if (!c.wa && q.kepadaWa) c.wa = q.kepadaWa;
            // Re-compute wilayah if we now have better address
            if (c.wilayah === "Tidak Diketahui" && c.address) c.wilayah = extractWilayah(c.address);
        });

        const localReports: any[] = [];

        fieldProjects.forEach((p: any) => {
            const cName = String(p.client_name || p.project_name || "").trim();
            if (!cName) return;
            const key = cName.toLowerCase().replace(/\s+/g, "_");
            const isTermite = p.service_type === "TERMITE_CONTROL";
            const svcLabel = isTermite ? "Anti Rayap" : "Pest Control";
            const matchingReports = localReports.filter(
                r => r.projectId === p.id || (r.clientName || "").trim().toLowerCase() === cName.toLowerCase()
            );
            const executorLabel = matchingReports[0]?.executorName || "Tim Teknisi Lapangan";
            const customerPhone = matchingReports.find(r => r.customerPhone)?.customerPhone || "";
            const picName = matchingReports.find(r => r.customerName)?.customerName || undefined;
            const visitDate = p.work_date ? new Date(p.work_date) : p.created_at ? new Date(p.created_at) : new Date();
            const warrantyMonths = Number(p.warranty_months || (isTermite ? 36 : 0));
            const warrantyYears = warrantyMonths >= 12 ? Math.round(warrantyMonths / 12) : 0;

            let warrantyObj: WarrantyInfo | null = null;
            if (warrantyYears > 0) {
                const expiredAt = new Date(visitDate);
                expiredAt.setFullYear(expiredAt.getFullYear() + warrantyYears);
                const daysRemaining = Math.ceil((expiredAt.getTime() - now.getTime()) / 86400000);
                warrantyObj = {
                    quotationId: String(p.id),
                    noSurat: `LKP-${String(p.id).slice(0, 6).toUpperCase()}`,
                    garansiTahun: warrantyYears,
                    jenisGaransi: isTermite ? "Garansi Anti Rayap" : "Garansi Layanan",
                    dealAt: visitDate,
                    expiredAt,
                    isActive: daysRemaining > 0,
                    daysRemaining: Math.max(0, daysRemaining),
                };
            }

            if (!map.has(key)) {
                const addr = String(p.address || "").trim();
                const serviceEntries: ServiceRecord[] = matchingReports.length > 0
                    ? matchingReports.map((rep, idx) => ({
                        noSurat: `LKP-${String(rep.id || p.id).slice(0, 6).toUpperCase()}-${idx + 1}`,
                        kategori: rep.serviceType === "TERMITE_CONTROL" ? "AR" : "PCO",
                        jenisLayanan: rep.serviceType === "TERMITE_CONTROL" ? "Anti Rayap" : "Pest Control",
                        tanggal: rep.checkInAt ? new Date(rep.checkInAt) : visitDate,
                        status: rep.status === "COMPLETED" || rep.status === "REVIEWED" ? "deal" : "pending",
                        marketingNama: rep.executorName || executorLabel,
                        garansiTahun: warrantyYears > 0 ? warrantyYears : undefined,
                        jenisGaransi: isTermite ? "Anti Rayap" : undefined,
                    }))
                    : [{
                        noSurat: `LKP-${String(p.id).slice(0, 6).toUpperCase()}`,
                        kategori: isTermite ? "AR" : "PCO",
                        jenisLayanan: svcLabel,
                        tanggal: visitDate,
                        status: "deal",
                        marketingNama: executorLabel,
                        garansiTahun: warrantyYears > 0 ? warrantyYears : undefined,
                        jenisGaransi: isTermite ? "Anti Rayap" : undefined,
                    }];

                map.set(key, {
                    id: key,
                    name: cName,
                    address: addr,
                    addressFull: addr ? [addr] : [],
                    up: picName,
                    wa: customerPhone,
                    wilayah: extractWilayah(addr),
                    latitude: typeof p.latitude === "number" && p.latitude !== 0 ? p.latitude : undefined,
                    longitude: typeof p.longitude === "number" && p.longitude !== 0 ? p.longitude : undefined,
                    services: serviceEntries,
                    totalQuotations: serviceEntries.length,
                    totalDeal: serviceEntries.length,
                    lastServiceDate: serviceEntries[0]?.tanggal ?? visitDate,
                    jasaDigunakan: [svcLabel],
                    warranties: warrantyObj ? [warrantyObj] : [],
                    activeWarranty: warrantyObj && warrantyObj.isActive ? warrantyObj : null,
                    checklists: [],
                    needsAdminDetails: !picName && !customerPhone,
                });
            } else {
                const existing = map.get(key)!;
                if (!existing.latitude && typeof p.latitude === "number" && p.latitude !== 0) existing.latitude = p.latitude;
                if (!existing.longitude && typeof p.longitude === "number" && p.longitude !== 0) existing.longitude = p.longitude;
                if (!existing.up && picName) existing.up = picName;
                if (!existing.wa && customerPhone) existing.wa = customerPhone;
                if (!existing.jasaDigunakan.includes(svcLabel)) existing.jasaDigunakan.push(svcLabel);
                existing.services.push({
                    noSurat: `LKP-${String(p.id).slice(0, 6).toUpperCase()}`,
                    kategori: isTermite ? "AR" : "PCO",
                    jenisLayanan: svcLabel,
                    tanggal: visitDate,
                    status: "deal",
                    marketingNama: executorLabel,
                    garansiTahun: warrantyYears > 0 ? warrantyYears : undefined,
                });
                existing.totalDeal = existing.services.length;
                existing.totalQuotations = existing.services.length;
                if (warrantyObj && existing.warranties.length === 0) {
                    existing.warranties.push(warrantyObj);
                    if (warrantyObj.isActive) existing.activeWarranty = warrantyObj;
                }
            }
        });

        checklists.forEach(cl => {
            const c = map.get(cl.customerId);
            if (c) c.checklists.push(cl);
        });

        return map;
    }, [quotations, fieldProjects, checklists]);

    const missingPinCustomers = useMemo(
        () => Array.from(customerMap.values()).filter(c => !c.latitude || !c.longitude),
        [customerMap]
    );

    const customers = useMemo(() => {
        let result = Array.from(customerMap.values());
        if (serviceFilter === "AR") {
            result = result.filter(c =>
                c.services.some(s => s.kategori === "AR") ||
                c.jasaDigunakan.some(j => j.toLowerCase().includes("rayap"))
            );
        } else if (serviceFilter === "PCO") {
            result = result.filter(c =>
                c.services.some(s => s.kategori === "PCO") ||
                c.jasaDigunakan.some(j => !j.toLowerCase().includes("rayap"))
            );
        }
        if (filterWarranty) result = result.filter(c => c.activeWarranty?.isActive);
        if (onlyMissingPin) result = result.filter(c => !c.latitude || !c.longitude);
        const s = debouncedSearch.trim().toLowerCase();
        if (s) result = result.filter(c =>
            c.name.toLowerCase().includes(s) ||
            c.address.toLowerCase().includes(s) ||
            c.wilayah.toLowerCase().includes(s) ||
            c.jasaDigunakan.some(j => j.toLowerCase().includes(s))
        );
        result.sort((a, b) =>
            sortBy === "name" ? a.name.localeCompare(b.name)
            : sortBy === "deal" ? b.totalDeal - a.totalDeal
            : sortBy === "area" ? a.wilayah.localeCompare(b.wilayah)
            : (b.services[0]?.tanggal?.getTime() ?? 0) - (a.services[0]?.tanggal?.getTime() ?? 0)
        );
        return result;
    }, [customerMap, serviceFilter, filterWarranty, onlyMissingPin, debouncedSearch, sortBy]);
    const pagedCustomers = useMemo(
        () => customers.slice((page - 1) * pageSize, page * pageSize),
        [customers, page, pageSize],
    );
    const customerTotalPages = Math.max(1, Math.ceil(customers.length / pageSize));
    useEffect(() => {
        if (page > customerTotalPages) setPage(customerTotalPages);
    }, [page, customerTotalPages]);

    const { totalCustomers, activeWarranties, expiringWarranties, arCustomerCount, pcoCustomerCount, pinnedCustomerCount } = useMemo(() => {
        const allCustomers = Array.from(customerMap.values());
        return {
            totalCustomers: customerMap.size,
            activeWarranties: allCustomers.filter(c => c.activeWarranty?.isActive).length,
            expiringWarranties: allCustomers.filter(c => c.activeWarranty?.isActive && c.activeWarranty.daysRemaining <= 90).length,
            arCustomerCount: allCustomers.filter(c =>
                c.services.some(s => s.kategori === "AR") ||
                c.jasaDigunakan.some(j => j.toLowerCase().includes("rayap"))
            ).length,
            pcoCustomerCount: allCustomers.filter(c =>
                c.services.some(s => s.kategori === "PCO") ||
                c.jasaDigunakan.some(j => !j.toLowerCase().includes("rayap"))
            ).length,
            pinnedCustomerCount: allCustomers.filter(c => Boolean(c.latitude && c.longitude)).length,
        };
    }, [customerMap]);

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">
                        Data Pelanggan
                    </h1>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Kelola daftar pelanggan, titik koordinat lokasi, dan masa berlaku garansi layanan.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {user?.role !== "MARKETING" && (
                        <button
                            type="button"
                            onClick={() => setShowAddManualModal(true)}
                            className="h-9 px-3.5 text-xs font-semibold bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors cursor-pointer shadow-2xs"
                        >
                            Tambah Pelanggan
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            const rows = customers.map((c, idx) => ({
                                Kode: `CUST-${String(idx + 1).padStart(4, "0")}`,
                                Nama_Pelanggan: c.name,
                                Wilayah: c.wilayah,
                                Alamat: c.address,
                                PIC: c.up || "-",
                                WhatsApp: c.wa || "-",
                                Total_Kunjungan: c.services.length,
                                Layanan: c.jasaDigunakan.join(", ") || "-",
                                Status_Garansi: c.activeWarranty?.isActive ? `Aktif (${c.activeWarranty.daysRemaining} hari)` : "Tidak Ada",
                                Koordinat: c.latitude && c.longitude ? `${c.latitude}, ${c.longitude}` : "Belum Ada Pin",
                            }));
                            const ws = XLSX.utils.json_to_sheet(rows);
                            const wb = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(wb, ws, "Data_Pelanggan");
                            XLSX.writeFile(wb, "Daftar_Pelanggan_Guci_Emas.xlsx");
                        }}
                        className="h-9 px-3 text-xs font-semibold bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                    >
                        Unduh Excel ({customers.length})
                    </button>
                    <button
                        type="button"
                        onClick={downloadTemplate}
                        className="h-9 px-3 text-xs font-semibold bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                    >
                        Contoh Format Excel
                    </button>
                    <label className="inline-flex items-center h-9 px-3 text-xs font-semibold bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors">
                        Impor Excel
                        <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileSelect} />
                    </label>
                </div>
            </div>

            {/* ── Sub-Tab Navigasi Pelanggan (2 Tab Fokus & Tidak Membingungkan) ── */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--bg-card)] p-1.5 rounded-xl border border-[var(--border-subtle)]">
                <div className="flex flex-wrap items-center gap-1.5">
                    {([
                        { id: "master", label: `Daftar & Lokasi Pelanggan (${totalCustomers})` },
                        { id: "garansi", label: `Jadwal Kontrol & Garansi (${activeWarranties})` },
                    ] as const).map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setHubTab(t.id)}
                            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                hubTab === t.id
                                    ? "bg-[var(--accent)] text-white shadow-2xs"
                                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {hubTab === "garansi" && (
                    <button
                        type="button"
                        onClick={() => setShowReminderSettings(v => !v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                            showReminderSettings
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                    >
                        Pengaturan Pengingat ({contractReminderEnabled ? `Aktif: H-${reminderDays2} & H-${reminderDays1}` : "Nonaktif"})
                    </button>
                )}
            </div>

            {hubTab === "garansi" && (
                <div className="space-y-4">
                    {showReminderSettings && (
                        <div className="clean-card p-4 sm:p-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                                        Pengaturan Pengingat Jadwal Kontrol &amp; Garansi
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                        Tampilkan pengingat otomatis sebelum jadwal kunjungan berkala Pest Control atau masa garansi Anti Rayap berakhir.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setContractReminderEnabled(v => !v)}
                                    className={`self-start sm:self-auto px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                                        contractReminderEnabled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
                                    }`}
                                >
                                    {contractReminderEnabled ? "Status: Aktif" : "Status: Nonaktif"}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                                    <label className="block text-xs font-bold text-[var(--text-primary)]">Pengingat Pertama</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={reminderDays2}
                                            onChange={e => setReminderDays2(Number(e.target.value))}
                                            className="w-20 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-sm font-mono font-bold"
                                        />
                                        <span className="text-xs text-[var(--text-secondary)]">hari sebelum jadwal berakhir</span>
                                    </div>
                                </div>

                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                                    <label className="block text-xs font-bold text-[var(--text-primary)]">Pengingat Kedua (Mendesak)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={reminderDays1}
                                            onChange={e => setReminderDays1(Number(e.target.value))}
                                            className="w-20 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-sm font-mono font-bold"
                                        />
                                        <span className="text-xs text-[var(--text-secondary)]">hari sebelum jadwal berakhir</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3">
                                {reminderSaved && (
                                    <span className="text-xs font-bold text-emerald-600">Pengaturan pengingat kontrol tersimpan.</span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setReminderSaved(true);
                                        setTimeout(() => setReminderSaved(false), 2500);
                                    }}
                                    className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold cursor-pointer"
                                >
                                    Simpan Pengaturan
                                </button>
                            </div>
                        </div>
                    )}

                    <KontrolRayapPage />
                </div>
            )}

            {hubTab === "master" && (
            <>

            {/* ── 3 Kartu Ringkasan dengan Aksen Warna Semantik yang Nyaman di Mata ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="clean-card bg-[var(--bg-card)] border border-[var(--border-subtle)] border-l-4 border-l-sky-500 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Total Pelanggan &amp; Lokasi
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200/70 text-[10px] font-semibold">
                            {pinnedCustomerCount}/{totalCustomers} Pin GPS
                        </span>
                    </div>
                    <p className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">{totalCustomers}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {missingPinCustomers.length === 0
                            ? "Seluruh lokasi kerja sudah memiliki koordinat GPS"
                            : `${missingPinCustomers.length} pelanggan belum memiliki titik GPS`}
                    </p>
                </div>

                <div className="clean-card bg-[var(--bg-card)] border border-[var(--border-subtle)] border-l-4 border-l-amber-500 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Cakupan Layanan
                        </span>
                        <div className="flex items-center gap-1">
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 text-[10px] font-semibold">
                                {arCustomerCount} Anti Rayap
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200/80 text-[10px] font-semibold">
                                {pcoCustomerCount} Pest Control
                            </span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">
                        {arCustomerCount + pcoCustomerCount}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Riwayat pengerjaan Anti Rayap &amp; Pest Control
                    </p>
                </div>

                <div className="clean-card bg-[var(--bg-card)] border border-[var(--border-subtle)] border-l-4 border-l-emerald-500 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Garansi &amp; Kontrol Aktif
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/70 text-[10px] font-semibold">
                            Terpantau
                        </span>
                    </div>
                    <p className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">{activeWarranties}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {expiringWarranties > 0 ? `${expiringWarranties} mendekati jadwal kontrol` : "Masa garansi berjalan normal"}
                    </p>
                </div>
            </div>

            {expiringWarranties > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-amber-800">Garansi akan segera habis</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                            {expiringWarranties} pelanggan memiliki garansi yang akan habis dalam 90 hari.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Search bar — full width ── */}
            <div className="flex items-center gap-2 w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-emerald-100 focus-within:border-emerald-400 transition-all">
                <Search size={16} className="text-slate-400 shrink-0" />
                <input
                    className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
                    placeholder="Cari nama pelanggan, alamat lokasi, wilayah, atau layanan..."
                    value={searchQ}
                    onChange={e => { setSearchQ(e.target.value); setPage(1); }}
                    autoComplete="off"
                />
                {searchQ && (
                    <button onClick={() => { setSearchQ(""); setPage(1); }} className="text-slate-400 hover:text-slate-600 shrink-0 p-0.5 rounded">
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* ── Filter chips row dengan Aksen Layanan (Warm Amber untuk Anti Rayap, Calm Sky untuk Pest Control) ── */}
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={() => { setServiceFilter("ALL"); setPage(1); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        serviceFilter === "ALL"
                            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                >
                    Semua Layanan ({totalCustomers})
                </button>

                <button
                    type="button"
                    onClick={() => { setServiceFilter(v => v === "AR" ? "ALL" : "AR"); setPage(1); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        serviceFilter === "AR"
                            ? "bg-amber-600 text-white border-amber-600"
                            : "bg-amber-50/70 text-amber-800 border-amber-200 hover:bg-amber-100/70"
                    }`}
                >
                    Anti Rayap ({arCustomerCount})
                </button>

                <button
                    type="button"
                    onClick={() => { setServiceFilter(v => v === "PCO" ? "ALL" : "PCO"); setPage(1); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        serviceFilter === "PCO"
                            ? "bg-sky-600 text-white border-sky-600"
                            : "bg-sky-50/70 text-sky-800 border-sky-200 hover:bg-sky-100/70"
                    }`}
                >
                    Pest Control ({pcoCustomerCount})
                </button>

                <span className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:inline-block" />

                <button
                    onClick={() => { setFilterWarranty(v => !v); setPage(1); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        filterWarranty
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}>
                    Bergaransi ({activeWarranties})
                </button>

                {missingPinCustomers.length > 0 && (
                    <button
                        onClick={() => { setOnlyMissingPin(v => !v); setPage(1); }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                            onlyMissingPin
                                ? "bg-amber-600 text-white border-amber-600"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}>
                        Belum Ada Pin GPS ({missingPinCustomers.length})
                    </button>
                )}

                <select
                    value={sortBy}
                    onChange={e => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-100">
                    <option value="date">Terbaru</option>
                    <option value="deal">Terbanyak Kunjungan</option>
                    <option value="name">Nama A-Z</option>
                    <option value="area">Per Wilayah</option>
                </select>

                <button
                    onClick={load}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer">
                    {loading ? "Memuat..." : "Muat Ulang"}
                </button>

                {(searchQ || serviceFilter !== "ALL" || filterWarranty || onlyMissingPin) && (
                    <button
                        onClick={() => { setSearchQ(""); setServiceFilter("ALL"); setFilterWarranty(false); setOnlyMissingPin(false); setPage(1); }}
                        className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition-colors cursor-pointer">
                        Reset Filter
                    </button>
                )}

                {/* View Mode Toggle: Card View vs Table View */}
                <div className="ml-auto flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setCustomerViewMode("card")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                            customerViewMode === "card"
                                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                : "bg-white text-slate-600 border-slate-200"
                        }`}
                    >
                        Kartu Ringkas
                    </button>
                    <button
                        type="button"
                        onClick={() => setCustomerViewMode("table")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                            customerViewMode === "table"
                                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                : "bg-white text-slate-600 border-slate-200"
                        }`}
                    >
                        Tampilan Tabel
                    </button>
                    <span className="text-xs text-slate-400 font-medium ml-1">
                        {loading ? "..." : `${customers.length} pelanggan`}
                    </span>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader2 size={24} className="animate-spin mr-2" /> Memuat data pelanggan...
                </div>
            ) : customers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
                    <p className="font-medium text-slate-500">
                        {debouncedSearch || filterWarranty ? "Pelanggan tidak ditemukan" : "Belum ada data pelanggan"}
                    </p>
                    <p className="text-sm mt-1">
                        {debouncedSearch || filterWarranty
                            ? "Coba ubah kata kunci pencarian atau filter."
                            : "Tambahkan pelanggan baru atau impor dari Excel untuk lokasi pelaporan kerja."}
                    </p>
                </div>
            ) : (
                <div className="space-y-3 result-enter" key={page}>
                    {customerViewMode === "table" ? (
                        <div className="clean-card overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse min-w-[860px]">
                                <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[10.5px] font-bold uppercase text-[var(--text-muted)]">
                                    <tr>
                                        <th className="py-3 px-3.5">Kode</th>
                                        <th className="py-3 px-3.5">Nama Pelanggan</th>
                                        <th className="py-3 px-3.5">Wilayah</th>
                                        <th className="py-3 px-3.5">PIC &amp; WhatsApp</th>
                                        <th className="py-3 px-3.5 text-center">Total Kunjungan</th>
                                        <th className="py-3 px-3.5">Garansi Layanan</th>
                                        <th className="py-3 px-3.5">Pin Peta</th>
                                        <th className="py-3 px-3.5 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-subtle)]">
                                    {pagedCustomers.map((c, idx) => {
                                        const code = `CUST-${String((page - 1) * pageSize + idx + 1).padStart(4, "0")}`;
                                        return (
                                            <tr key={c.id} className="hover:bg-[var(--bg-tertiary)]/50">
                                                <td className="py-3 px-3.5 whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            navigator.clipboard?.writeText(code);
                                                            setCopiedCodeId(c.id);
                                                            setTimeout(() => setCopiedCodeId(null), 1500);
                                                        }}
                                                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono font-bold text-[11px] cursor-pointer"
                                                        title="Klik untuk salin kode pelanggan"
                                                    >
                                                        {copiedCodeId === c.id ? "✓ Tersalin" : code}
                                                    </button>
                                                </td>
                                                <td className="py-3 px-3.5">
                                                    <p className="font-bold text-[var(--text-primary)]">{c.name}</p>
                                                    <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[220px]">{c.address}</p>
                                                </td>
                                                <td className="py-3 px-3.5 font-semibold text-[var(--text-secondary)]">{c.wilayah}</td>
                                                <td className="py-3 px-3.5">
                                                    <p className="font-medium text-[var(--text-primary)]">{c.up || "-"}</p>
                                                    <p className="font-mono text-[11px] text-[var(--text-muted)]">{c.wa || "-"}</p>
                                                </td>
                                                <td className="py-3 px-3.5 text-center font-mono font-bold text-emerald-700">
                                                    {c.services.length} Kunjungan
                                                </td>
                                                <td className="py-3 px-3.5">
                                                    {c.activeWarranty?.isActive ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10.5px]">
                                                            Aktif ({c.activeWarranty.daysRemaining}h)
                                                        </span>
                                                    ) : (
                                                        <span className="text-[var(--text-muted)]">-</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-3.5">
                                                    {c.latitude && c.longitude ? (
                                                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10.5px] font-semibold">
                                                            Terkunci
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[10.5px]">
                                                            Belum Ada Pin
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => setScheduleTarget(c)}
                                                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] cursor-pointer"
                                                        >
                                                            Jadwalkan
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditCustomerTarget(c)}
                                                            className="px-2.5 py-1 rounded-lg bg-[var(--accent)] text-white font-bold text-[11px] cursor-pointer"
                                                        >
                                                            Atur Lokasi
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        pagedCustomers.map((c, idx) => (
                            <CustomerCard
                                key={c.id}
                                customer={c}
                                indexNumber={(page - 1) * pageSize + idx + 1}
                                expanded={expandedId === c.id}
                                onToggle={() => setExpandedId(prev => prev === c.id ? null : c.id)}
                                onAddChecklist={() => setChecklistTarget(c)}
                                onEditProfile={() => setEditCustomerTarget(c)}
                                onScheduleTechnician={() => setScheduleTarget(c)}
                            />
                        ))
                    )}

                    {/* ── Bar Pagination Lengkap & Nyaman ── */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--text-secondary)]">
                            <span>
                                Menampilkan{" "}
                                <strong className="font-mono text-[var(--text-primary)]">
                                    {customers.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, customers.length)}
                                </strong>{" "}
                                dari <strong className="font-mono text-[var(--text-primary)]">{customers.length}</strong> pelanggan
                            </span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[var(--text-muted)]">· Tampilkan:</span>
                                <select
                                    value={pageSize}
                                    onChange={e => {
                                        setPageSize(Number(e.target.value));
                                        setPage(1);
                                    }}
                                    className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none cursor-pointer"
                                >
                                    <option value={10}>10 / halaman</option>
                                    <option value={20}>20 / halaman</option>
                                    <option value={50}>50 / halaman</option>
                                    <option value={100}>100 / halaman</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-center sm:justify-end gap-1.5">
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-white hover:bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer transition-colors"
                            >
                                Sebelumnya
                            </button>

                            <div className="flex items-center gap-1">
                                {(() => {
                                    const pages: (number | "...")[] = [];
                                    if (customerTotalPages <= 7) {
                                        for (let i = 1; i <= customerTotalPages; i++) pages.push(i);
                                    } else {
                                        pages.push(1);
                                        if (page > 3) pages.push("...");
                                        const start = Math.max(2, page - 1);
                                        const end = Math.min(customerTotalPages - 1, page + 1);
                                        for (let i = start; i <= end; i++) pages.push(i);
                                        if (page < customerTotalPages - 2) pages.push("...");
                                        pages.push(customerTotalPages);
                                    }
                                    return pages.map((pItem, idx) =>
                                        pItem === "..." ? (
                                            <span key={`el-${idx}`} className="px-1.5 text-xs text-slate-400">…</span>
                                        ) : (
                                            <button
                                                key={pItem}
                                                type="button"
                                                onClick={() => setPage(pItem)}
                                                className={`min-w-8 h-8 px-2 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                                                    pItem === page
                                                        ? "bg-[var(--accent)] text-white shadow-2xs"
                                                        : "bg-white border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                                                }`}
                                            >
                                                {pItem}
                                            </button>
                                        )
                                    );
                                })()}
                            </div>

                            <button
                                type="button"
                                onClick={() => setPage(p => Math.min(customerTotalPages, p + 1))}
                                disabled={page >= customerTotalPages}
                                className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-white hover:bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer transition-colors"
                            >
                                Berikutnya
                            </button>
                        </div>
                    </div>
                </div>
            )}

            </>
            )}

            {checklistTarget && (
                <ChecklistModal customer={checklistTarget}
                    onClose={() => setChecklistTarget(null)}
                    onSaved={entry => {
                        setChecklists(prev => [...prev, { ...entry, customerId: checklistTarget.id }]);
                        setChecklistTarget(null);
                    }} />
            )}

            {showAddManualModal && user?.companyId && (
                <ManualCustomerModal
                    companyId={user.companyId}
                    marketingUid={user.uid}
                    marketingNama={user.name}
                    onClose={() => setShowAddManualModal(false)}
                    onSaved={() => {
                        load();
                    }}
                />
            )}

            {editCustomerTarget && user?.companyId && (
                <EditCustomerProfileModal
                    customer={editCustomerTarget}
                    companyId={user.companyId}
                    onClose={() => setEditCustomerTarget(null)}
                    onSaved={() => {
                        load();
                    }}
                />
            )}

            {scheduleTarget && (
                <ScheduleToTechnicianModal
                    customer={scheduleTarget}
                    onClose={() => setScheduleTarget(null)}
                    onScheduled={() => {
                        load();
                    }}
                />
            )}

            {importPreviewRows && (
                <BulkImportPreviewModal
                    rows={importPreviewRows}
                    existingNames={new Set(Array.from(customerMap.keys()))}
                    onConfirm={handleConfirmImport}
                    onClose={() => setImportPreviewRows(null)}
                    importing={isImporting}
                    progress={importProgress}
                />
            )}
        </div>
    );
}