import React, { useState, useEffect } from 'react';
import { X, FlaskConical, Ruler, Loader2, AlertTriangle, Info, Users, UserPlus, Trash2, Check, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ApplicationMethod, ServiceType, TreatmentRecord } from '@/entities/types';
import { APPLICATION_METHOD_OPTIONS } from '@/shared/utils/serviceMeta';
import { TreatmentInput, TeamMemberEntry } from '@/shared/api/workReports';
import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/app/store/authStore';
import {
  PEST_CATALOG_26,
  TERMITE_CATALOG_AR,
  parsePestFindingsFromNotes,
  serializePestFindingsToNotes,
} from '@/shared/lib/permenkesRecapEngine';
import { VoiceDictationButton } from './VoiceDictationButton';

interface TreatmentFormModalProps {
  serviceType: ServiceType;
  existing: TreatmentRecord | null;
  initialTeamMembers?: TeamMemberEntry[];
  onSubmit: (input: TreatmentInput) => Promise<void>;
  onSkip?: () => void;
  onClose: () => void;
}

const DEFAULT_METHOD_BY_SERVICE: Partial<Record<ServiceType, ApplicationMethod>> = {
  GENERAL_PEST_CONTROL: 'SPRAYING',
  TERMITE_CONTROL: 'DRILLING',
  FUMIGATION: 'FOGGING',
};

const QUICK_AREAS = [
  'Basement & Parkiran',
  'Ruang Arsip Lt. 1',
  'Plafon & Pantry Lt. 2',
  'Perimeter Luar Gedung',
];

const QUICK_SUGGESTIONS_AR = ['+ Sirkulasi Udara', '+ Jadwal 14 Hari', '+ Palet Kayu/Kardus'];
const QUICK_SUGGESTIONS_PCO = ['+ Sanitasi Makanan', '+ Seal Lubang Pipa', '+ Rutin 14 Hari'];

function toLocalInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const TreatmentFormModal: React.FC<TreatmentFormModalProps> = ({
  serviceType,
  existing,
  initialTeamMembers = [],
  onSubmit,
  onSkip,
  onClose,
}) => {
  const user = useAuthStore(s => s.user);
  const [modeOverride, setModeOverride] = useState<'AR' | 'PCO'>(
    serviceType === 'TERMITE_CONTROL' ? 'AR' : 'PCO'
  );
  const isFumigation = serviceType === 'FUMIGATION';
  const isTermite = modeOverride === 'AR';
  const activeCatalog = isTermite ? TERMITE_CATALOG_AR : PEST_CATALOG_26;

  const parsedExisting = parsePestFindingsFromNotes(existing?.technicianNotes);

  const [applicationMethod, setApplicationMethod] = useState<ApplicationMethod>(
    existing?.applicationMethod ?? DEFAULT_METHOD_BY_SERVICE[serviceType] ?? 'SPRAYING'
  );
  const [chemicalName, setChemicalName] = useState(
    existing?.chemicalName || (isTermite ? 'Premise 200 SL' : 'Cypergard 100 EC')
  );
  const [activeIngredient, setActiveIngredient] = useState(existing?.activeIngredient ?? '');
  const [dosage, setDosage] = useState(
    existing?.dosage || (isTermite ? '2.5 ml / Liter Air' : '10 ml / Liter Air')
  );
  const [treatmentAreaSqm, setTreatmentAreaSqm] = useState(
    existing?.treatmentAreaSqm ? String(existing.treatmentAreaSqm) : '150'
  );
  const [drillingPointsCount, setDrillingPointsCount] = useState(
    existing?.drillingPointsCount ? String(existing.drillingPointsCount) : '14'
  );
  const [fumigantType, setFumigantType] = useState(existing?.fumigantType ?? '');
  const [gasConcentrationPpm, setGasConcentrationPpm] = useState(
    existing?.gasConcentrationPpm ? String(existing.gasConcentrationPpm) : ''
  );
  const [sealingStartedAt, setSealingStartedAt] = useState(toLocalInputValue(existing?.sealingStartedAt));
  const [aerationCompletedAt, setAerationCompletedAt] = useState(toLocalInputValue(existing?.aerationCompletedAt));
  const [safetyNotes, setSafetyNotes] = useState(existing?.safetyNotes ?? '');
  const [technicianNotes, setTechnicianNotes] = useState(parsedExisting.cleanNotes);

  // Progressive Disclosure state: hanya tampilkan input inti di permukaan, detail teknis dibuka on-click
  const [showAdvancedTechDetails, setShowAdvancedTechDetails] = useState(false);
  const [showTeamSection, setShowTeamSection] = useState(false);

  // Stitch Anti Rayap & Pest Control quick chips
  const [severityLevel, setSeverityLevel] = useState<'Ringan' | 'Sedang' | 'Kritis'>('Sedang');
  const [colonyEstimate, setColonyEstimate] = useState<'< 500' | '1rb - 3rb' | '> 5.000'>('1rb - 3rb');
  const [pestCondition, setPestCondition] = useState<'Hidup' | 'Mati/Bangkai' | 'Telur/Jejak'>('Hidup');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([
    'Basement & Parkiran',
    'Ruang Arsip Lt. 1',
  ]);

  const [pestFindings, setPestFindings] = useState<
    { pestName: string; quantity: number; treatmentMethod: string; location: string; notes: string }[]
  >(() => parsedExisting.findings);
  const [selectedPest, setSelectedPest] = useState<string>(activeCatalog[0]);
  const [pestQty, setPestQty] = useState<number>(isTermite ? 2 : 6);
  const [pestLocation, setPestLocation] = useState<string>('');
  const [pestNotes, setPestNotes] = useState<string>(
    isTermite
      ? 'Injeksi termitisida & cek jalur kusen/pondasi'
      : 'Monitoring & penanganan sesuai SOP'
  );

  useEffect(() => {
    setSelectedPest(isTermite ? TERMITE_CATALOG_AR[0] : PEST_CATALOG_26[0]);
  }, [isTermite]);

  const handleAddPestFinding = () => {
    if (pestQty <= 0) return;
    const tagSummary = isTermite
      ? `[Keparahan: ${severityLevel} | Koloni: ${colonyEstimate}]`
      : `[Kondisi: ${pestCondition}]`;
    setPestFindings(prev => [
      ...prev,
      {
        pestName: selectedPest,
        quantity: Number(pestQty),
        treatmentMethod: applicationMethod,
        location: pestLocation.trim() || selectedAreas[0] || (isTermite ? 'Jalur Pondasi & Kusen' : 'Area Layanan'),
        notes: `${tagSummary} ${pestNotes.trim()}`.trim(),
      },
    ]);
    setPestQty(1);
    setPestLocation('');
  };

  const toggleArea = (area: string) => {
    setSelectedAreas(prev => (prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]));
  };

  const appendSuggestionChip = (chip: string) => {
    const clean = chip.replace(/^\+\s*/, '');
    setTechnicianNotes(prev => (prev ? `${prev}. Rekomendasi: ${clean}` : `Rekomendasi: ${clean}`));
  };

  // Setup Tim Teknisi (Pilih dari daftar teknisi + Input manual jika tidak ada di daftar)
  const [teamMembers, setTeamMembers] = useState<TeamMemberEntry[]>(() =>
    initialTeamMembers.length > 0
      ? initialTeamMembers
      : user
      ? [{ id: user.uid, name: user.name, role: 'Ketua Tim', isManual: false }]
      : []
  );
  const [availableTechs, setAvailableTechs] = useState<{ id: string; name: string }[]>([]);
  const [manualTechName, setManualTechName] = useState('');

  useEffect(() => {
    if (!user?.companyId) return;
    supabase
      .from('users')
      .select('id, name, role')
      .eq('company_id', user.companyId)
      .eq('is_active', true)
      .then(({ data }) => {
        const techs = (data || [])
          .filter((u: any) => u.role === 'TEKNISI_LAPANGAN')
          .map((u: any) => ({ id: u.id, name: u.name }));
        setAvailableTechs(techs);
      });
  }, [user?.companyId]);

  const toggleRegisteredTech = (tech: { id: string; name: string }) => {
    setTeamMembers(prev => {
      const exists = prev.some(m => m.id === tech.id || m.name.toLowerCase() === tech.name.toLowerCase());
      if (exists) return prev.filter(m => m.id !== tech.id && m.name.toLowerCase() !== tech.name.toLowerCase());
      return [...prev, { id: tech.id, name: tech.name, role: 'Anggota Tim', isManual: false }];
    });
  };

  const handleAddManualTech = () => {
    const trimmed = manualTechName.trim();
    if (!trimmed) return;
    if (!teamMembers.some(m => m.name.toLowerCase() === trimmed.toLowerCase())) {
      setTeamMembers(prev => [...prev, { name: trimmed, role: 'Teknisi Pendamping (Manual)', isManual: true }]);
    }
    setManualTechName('');
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chemicalName.trim() || !dosage.trim()) {
      setError('Nama produk dan dosis wajib diisi.');
      return;
    }
    if (isFumigation && !aerationCompletedAt) {
      setError('Waktu selesai aerasi wajib diisi untuk fumigasi.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const teamSummary =
        teamMembers.length > 0 ? `[Tim Bertugas: ${teamMembers.map(m => m.name).join(', ')}] ` : '';
      const areaSummary =
        selectedAreas.length > 0 ? `[Area: ${selectedAreas.join(', ')}] ` : '';
      const rawTechNotes = `${teamSummary}${areaSummary}${technicianNotes.trim()}`.trim();
      const mergedTechNotes = serializePestFindingsToNotes(rawTechNotes, pestFindings);
      await onSubmit({
        applicationMethod,
        chemicalName: chemicalName.trim(),
        activeIngredient: activeIngredient.trim() || undefined,
        dosage: dosage.trim(),
        treatmentAreaSqm: treatmentAreaSqm ? Number(treatmentAreaSqm) : undefined,
        drillingPointsCount: drillingPointsCount ? Number(drillingPointsCount) : undefined,
        fumigantType: fumigantType.trim() || undefined,
        gasConcentrationPpm: gasConcentrationPpm ? Number(gasConcentrationPpm) : undefined,
        sealingStartedAt: sealingStartedAt ? new Date(sealingStartedAt).toISOString() : undefined,
        aerationCompletedAt: aerationCompletedAt ? new Date(aerationCompletedAt).toISOString() : undefined,
        safetyNotes: safetyNotes.trim() || undefined,
        technicianNotes: mergedTechNotes || undefined,
        teamMembers,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan laporan.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.22 }}
        className="relative w-full max-w-lg bg-[var(--bg-card)] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[var(--border-subtle)] flex flex-col max-h-[92dvh] overflow-hidden text-[var(--text-primary)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Ringkas + Switcher Anti Rayap / Pest Control */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical size={18} className="text-[#1B4332]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Form Laporan Pekerjaan</h2>
              <span className="text-[11px] text-slate-500 block">
                Isi temuan inti • Klik bagian bawah untuk detail
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto pb-24 sm:pb-5">
          {/* Switcher Mode Layanan (Anti Rayap vs Pest Control) */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setModeOverride('AR')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                isTermite ? 'bg-[#1B4332] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isTermite ? '✓ ' : ''}Anti Rayap
            </button>
            <button
              type="button"
              onClick={() => setModeOverride('PCO')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                !isTermite ? 'bg-[#1B4332] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {!isTermite ? '✓ ' : ''}Pest Control
            </button>
          </div>

          {/* 1. TEMUAN HAMA / RAYAP (RINGKAS & CEPAT) */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                1. {isTermite ? 'Temuan Rayap' : 'Temuan Hama'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#1B4332] text-[10px] font-bold border border-emerald-200">
                {isTermite ? 'Mode Anti Rayap' : 'Mode Pest Control'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={selectedPest}
                onChange={e => setSelectedPest(e.target.value)}
                className="sm:col-span-2 px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
              >
                {activeCatalog.map(item => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              {/* Stepper Jumlah */}
              <div className="flex items-center justify-between border border-slate-300 rounded-lg px-2 py-1 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setPestQty(q => Math.max(1, q - 1))}
                  className="w-6 h-6 rounded bg-white border border-slate-200 font-bold text-xs"
                >
                  -
                </button>
                <span className="text-xs font-bold font-mono">
                  {pestQty} {isTermite ? 'titik' : 'ekor'}
                </span>
                <button
                  type="button"
                  onClick={() => setPestQty(q => q + 1)}
                  className="w-6 h-6 rounded bg-white border border-slate-200 font-bold text-xs"
                >
                  +
                </button>
              </div>
            </div>

            {/* Quick Chips: Anti Rayap (Keparahan & Koloni) vs Pest Control (Rentang Jumlah & Kondisi) */}
            {isTermite ? (
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 block mb-1">Keparahan:</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['Ringan', 'Sedang', 'Kritis'] as const).map(lv => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => setSeverityLevel(lv)}
                        className={`py-1 rounded text-[10px] font-bold border ${
                          severityLevel === lv
                            ? lv === 'Kritis'
                              ? 'bg-rose-700 text-white border-rose-700'
                              : 'bg-[#1B4332] text-white border-[#1B4332]'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 block mb-1">Estimasi Koloni:</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['< 500', '1rb - 3rb', '> 5.000'] as const).map(col => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setColonyEstimate(col)}
                        className={`py-1 rounded text-[10px] font-bold border ${
                          colonyEstimate === col
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1">
                  {[
                    { label: '1-5', val: 3 },
                    { label: '6-15', val: 10 },
                    { label: '>20', val: 25 },
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setPestQty(preset.val)}
                      className={`px-2 py-1 rounded text-[10px] font-bold border ${
                        pestQty === preset.val
                          ? 'bg-[#1B4332] text-white border-[#1B4332]'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {(['Hidup', 'Mati/Bangkai', 'Telur/Jejak'] as const).map(cond => (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => setPestCondition(cond)}
                      className={`px-2 py-1 rounded text-[10px] font-bold border ${
                        pestCondition === cond
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {cond}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={pestLocation}
                onChange={e => setPestLocation(e.target.value)}
                placeholder={isTermite ? 'Titik sarang (Kusen / Pondasi)...' : 'Titik temuan (Dapur / Shaft)...'}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
              <button
                type="button"
                onClick={handleAddPestFinding}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1B4332] hover:bg-[#13462A] text-white text-xs font-bold shrink-0"
              >
                <Plus size={13} /> Tambah
              </button>
            </div>

            {pestFindings.filter(f => f.quantity > 0).length > 0 && (
              <div className="space-y-1 pt-1">
                {pestFindings
                  .filter(f => f.quantity > 0)
                  .map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs"
                    >
                      <div className="truncate">
                        <span className="font-bold text-slate-900">{item.pestName}</span>{' '}
                        <span className="font-mono font-bold text-[#1B4332]">
                          ({item.quantity} {isTermite ? 'titik' : 'ekor'})
                        </span>{' '}
                        • <span className="text-slate-600">{item.location}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPestFindings(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600 shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* 2. TINDAKAN & METODE INTI */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5">
            <span className="text-xs font-bold text-slate-900 block">2. Metode &amp; Bahan Aktif</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={applicationMethod}
                onChange={e => setApplicationMethod(e.target.value as ApplicationMethod)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
              >
                {APPLICATION_METHOD_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Nama Chemical *"
                value={chemicalName}
                onChange={e => setChemicalName(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs"
              />
              <input
                type="text"
                placeholder="Dosis *"
                value={dosage}
                onChange={e => setDosage(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
          </div>

          {/* 3. CAKUPAN AREA & SARAN SINGKAT */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">3. Area &amp; Saran Klien</span>
              <span className="text-[10px] font-semibold text-slate-500">{selectedAreas.length} Area</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_AREAS.map(area => {
                const active = selectedAreas.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => toggleArea(area)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                      active
                        ? 'bg-[#1B4332] text-white border-[#1B4332]'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {active ? '✓ ' : ''}
                    {area}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <VoiceDictationButton
                value={technicianNotes}
                onChange={setTechnicianNotes}
                fieldLabel="catatan observasi dan saran klien"
                variant="compact"
              />
              <textarea
                aria-label="Catatan observasi lapangan dan saran klien"
                rows={2}
                placeholder="Ketik atau gunakan Dikte Suara untuk mencatat observasi lapangan & saran klien..."
                value={technicianNotes}
                onChange={e => setTechnicianNotes(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs resize-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(isTermite ? QUICK_SUGGESTIONS_AR : QUICK_SUGGESTIONS_PCO).map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => appendSuggestionChip(chip)}
                  className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-[#1B4332] text-[10px] font-semibold border border-slate-200"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* PROGRESSIVE DISCLOSURE 1: TIM TEKNISI YANG IKUT BERTUGAS (ON-CLICK) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTeamSection(prev => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-left"
            >
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Users size={14} className="text-[#1B4332]" />
                Tim Teknisi yang Ikut Bertugas ({teamMembers.length} Orang)
              </span>
              {showTeamSection ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            <AnimatePresence initial={false}>
              {showTeamSection && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-slate-200"
                >
                  {availableTechs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {availableTechs.map(t => {
                        const selected = teamMembers.some(
                          m => m.id === t.id || m.name.toLowerCase() === t.name.toLowerCase()
                        );
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleRegisteredTech(t)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                              selected
                                ? 'bg-[#1B4332] text-white border-[#1B4332]'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {selected && <Check size={11} />}
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={manualTechName}
                      onChange={e => setManualTechName(e.target.value)}
                      placeholder="Tambah nama anggota manual..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddManualTech}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1B4332] text-white text-xs font-bold"
                    >
                      <UserPlus size={13} /> Tambah
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* PROGRESSIVE DISCLOSURE 2: PARAMETER TEKNIS LANJUTAN (ON-CLICK) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedTechDetails(prev => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-left"
            >
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Ruler size={14} className="text-slate-500" />
                Detail Teknis Lanjutan (Luas m², Titik Injeksi, Bahan Aktif)
              </span>
              {showAdvancedTechDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            <AnimatePresence initial={false}>
              {showAdvancedTechDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-3.5 pb-3.5 pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-slate-200"
                >
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Bahan Aktif</label>
                    <input
                      type="text"
                      placeholder="Imidakloprid / Cypermethrin"
                      value={activeIngredient}
                      onChange={e => setActiveIngredient(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Luas Area (m²)</label>
                    <input
                      type="number"
                      min={0}
                      value={treatmentAreaSqm}
                      onChange={e => setTreatmentAreaSqm(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                  </div>
                  {isTermite && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Titik Injeksi</label>
                      <input
                        type="number"
                        min={0}
                        value={drillingPointsCount}
                        onChange={e => setDrillingPointsCount(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isFumigation && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-2 text-xs text-rose-900">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle size={15} className="text-rose-600" />
                 Parameter Keselamatan Fumigasi (Wajib)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Jenis Fumigant (PH3)"
                  value={fumigantType}
                  onChange={e => setFumigantType(e.target.value)}
                  className="px-2.5 py-1.5 rounded border border-rose-300 bg-white text-xs"
                />
                <input
                  type="number"
                  placeholder="Gas (ppm)"
                  value={gasConcentrationPpm}
                  onChange={e => setGasConcentrationPpm(e.target.value)}
                  className="px-2.5 py-1.5 rounded border border-rose-300 bg-white text-xs"
                />
                <input
                  type="datetime-local"
                  value={sealingStartedAt}
                  onChange={e => setSealingStartedAt(e.target.value)}
                  className="px-2.5 py-1.5 rounded border border-rose-300 bg-white text-xs"
                />
                <input
                  type="datetime-local"
                  value={aerationCompletedAt}
                  onChange={e => setAerationCompletedAt(e.target.value)}
                  className="px-2.5 py-1.5 rounded border border-rose-300 bg-white text-xs"
                />
              </div>
              <input
                type="text"
                placeholder="Catatan keamanan area..."
                value={safetyNotes}
                onChange={e => setSafetyNotes(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-rose-300 bg-white text-xs"
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
            {onSkip && !isFumigation ? (
              <button
                type="button"
                onClick={onSkip}
                disabled={isSubmitting}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Isi nanti
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-[#1B4332] hover:bg-[#13462A] text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Simpan &amp; Lanjut Tanda Tangan
              </motion.button>
            </div>
          </div>

          <span className="sr-only">
            <Info size={1} />
          </span>
        </form>
      </motion.div>
    </div>
  );
};
