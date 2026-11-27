import { useState, useEffect, useRef } from "react";
import {
    Settings, Building2, Phone, Mail, Globe,
    Hash, FileSignature, Save, Loader2,
    CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
    MapPin, RefreshCw, Palette, Upload, ImageOff,
    Eye, RotateCcw,
} from "lucide-react";
import { useAuthStore } from '@/app/store/authStore';
import { getCompanySettings, saveCompanySettings, TEMPLATE_DEFAULTS } from '@/shared/api/settingsService';
import type { CompanySettings, TemplateConfig } from '@/shared/api/settingsService';
import { fmtDateID } from '@/shared/lib/quotationConfig';

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function Field({
    label, hint, required, children,
}: {
    label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
            {hint && <p className="text-[11px] text-slate-400 italic">{hint}</p>}
        </div>
    );
}

const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-slate-800";

interface SectionProps {
    title: string;
    icon: React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

function Section({ title, icon, defaultOpen = true, children }: SectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
            >
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-blue-600">{icon}</span>
                    {title}
                </h2>
                {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </button>
            {open && (
                <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-4">
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── TEMPLATE PREVIEW ─────────────────────────────────────────────────────────

function TemplatePreview({
    tpl,
    company,
}: {
    tpl: TemplateConfig;
    company: { name: string; tagline: string; head: string; branch: string; telp: string; wa: string; email: string; website: string };
}) {
    const primary  = tpl.primaryColor || "#1a5c38";
    const tagline  = tpl.customTaglineText || company.tagline || "Jasa Anti Rayap & Pengendalian Hama Profesional · Est. 1985";

    return (
        <div className="bg-slate-100 rounded-xl p-3 flex items-center justify-center">
            {/* Scaled A4 preview */}
            <div
                style={{ width: 340, fontSize: 0, userSelect: "none" }}
                className="rounded-lg shadow-xl overflow-hidden bg-white border border-slate-200"
            >
                {/* ── HEADER KOP SURAT ── */}
                <div style={{ padding: "10px 14px 0 14px" }}>
                    {/* Top colored bar */}
                    <div style={{ height: 4, background: primary, borderRadius: 2, marginBottom: 6 }} />

                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        {/* Left: logo (if position=left) */}
                        {tpl.logoBase64 && tpl.logoPosition === "left" && (
                            <img
                                src={tpl.logoBase64}
                                alt="Logo"
                                style={{
                                    width: Math.round((tpl.logoWidthMm / 210) * 340 * 0.85),
                                    maxHeight: 36,
                                    objectFit: "contain",
                                    flexShrink: 0,
                                    marginTop: 2,
                                }}
                            />
                        )}

                        {/* Company info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: primary, letterSpacing: 0.3, lineHeight: 1.2 }}>
                                {company.name || "NAMA PERUSAHAAN"}
                            </div>
                            {tpl.showTagline && (
                                <div style={{ fontSize: 6.5, color: "#666", marginTop: 2 }}>
                                    {tagline}
                                </div>
                            )}
                            {/* Separator */}
                            <div style={{ height: 0.5, background: primary, margin: "5px 0 4px 0", opacity: 0.6 }} />
                            <div style={{ fontSize: 5.5, color: "#555", lineHeight: 1.6 }}>
                                <span>Head Office : {company.head || "Alamat kantor pusat"}</span>
                                <br />
                                <span>Telp : {company.telp || "-"}  |  WA : {company.wa || "-"}  |  {company.email || "-"}  |  {company.website || "-"}</span>
                                {tpl.showBranch && company.branch && (
                                    <>
                                        <br />
                                        <span>Branch Office : {company.branch}</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Right: logo (if position=right) */}
                        {tpl.logoBase64 && tpl.logoPosition === "right" && (
                            <img
                                src={tpl.logoBase64}
                                alt="Logo"
                                style={{
                                    width: Math.round((tpl.logoWidthMm / 210) * 340 * 0.85),
                                    maxHeight: 40,
                                    objectFit: "contain",
                                    flexShrink: 0,
                                    marginTop: 2,
                                }}
                            />
                        )}
                    </div>
                </div>

                {/* ── CONTENT PLACEHOLDER ── */}
                <div style={{ padding: "10px 14px", borderTop: "none" }}>
                    {/* Mimics document body */}
                    {[80, 60, 90, 50, 70, 45, 85, 60, 55, 75, 65].map((w, i) => (
                        <div key={i} style={{
                            height: 4,
                            width: `${w}%`,
                            background: i === 0 ? "#cbd5e1" : "#e2e8f0",
                            borderRadius: 2,
                            marginBottom: 5,
                            marginLeft: i === 0 ? "auto" : 0,
                            marginRight: i === 0 ? "auto" : 0,
                        }} />
                    ))}

                    {/* Simulated table */}
                    <div style={{ border: "0.5px solid #e2e8f0", borderRadius: 4, overflow: "hidden", marginTop: 6, marginBottom: 6 }}>
                        <div style={{ display: "flex", background: primary, padding: "3px 5px" }}>
                            {["No", "Pekerjaan", "Vol", "Harga", "Jumlah"].map(col => (
                                <div key={col} style={{ flex: col === "Pekerjaan" ? 2 : 1, fontSize: 5, color: "white", fontWeight: 700 }}>{col}</div>
                            ))}
                        </div>
                        {[1, 2, 3].map(row => (
                            <div key={row} style={{ display: "flex", padding: "3px 5px", background: row % 2 === 0 ? "#f0f7f3" : "white", borderTop: "0.5px solid #e2e8f0" }}>
                                {[1, 2, 1, 1, 1].map((flex, i) => (
                                    <div key={i} style={{ flex, height: 3, background: "#e2e8f0", borderRadius: 2, marginRight: 3 }} />
                                ))}
                            </div>
                        ))}
                    </div>

                    {[60, 40].map((w, i) => (
                        <div key={i} style={{ height: 4, width: `${w}%`, background: "#e2e8f0", borderRadius: 2, marginBottom: 5, marginLeft: "auto" }} />
                    ))}
                </div>

                {/* ── FOOTER ── */}
                <div style={{ borderTop: `1.5px solid ${primary}`, padding: "6px 14px 10px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <div style={{ fontSize: 6, fontWeight: 700, color: primary, marginBottom: 2 }}>
                                {company.name || "NAMA PERUSAHAAN"}
                            </div>
                            <div style={{ fontSize: 5, color: "#555", lineHeight: 1.6 }}>
                                <span>Head Office : {company.head || "Alamat kantor pusat"}</span>
                                <br />
                                <span>Telp : {company.telp || "-"}  |  WA : {company.wa || "-"}  |  {company.email || "-"}</span>
                                {tpl.showBranch && company.branch && (
                                    <>
                                        <br />
                                        <span>Branch : {company.branch}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        {tpl.showPageNumber && (
                            <div style={{ fontSize: 6, color: "#aaa", fontWeight: 700, marginLeft: 8, marginTop: 2, whiteSpace: "nowrap" }}>
                                Hal. 1
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── TEMPLATE EDITOR SECTION CONTENT ─────────────────────────────────────────

function TemplateEditorSection({
    tpl,
    company,
    onChange,
}: {
    tpl: TemplateConfig;
    company: { name: string; tagline: string; head: string; branch: string; telp: string; wa: string; email: string; website: string };
    onChange: (updated: TemplateConfig) => void;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [logoError, setLogoError] = useState("");

    const set = <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) => {
        onChange({ ...tpl, [key]: value });
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Max 300KB
        if (file.size > 300 * 1024) {
            setLogoError("Ukuran file terlalu besar. Maks 300 KB.");
            return;
        }
        setLogoError("");

        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            // Calculate natural dimensions for PDF rendering
            const img = new Image();
            img.onload = () => {
                const aspectRatio = img.naturalHeight / img.naturalWidth;
                const heightMm    = Math.round(tpl.logoWidthMm * aspectRatio * 10) / 10;
                onChange({ ...tpl, logoBase64: base64, logoHeightMm: heightMm });
            };
            img.src = base64;
        };
        reader.readAsDataURL(file);
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const removeLogo = () => {
        onChange({ ...tpl, logoBase64: "", logoWidthMm: 40, logoHeightMm: 15 });
        setLogoError("");
    };

    const handleWidthChange = (widthMm: number) => {
        if (!tpl.logoBase64) { set("logoWidthMm", widthMm); return; }
        // Recalculate height from aspect ratio
        const img = new Image();
        img.onload = () => {
            const aspectRatio = img.naturalHeight / img.naturalWidth;
            onChange({ ...tpl, logoWidthMm: widthMm, logoHeightMm: Math.round(widthMm * aspectRatio * 10) / 10 });
        };
        img.src = tpl.logoBase64;
    };

    const Toggle = ({ value, onToggle, label }: { value: boolean; onToggle: () => void; label: string }) => (
        <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
                onClick={onToggle}
                className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${value ? "bg-blue-600" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${value ? "translate-x-4" : ""}`} />
            </div>
            <span className="text-sm text-slate-700">{label}</span>
        </label>
    );

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* ── LEFT: Controls ────────────────────────────────────────── */}
                <div className="space-y-5">

                    {/* Warna Utama */}
                    <div className="space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Warna Utama Dokumen</p>
                        <div className="flex items-center gap-3">
                            <label className="relative cursor-pointer">
                                <input
                                    type="color"
                                    value={tpl.primaryColor}
                                    onChange={e => set("primaryColor", e.target.value)}
                                    className="w-10 h-10 rounded-xl border-2 border-slate-200 cursor-pointer p-0.5"
                                    style={{ padding: 2 }}
                                />
                            </label>
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={tpl.primaryColor}
                                    onChange={e => {
                                        const v = e.target.value;
                                        if (/^#([0-9a-fA-F]{0,6})$/.test(v)) set("primaryColor", v);
                                    }}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    placeholder="#1a5c38"
                                    maxLength={7}
                                />
                            </div>
                            <button
                                onClick={() => set("primaryColor", TEMPLATE_DEFAULTS.primaryColor)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Reset ke warna default">
                                <RotateCcw size={14} />
                            </button>
                        </div>
                        {/* Preset colors */}
                        <div className="flex flex-wrap gap-2">
                            {["#1a5c38", "#1e40af", "#7c3aed", "#b91c1c", "#92400e", "#374151"].map(c => (
                                <button key={c} onClick={() => set("primaryColor", c)}
                                    title={c}
                                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${tpl.primaryColor === c ? "border-blue-500 scale-110" : "border-white shadow-sm"}`}
                                    style={{ background: c }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Logo */}
                    <div className="space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Logo Perusahaan</p>

                        {tpl.logoBase64 ? (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <img src={tpl.logoBase64} alt="Logo" className="h-10 w-auto object-contain rounded" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-700">Logo terpasang ✓</p>
                                    <p className="text-[10px] text-slate-400">{tpl.logoWidthMm} mm × {tpl.logoHeightMm} mm (PDF)</p>
                                </div>
                                <button onClick={removeLogo}
                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                    <ImageOff size={14} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full flex flex-col items-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-slate-500 hover:text-blue-600">
                                <Upload size={20} />
                                <span className="text-xs font-medium">Upload Logo (JPG/PNG, maks 300 KB)</span>
                            </button>
                        )}

                        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                            className="hidden" onChange={handleLogoUpload} />

                        {logoError && <p className="text-xs text-red-600">{logoError}</p>}

                        {tpl.logoBase64 && (
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Lebar Logo (mm)">
                                    <input type="number" min={15} max={80} step={1}
                                        value={tpl.logoWidthMm}
                                        onChange={e => handleWidthChange(Number(e.target.value))}
                                        className={inputCls}
                                    />
                                </Field>
                                <Field label="Posisi Logo">
                                    <select
                                        value={tpl.logoPosition}
                                        onChange={e => set("logoPosition", e.target.value as "left" | "right")}
                                        className={inputCls}>
                                        <option value="right">Kanan</option>
                                        <option value="left">Kiri</option>
                                    </select>
                                </Field>
                            </div>
                        )}

                        {!tpl.logoBase64 && (
                            <button onClick={() => fileInputRef.current?.click()}
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                <Upload size={11} /> Pilih file logo
                            </button>
                        )}
                    </div>

                    {/* Tagline kustom */}
                    <Field label="Tagline Kustom" hint="Kosongkan untuk menggunakan tagline dari Identitas Perusahaan">
                        <input className={inputCls}
                            value={tpl.customTaglineText}
                            onChange={e => set("customTaglineText", e.target.value)}
                            placeholder="Jasa Anti Rayap & Pest Control Profesional" />
                    </Field>

                    {/* Toggles */}
                    <div className="space-y-3 pt-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tampilkan di Dokumen</p>
                        <Toggle value={tpl.showTagline} onToggle={() => set("showTagline", !tpl.showTagline)} label="Tagline di header" />
                        <Toggle value={tpl.showBranch}  onToggle={() => set("showBranch",  !tpl.showBranch)}  label="Branch Office di header & footer" />
                        <Toggle value={tpl.showPageNumber} onToggle={() => set("showPageNumber", !tpl.showPageNumber)} label="Nomor halaman di footer" />
                    </div>
                </div>

                {/* ── RIGHT: Live Preview ────────────────────────────────────── */}
                <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                        <Eye size={11} /> Live Preview Dokumen
                    </p>
                    <TemplatePreview tpl={tpl} company={company} />
                    <p className="text-[10px] text-slate-400 text-center italic">Preview proporsional — tidak identik 1:1 dengan PDF</p>
                </div>
            </div>

            {/* Info note */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
                <span className="shrink-0 mt-0.5">💡</span>
                <span>Perubahan template akan langsung berlaku pada PDF quotation berikutnya yang di-generate. PDF yang sudah dibuat tidak berubah.</span>
            </div>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export function SettingsPage() {
    const { user } = useAuthStore();
    const [loading, setLoading]   = useState(true);
    const [saving, setSaving]     = useState(false);
    const [msg, setMsg]           = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [form, setForm] = useState<Omit<CompanySettings, "updatedAt" | "updatedBy">>({
        companyName:    "",
        companyTagline: "",
        headOffice:     "",
        branchOffice:   "",
        telp:           "",
        wa:             "",
        email:          "",
        website:        "",
        nomorPrefix:    "GP",
        ttdNama:        "",
        ttdJabatan:     "",
        template:       { ...TEMPLATE_DEFAULTS },
    });
    const [lastUpdated, setLastUpdated] = useState<Date | undefined>();

    const set = (field: keyof typeof form) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setForm(prev => ({ ...prev, [field]: e.target.value }));

    const load = async () => {
        if (!user?.companyId) return;
        setLoading(true);
        try {
            const data = await getCompanySettings(user.companyId);
            const { updatedAt, ...rest } = data;
            setForm(rest as typeof form);
            setLastUpdated(updatedAt);
        } catch {
            setMsg({ type: "error", text: "Gagal memuat pengaturan." });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [user?.companyId]);

    const handleSave = async () => {
        if (!user?.companyId) return;
        setSaving(true);
        setMsg(null);
        try {
            await saveCompanySettings(user.companyId, form, user.uid);
            setMsg({ type: "success", text: "Pengaturan berhasil disimpan." });
            setTimeout(() => setMsg(null), 3000);
        } catch {
            setMsg({ type: "error", text: "Gagal menyimpan. Coba lagi." });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-blue-600" size={24} />
            </div>
        );
    }

    const companyForPreview = {
        name:    form.companyName,
        tagline: form.companyTagline ?? "",
        head:    form.headOffice,
        branch:  form.branchOffice ?? "",
        telp:    form.telp,
        wa:      form.wa,
        email:   form.email,
        website: form.website,
    };

    return (
        <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 space-y-5 pb-20">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Settings size={20} className="text-blue-600" /> Pengaturan
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Konfigurasi perusahaan dan sistem quotation
                    </p>
                </div>
                <button onClick={load} disabled={loading}
                    className="p-2 border border-slate-200 bg-white text-slate-500 rounded-xl hover:bg-slate-50 shrink-0">
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Last saved info */}
            {lastUpdated && (
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 size={11} className="text-emerald-500" />
                    Terakhir disimpan: {fmtDateID(lastUpdated)}
                </p>
            )}

            {/* ── SECTION 1: Info Perusahaan ── */}
            <Section title="Identitas Perusahaan" icon={<Building2 size={15} />} defaultOpen>
                <Field label="Nama Perusahaan" required>
                    <input className={inputCls} value={form.companyName}
                        onChange={set("companyName")} placeholder="PT Nama Perusahaan" />
                </Field>
                <Field label="Tagline / Slogan" hint="Ditampilkan di bawah nama perusahaan pada PDF">
                    <input className={inputCls} value={form.companyTagline ?? ""}
                        onChange={set("companyTagline")} placeholder="Opsional" />
                </Field>
            </Section>

            {/* ── SECTION 2: Alamat ── */}
            <Section title="Alamat & Kantor" icon={<MapPin size={15} />} defaultOpen>
                <Field label="Head Office" required>
                    <textarea className={`${inputCls} resize-none`} rows={2}
                        value={form.headOffice} onChange={set("headOffice")}
                        placeholder="Jl. ..., Kota, Kode Pos" />
                </Field>
                <Field label="Branch Office" hint="Opsional — kosongkan jika tidak ada">
                    <textarea className={`${inputCls} resize-none`} rows={2}
                        value={form.branchOffice ?? ""} onChange={set("branchOffice")}
                        placeholder="Jl. ..., Kota" />
                </Field>
            </Section>

            {/* ── SECTION 3: Kontak ── */}
            <Section title="Kontak" icon={<Phone size={15} />} defaultOpen>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="No. Telepon">
                        <input className={inputCls} value={form.telp}
                            onChange={set("telp")} placeholder="(021) xxxxxxx" />
                    </Field>
                    <Field label="WhatsApp">
                        <input className={inputCls} value={form.wa}
                            onChange={set("wa")} placeholder="08xxxxxxxxxx" />
                    </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Email">
                        <div className="relative">
                            <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input className={`${inputCls} pl-8`} value={form.email}
                                onChange={set("email")} placeholder="info@perusahaan.com" />
                        </div>
                    </Field>
                    <Field label="Website">
                        <div className="relative">
                            <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input className={`${inputCls} pl-8`} value={form.website}
                                onChange={set("website")} placeholder="www.perusahaan.com" />
                        </div>
                    </Field>
                </div>
            </Section>

            {/* ── SECTION 4: Template Quotation (NEW) ── */}
            <Section title="Template Quotation" icon={<Palette size={15} />} defaultOpen={false}>
                <p className="text-xs text-slate-500 -mt-1">
                    Kustomisasi tampilan header dan footer pada dokumen PDF quotation — seperti letterhead di MS Word.
                </p>
                <TemplateEditorSection
                    tpl={form.template ?? { ...TEMPLATE_DEFAULTS }}
                    company={companyForPreview}
                    onChange={updated => setForm(prev => ({ ...prev, template: updated }))}
                />
            </Section>

            {/* ── SECTION 5: Nomor Surat ── */}
            <Section title="Nomor Surat" icon={<Hash size={15} />} defaultOpen={false}>
                <Field
                    label="Prefix Nomor Surat"
                    required
                    hint={`Format nomor: ${form.nomorPrefix || "GP"}-AR/U/2026/03/0001`}
                >
                    <div className="flex items-center gap-2">
                        <input
                            className={`${inputCls} w-32 font-mono font-bold text-blue-600`}
                            value={form.nomorPrefix}
                            onChange={set("nomorPrefix")}
                            placeholder="GP"
                            maxLength={10}
                        />
                        <span className="text-sm text-slate-400 font-mono">
                            -{form.nomorPrefix || "GP"}-AR/U/2026/03/0001
                        </span>
                    </div>
                </Field>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                    ⚠ Mengubah prefix hanya berlaku untuk nomor surat baru. Nomor surat yang sudah diterbitkan tidak berubah.
                </div>
            </Section>

            {/* ── SECTION 6: Tanda Tangan Default ── */}
            <Section title="Tanda Tangan Default" icon={<FileSignature size={15} />} defaultOpen={false}>
                <p className="text-xs text-slate-500 -mt-1">
                    Nama dan jabatan yang muncul di bagian tanda tangan pada PDF quotation.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Nama Penandatangan">
                        <input className={inputCls} value={form.ttdNama ?? ""}
                            onChange={set("ttdNama")} placeholder="Nama lengkap" />
                    </Field>
                    <Field label="Jabatan">
                        <input className={inputCls} value={form.ttdJabatan ?? ""}
                            onChange={set("ttdJabatan")} placeholder="Direktur / Manager" />
                    </Field>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500">
                    💡 Marketing tetap bisa menggunakan tanda tangan digital mereka sendiri. Ini hanya default jika tidak ada tanda tangan digital.
                </div>
            </Section>

            {/* Feedback message */}
            {msg && (
                <div className={`flex items-start gap-2 text-sm p-4 rounded-xl border
                    ${msg.type === "success"
                        ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                        : "bg-red-50 border-red-100 text-red-600"}`}>
                    {msg.type === "success"
                        ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                        : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
                    {msg.text}
                </div>
            )}

            {/* Save button */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 bg-blue-600 text-white text-sm font-bold rounded-2xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm shadow-blue-200"
            >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>

            <p className="text-xs text-slate-400 text-center pb-2">
                Perubahan langsung berlaku untuk seluruh tim di perusahaan ini.
            </p>
        </div>
    );
}
