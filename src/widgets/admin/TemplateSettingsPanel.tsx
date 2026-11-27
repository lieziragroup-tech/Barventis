import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Upload, Trash2 } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useAuthStore } from '@/app/store/authStore';
import { getCompanySettings, saveCompanySettings } from '@/shared/api/settingsService';
import type { CompanySettings } from '@/shared/api/settingsService';
import { identityFromSettings } from '@/shared/api/documentConfig';
import {
  buildLetterhead, defaultDocumentTemplates, reportOptionsFromTemplates, sanitizeTemplates,
} from '@/shared/lib/documentTemplates';
import type { DocumentTemplates } from '@/shared/lib/documentTemplates';
import { GUCI_IDENTITY, guciTemplates, isGuciName } from '@/shared/lib/documentPresets';
import { generateVisitReportPDF } from '@/shared/lib/visitReportPdf';
import { previewVisitReport } from '@/shared/lib/sampleDocuments';
import { fileToImageDataUrl } from '@/shared/utils/imageUpload';

type Section = 'identitas' | 'rayap' | 'pest' | 'laporan';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'identitas', label: 'Identitas & Kop' },
  { id: 'rayap', label: 'Anti Rayap' },
  { id: 'pest', label: 'Pest Control' },
  { id: 'laporan', label: 'Laporan Kunjungan' },
];

type ReportPreviewKind = 'laporan-pest' | 'laporan-rayap';
const REPORT_PREVIEW_LABELS: Record<ReportPreviewKind, string> = {
  'laporan-pest': 'Laporan Kunjungan — Pest Control',
  'laporan-rayap': 'Laporan Kunjungan — Anti Rayap',
};

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
const lines = (s: string) => s.split('\n');

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
      {label}
    </label>
  );
}

const PEST_HELP = `Sintaks: "# Judul" · "#_ Judul bergaris bawah" · "## Sub-judul" · "### Tebal-miring" · "- butir daftar" · "-2 a | b | c" (daftar 2 kolom) · "@Label | isi" (baris label : isi) · baris kosong = jarak · "---" = halaman baru · tag <b> <i> <u> · placeholder {company} dan {klien}.`;

export function TemplateSettingsPanel() {
  const { user } = useAuth();
  const activeCompanyId = useAuthStore(s => s.activeCompanyId);
  const companyId = (user?.role === 'MASTER_SUPER_ADMIN' || user?.role === 'SUPERADMIN') ? activeCompanyId : user?.companyId ?? null;

  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [section, setSection] = useState<Section>('laporan');
  const [previewKind, setPreviewKind] = useState<ReportPreviewKind>('laporan-pest');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) { setSettings(null); return; }
    setLoading(true); setMsg(null);
    try {
      setSettings(await getCompanySettings(companyId));
      setDirty(false);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal memuat pengaturan.' });
    } finally {
      setLoading(false);
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const docs = settings?.documents ?? defaultDocumentTemplates();
  const identity = useMemo(() => (settings ? identityFromSettings(settings) : null), [settings]);

  const setIdentity = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => {
    setSettings(prev => (prev ? { ...prev, [k]: v } : prev)); setDirty(true);
  };
  const patchDocs = (fn: (d: DocumentTemplates) => void) => {
    setSettings(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev.documents ?? defaultDocumentTemplates());
      fn(next);
      return { ...prev, documents: next };
    });
    setDirty(true);
  };

  const upload = async (file: File | undefined, opts: { maxWidth: number; maxHeight: number }, apply: (url: string) => void) => {
    if (!file) return;
    try { apply(await fileToImageDataUrl(file, opts)); setMsg(null); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal memproses gambar.' }); }
  };

  const handleSave = async () => {
    if (!settings || !companyId || !user) return;
    if (!settings.companyName.trim()) { setMsg({ ok: false, text: 'Nama perusahaan wajib diisi.' }); return; }
    setSaving(true); setMsg(null);
    try {
      await saveCompanySettings(companyId, { ...settings, documents: sanitizeTemplates(settings.documents) }, user.uid);
      await load();
      setMsg({ ok: true, text: 'Pengaturan & template tersimpan. Dokumen laporan kunjungan berikutnya otomatis memakai template ini.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal menyimpan.' });
    } finally { setSaving(false); }
  };

  const handlePreview = async (kind: ReportPreviewKind = previewKind) => {
    if (!settings || !identity) return;
    setPreviewBusy(true); setMsg(null);
    try {
      const tpl = sanitizeTemplates(settings.documents);
      const ro = reportOptionsFromTemplates(tpl);
      const kategori = kind === 'laporan-rayap' ? 'Anti Rayap' : 'Pest Control';
      const blob = generateVisitReportPDF(
        previewVisitReport(buildLetterhead(tpl, identity), {
          judul: ro.judul,
          jenisPekerjaan: ro.jenisPekerjaan,
          saran: ro.saran,
          tampilkanFooter: ro.tampilkanFooter,
          kategori,
        })
      );
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const url = URL.createObjectURL(blob);
      previewRef.current = url; setPreviewUrl(url);
    } catch (e) {
      setMsg({ ok: false, text: `Pratinjau gagal: ${e instanceof Error ? e.message : 'kesalahan tidak diketahui'}` });
    } finally { setPreviewBusy(false); }
  };

  const loadGuciPreset = () => {
    if (!confirm('Muat contoh identitas & template PT Guci Emas Pratama? Isian yang belum disimpan akan diganti.')) return;
    setSettings(prev => prev ? ({
      ...prev, companyName: GUCI_IDENTITY.companyName, headOffice: GUCI_IDENTITY.headOffice, branchOffice: GUCI_IDENTITY.branchOffice,
      telp: GUCI_IDENTITY.telp, wa: GUCI_IDENTITY.wa, email: GUCI_IDENTITY.email, website: GUCI_IDENTITY.website, kota: GUCI_IDENTITY.kota,
      documents: guciTemplates(),
    }) : prev);
    setDirty(true);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!companyId) {
    return <div className="p-6 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">Pilih perusahaan pada menu di sidebar untuk mengatur template.</div>;
  }
  if (loading && !settings) return <div className="py-16 text-center text-sm text-slate-500"><Loader2 className="inline animate-spin mr-2" size={16} />Memuat pengaturan...</div>;
  if (!settings) return <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">{msg?.text ?? 'Pengaturan tidak tersedia.'}</div>;

  const lh = docs.letterhead;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Template &amp; Pengaturan Perusahaan</h3>
          <p className="text-xs text-slate-500 max-w-2xl">
            Atur kop dokumen, footer, standar layanan Anti Rayap &amp; Pest Control, serta format Laporan Kunjungan perusahaan Anda.
            Perubahan otomatis diterapkan pada cetakan PDF Laporan Kunjungan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(isGuciName(settings.companyName) || (user?.role === 'MASTER_SUPER_ADMIN' || user?.role === 'SUPERADMIN')) && (
            <button onClick={loadGuciPreset} className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer">
              Muat Preset Standar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 cursor-pointer transition-colors"
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </div>

      {msg && <div className={`p-3 rounded-lg text-sm border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}
      {!settings.hasSaved && <div className="p-3 rounded-lg text-xs border border-blue-200 bg-blue-50 text-blue-800">Perusahaan ini belum pernah menyimpan pengaturan. Nilai di bawah adalah bawaan netral — lengkapi lalu klik Simpan Pengaturan.</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* ── Editor ── */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap gap-1.5 p-2 border-b border-slate-200 bg-slate-50 rounded-t-xl">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => {
                  setSection(s.id);
                  if (s.id === 'rayap') setPreviewKind('laporan-rayap');
                  if (s.id === 'pest') setPreviewKind('laporan-pest');
                }}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  section === s.id
                    ? 'bg-[var(--accent)] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-4">
            {section === 'identitas' && (<>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nama perusahaan *"><input className={inputCls} value={settings.companyName} onChange={e => setIdentity('companyName', e.target.value)} /></Field>
                <Field label="Kota penerbit laporan" hint='Tampil: "Jakarta, 18 November 2026"'><input className={inputCls} value={settings.kota ?? ''} onChange={e => setIdentity('kota', e.target.value)} /></Field>
                <Field label="Kantor pusat"><input className={inputCls} value={settings.headOffice} onChange={e => setIdentity('headOffice', e.target.value)} /></Field>
                <Field label="Kantor cabang (opsional)"><input className={inputCls} value={settings.branchOffice ?? ''} onChange={e => setIdentity('branchOffice', e.target.value)} /></Field>
                <Field label="Telepon"><input className={inputCls} value={settings.telp} onChange={e => setIdentity('telp', e.target.value)} /></Field>
                <Field label="WhatsApp"><input className={inputCls} value={settings.wa} onChange={e => setIdentity('wa', e.target.value)} /></Field>
                <Field label="Email"><input className={inputCls} value={settings.email} onChange={e => setIdentity('email', e.target.value)} /></Field>
                <Field label="Website"><input className={inputCls} value={settings.website} onChange={e => setIdentity('website', e.target.value)} /></Field>
                <Field label="Prefix kode dokumen" hint="Kosong = inisial perusahaan. Contoh: GP → GP-LKP/2026/11/0001"><input className={inputCls} value={settings.nomorPrefix} onChange={e => setIdentity('nomorPrefix', e.target.value.toUpperCase())} /></Field>
                <Field label="Nama penandatangan / supervisor"><input className={inputCls} value={settings.ttdNama ?? ''} onChange={e => setIdentity('ttdNama', e.target.value)} /></Field>
              </div>

              <h4 className="text-sm font-bold text-slate-800 pt-2 border-t border-slate-200">Kop Dokumen</h4>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="radio" checked={lh.mode === 'text'} onChange={() => patchDocs(d => { d.letterhead.mode = 'text'; })} /> Teks (nama + tagline)</label>
                <label className="flex items-center gap-2 text-sm"><input type="radio" checked={lh.mode === 'image'} onChange={() => patchDocs(d => { d.letterhead.mode = 'image'; })} /> Gambar kop</label>
              </div>
              {lh.mode === 'text' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Nama merek di kop" hint="Kosong = nama perusahaan"><input className={inputCls} value={lh.brandName} onChange={e => patchDocs(d => { d.letterhead.brandName = e.target.value; })} /></Field>
                  <Field label="Tagline"><input className={inputCls} value={lh.tagline} onChange={e => patchDocs(d => { d.letterhead.tagline = e.target.value; })} /></Field>
                  <Field label="Warna"><input type="color" className="h-10 w-full rounded-lg border border-slate-300" value={lh.brandColor} onChange={e => patchDocs(d => { d.letterhead.brandColor = e.target.value; })} /></Field>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer">
                      <Upload size={14} /> Unggah gambar kop
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                        onChange={e => { void upload(e.target.files?.[0], { maxWidth: 1000, maxHeight: 220 }, url => patchDocs(d => { d.letterhead.headerLogo = url; })); e.target.value = ''; }} />
                    </label>
                    {lh.headerLogo && <button onClick={() => patchDocs(d => { d.letterhead.headerLogo = ''; })} className="text-xs text-red-600 flex items-center gap-1"><Trash2 size={12} /> Hapus</button>}
                    <Field label="Lebar di kertas (mm)"><input type="number" min={20} max={140} className={`${inputCls} w-24`} value={lh.headerLogoWidthMm} onChange={e => patchDocs(d => { d.letterhead.headerLogoWidthMm = Number(e.target.value); })} /></Field>
                  </div>
                  {lh.headerLogo ? <img src={lh.headerLogo} alt="Kop" className="max-h-16 border border-slate-200 rounded p-1 bg-white" /> : <p className="text-xs text-amber-700">Belum ada gambar — kop akan memakai teks.</p>}
                </div>
              )}

              <h4 className="text-sm font-bold text-slate-800 pt-2 border-t border-slate-200">Tanda Tangan &amp; Stempel Bawaan</h4>
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500">Dipakai otomatis pada cetakan dokumen laporan jika diperlukan. Gunakan format PNG transparan.</p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer">
                    <Upload size={14} /> Unggah TTD / Stempel
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={e => { void upload(e.target.files?.[0], { maxWidth: 700, maxHeight: 280 }, url => patchDocs(d => { d.surat.signatureImage = url; })); e.target.value = ''; }} />
                  </label>
                  {docs.surat.signatureImage && (<>
                    <img src={docs.surat.signatureImage} alt="Tanda tangan" className="h-14 border border-slate-200 rounded bg-white p-1" />
                    <button onClick={() => patchDocs(d => { d.surat.signatureImage = ''; })} className="text-xs text-red-600 flex items-center gap-1"><Trash2 size={12} /> Hapus</button>
                  </>)}
                </div>
              </div>

              <h4 className="text-sm font-bold text-slate-800 pt-2 border-t border-slate-200">Footer Dokumen</h4>
              <Field label="Baris footer kustom" hint="Satu baris per teks (maks. 6). Kosongkan untuk disusun otomatis dari alamat, telepon, email, dan cabang di atas.">
                <textarea rows={4} className={inputCls} value={lh.footerLines.join('\n')} onChange={e => patchDocs(d => { d.letterhead.footerLines = lines(e.target.value).slice(0, 6); })} />
              </Field>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Logo footer (asosiasi/sertifikasi, maks. 3)</span>
                  {lh.footerLogos.length < 3 && (
                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer">
                      <Upload size={12} /> Tambah
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                        onChange={e => { void upload(e.target.files?.[0], { maxWidth: 400, maxHeight: 300 }, url => patchDocs(d => { d.letterhead.footerLogos.push({ src: url, widthMm: 20 }); })); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
                {lh.footerLogos.map((lg, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 border border-slate-200 rounded-lg">
                    <img src={lg.src} alt={`Logo ${i + 1}`} className="h-10 object-contain" />
                    <Field label="Lebar (mm)"><input type="number" min={8} max={50} className={`${inputCls} w-20`} value={lg.widthMm} onChange={e => patchDocs(d => { d.letterhead.footerLogos[i].widthMm = Number(e.target.value); })} /></Field>
                    <button onClick={() => patchDocs(d => { d.letterhead.footerLogos.splice(i, 1); })} className="ml-auto text-red-600"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </>)}

            {section === 'rayap' && (<>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Masa garansi standar Anti Rayap (tahun)">
                  <input type="number" min={0} max={30} className={inputCls} value={docs.antiRayap.garansiTahun} onChange={e => patchDocs(d => { d.antiRayap.garansiTahun = Number(e.target.value); })} />
                </Field>
                <div className="flex items-end pb-2">
                  <Toggle checked={docs.antiRayap.tampilkanPengontrolan} onChange={v => patchDocs(d => { d.antiRayap.tampilkanPengontrolan = v; })} label="Tampilkan rincian jadwal pengontrolan berkala" />
                </div>
              </div>
              <Field label="Daftar jadwal & tahapan pengontrolan berkala" hint="Satu butir per baris. Tag <b>…</b> untuk teks tebal.">
                <textarea rows={5} className={inputCls} value={docs.antiRayap.pengontrolan.join('\n')} onChange={e => patchDocs(d => { d.antiRayap.pengontrolan = lines(e.target.value); })} />
              </Field>
              <Field label="Catatan teknis garansi & layanan Anti Rayap" hint='Contoh: "Garansi mencakup pengontrolan berkala dan injeksi ulang apabila ditemukan indikasi koloni rayap baru."'>
                <textarea rows={3} className={inputCls} value={docs.antiRayap.garansiCatatan} onChange={e => patchDocs(d => { d.antiRayap.garansiCatatan = e.target.value; })} />
              </Field>
            </>)}

            {section === 'pest' && (<>
              <p className="text-[11px] text-slate-500 leading-relaxed">{PEST_HELP}</p>
              {([
                ['programPest', 'Standar Program Pekerjaan Pest Control'],
                ['programRodentKontrak', 'Standar Program Pekerjaan Rodent Control (Terpadu)'],
                ['programRodentStandalone', 'Standar Program Pekerjaan Rodent Control (Khusus)'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-700">{label}</span>
                    <button
                      onClick={() => patchDocs(d => { d.pest[key] = defaultDocumentTemplates().pest[key]; })}
                      className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Reset ke Bawaan
                    </button>
                  </div>
                  <textarea rows={8} spellCheck={false} className={`${inputCls} font-mono text-xs`} value={docs.pest[key]} onChange={e => patchDocs(d => { d.pest[key] = e.target.value; })} />
                </div>
              ))}
            </>)}

            {section === 'laporan' && (<>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Judul dokumen"><input className={inputCls} value={docs.laporan.judul} onChange={e => patchDocs(d => { d.laporan.judul = e.target.value; })} /></Field>
                <Field label="Jenis pekerjaan bawaan"><input className={inputCls} value={docs.laporan.jenisPekerjaan} onChange={e => patchDocs(d => { d.laporan.jenisPekerjaan = e.target.value; })} /></Field>
              </div>
              <Field label="Saran & rekomendasi bawaan" hint="Teks awal pada kolom Saran dan Rekomendasi di Laporan Kunjungan.">
                <textarea rows={4} className={inputCls} value={docs.laporan.saranDefault} onChange={e => patchDocs(d => { d.laporan.saranDefault = e.target.value; })} />
              </Field>
              <Toggle checked={docs.laporan.tampilkanFooter} onChange={v => patchDocs(d => { d.laporan.tampilkanFooter = v; })} label='Tampilkan baris "created by … datetime …" di setiap halaman laporan' />
            </>)}

            <div className="pt-3 border-t border-slate-200">
              <button
                onClick={() => { if (confirm('Kembalikan SEMUA template dokumen ke bawaan? (Identitas perusahaan tidak berubah.)')) patchDocs(d => Object.assign(d, defaultDocumentTemplates())); }}
                className="text-xs font-medium text-slate-500 hover:text-red-600 cursor-pointer"
              >
                Kembalikan semua template ke bawaan
              </button>
            </div>
          </div>
        </div>

        {/* ── Pratinjau Laporan Kunjungan ── */}
        <div className="rounded-xl border border-slate-200 bg-white flex flex-col">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-200 bg-slate-50 rounded-t-xl">
            <select
              value={previewKind}
              onChange={e => setPreviewKind(e.target.value as ReportPreviewKind)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none"
            >
              {(Object.keys(REPORT_PREVIEW_LABELS) as ReportPreviewKind[]).map(k => (
                <option key={k} value={k}>{REPORT_PREVIEW_LABELS[k]}</option>
              ))}
            </select>
            <button
              onClick={() => void handlePreview()}
              disabled={previewBusy}
              className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 cursor-pointer transition-colors"
            >
              {previewBusy ? 'Memuat PDF...' : 'Pratinjau PDF'}
            </button>
            <span className="text-[11px] text-slate-500">Memakai isian saat ini (belum perlu disimpan).</span>
          </div>
          {previewUrl
            ? <iframe title="Pratinjau dokumen" src={previewUrl} className="w-full flex-1 min-h-[70vh] rounded-b-xl" />
            : <div className="flex-1 min-h-[40vh] flex items-center justify-center text-sm text-slate-400 p-6 text-center">Klik "Pratinjau PDF" untuk melihat hasil dokumen Laporan Kunjungan dengan kop dan template Anda.</div>}
        </div>
      </div>
    </div>
  );
}
