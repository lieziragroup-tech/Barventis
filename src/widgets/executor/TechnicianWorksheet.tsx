import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eraser,
  HelpCircle,
  Loader2,
  LocateFixed,
  Lock,
  MapPin,
  Minus,
  PenTool,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import {
  ApplicationMethod,
  DocumentationPhoto,
  PhotoTag,
  WorkReport,
} from '@/entities/types';
import { TreatmentInput, MAX_PHOTOS_PER_REPORT } from '@/shared/api/workReports';
import { serializePestFindingsToNotes, parsePestFindingsFromNotes } from '@/shared/lib/permenkesRecapEngine';
import { AuthedImage } from '../common/AuthedImage';
import {
  formatTimeWib,
  formatWoCode,
  getInitials,
  getTechSigStorageKey,
  getTechSigTimeStorageKey,
  isTermiteService,
  resolveLockedWorksheetMode,
} from './techLiteUtils';
import { ConfirmActionModal, useConfirmAction } from './ConfirmActionModal';
import { VoiceDictationButton } from './VoiceDictationButton';
import {
  formatAccuracyLabel,
  formatWorkPointCoordinates,
  loadWorkPointLocation,
  mapGeolocationErrorToIndonesian,
  saveWorkPointLocation,
  WorkPointLocation,
} from './workPointLocationUtils';
import type { SyncConnectivityState } from './offlineSyncUtils';

export interface WorksheetClientPrefill {
  customerName: string;
  customerRole: string;
  customerPhone: string;
  technicianSignature: string;
}

interface TechnicianWorksheetProps {
  report: WorkReport;
  elapsedTime: string;
  technicianName: string;
  technicianNip?: string | null;
  isOnline?: boolean;
  syncState?: SyncConnectivityState;
  pendingCount?: number;
  isSyncing?: boolean;
  onManualSync?: () => void;
  onBack: () => void;
  onOpenGuide?: () => void;
  onCapturePhoto: (tag: PhotoTag) => void;
  onViewPhoto: (photo: DocumentationPhoto) => void;
  onSaveTreatment: (input: TreatmentInput) => Promise<void>;
  onProceedToClientSign: (prefill: WorksheetClientPrefill) => void;
}

interface TermiteSpeciesEntry {
  id: string;
  name: string;
  selected: boolean;
  hasNest: boolean;
  hasMudTube: boolean;
  severity: 'Ringan' | 'Sedang' | 'Kritis';
  colonyEstimate: '< 500' | '1rb - 3rb' | '> 5.000';
  locationNote: string;
}

interface PestControlEntry {
  id: string;
  name: string;
  selected: boolean;
  quantity: number;
  conditions: string[];
  locationNote: string;
}

interface WorksheetDraft {
  serviceMode: 'AR' | 'PCO';
  // Bagian 1 — Anti Rayap per-species cards
  termiteEntries: TermiteSpeciesEntry[];
  // Bagian 1 — Pest Control per-pest cards
  pestEntries: PestControlEntry[];
  // Bagian 2 — Metode Treatment
  methods: string[];
  customMethods: string[];
  chemicalName: string;
  dosage: string;
  treatmentAreaSqm: string;
  // Bagian 3 — Area Tindakan
  selectedAreas: string[];
  priorityAreas: string[];
  customAreas: string[];
  // Bagian 4 — Saran & Rekomendasi
  recommendations: string;
  // Bagian 5 — Pengesahan
  technicianSignature: string;
  clientName: string;
  clientRole: string;
  clientPhone: string;
  // Koordinat titik pengerjaan (GPS)
  workPointLocation?: WorkPointLocation | null;
}

const DEFAULT_TERMITE_ENTRIES: TermiteSpeciesEntry[] = [
  {
    id: 'ar-kayu-kering',
    name: 'Rayap Kayu Kering (Cryptotermes)',
    selected: false,
    hasNest: false,
    hasMudTube: false,
    severity: 'Sedang',
    colonyEstimate: '1rb - 3rb',
    locationNote: '',
  },
  {
    id: 'ar-tanah',
    name: 'Rayap Tanah (Coptotermes formosanus)',
    selected: true,
    hasNest: false,
    hasMudTube: true,
    severity: 'Sedang',
    colonyEstimate: '1rb - 3rb',
    locationNote: '',
  },
];

const DEFAULT_PEST_ENTRIES: PestControlEntry[] = [
  {
    id: 'pco-kecoa',
    name: 'Kecoa Jerman',
    selected: true,
    quantity: 3,
    conditions: ['Hidup'],
    locationNote: '',
  },
  {
    id: 'pco-tikus',
    name: 'Tikus Got / Atap',
    selected: false,
    quantity: 1,
    conditions: ['Telur/Jejak'],
    locationNote: '',
  },
  {
    id: 'pco-semut',
    name: 'Semut Api / Merah',
    selected: false,
    quantity: 5,
    conditions: ['Hidup'],
    locationNote: '',
  },
  {
    id: 'pco-lalat-nyamuk',
    name: 'Lalat & Nyamuk',
    selected: false,
    quantity: 5,
    conditions: ['Hidup'],
    locationNote: '',
  },
];

const PEST_CONDITION_OPTIONS = ['Hidup', 'Mati/Bangkai', 'Telur/Jejak'];

const TREATMENT_METHODS: Array<{
  label: string;
  subtitle: string;
  apiMethod: ApplicationMethod;
  mode: 'AR' | 'PCO' | 'BOTH';
}> = [
  {
    label: 'Injeksi Termitisida Cair',
    subtitle: 'Pengeboran & injeksi barrier pondasi serta kusen',
    apiMethod: 'DRILLING',
    mode: 'AR',
  },
  {
    label: 'Umpan Rayap (Baiting System)',
    subtitle: 'Pemasangan stasiun umpan eliminasi koloni',
    apiMethod: 'BAITING',
    mode: 'AR',
  },
  {
    label: 'Spraying Residual',
    subtitle: 'Penyemprotan dinding, celah & perimeter bangunan',
    apiMethod: 'SPRAYING',
    mode: 'BOTH',
  },
  {
    label: 'Cold Fogging (ULV)',
    subtitle: 'Pengembunan halus area indoor & ruang tertutup',
    apiMethod: 'MISTING',
    mode: 'PCO',
  },
  {
    label: 'Pengasapan Thermal Fogging',
    subtitle: 'Pengasapan area outdoor, saluran & taman',
    apiMethod: 'FOGGING',
    mode: 'PCO',
  },
  {
    label: 'Gel Baiting & Perangkap',
    subtitle: 'Aplikasi gel kecoa/semut dan trap monitoring',
    apiMethod: 'GEL_INJECTION',
    mode: 'PCO',
  },
  {
    label: 'Dusting Celah & Partisi',
    subtitle: 'Penaburan serbuk anti hama di jalur tersembunyi',
    apiMethod: 'DUSTING',
    mode: 'BOTH',
  },
];

const DEFAULT_AREAS: Array<{ name: string; zone: string }> = [
  { name: 'Basement & Pondasi', zone: 'Struktur Bawah' },
  { name: 'Ruang Arsip & Dokumen', zone: 'Area Kering' },
  { name: 'Plafon & Partisi', zone: 'Area Atas' },
  { name: 'Pantry / Dapur', zone: 'Zona Pangan' },
  { name: 'Perimeter Luar', zone: 'Eksterior' },
  { name: 'Area Lobi & Koridor', zone: 'Zona Umum' },
];

const RECOMMENDATION_CHIPS_AR = [
  'Perbaiki Sirkulasi Udara',
  'Jadwal Kontrol 14 Hari',
  'Jauhkan Kardus/Kayu Lembap',
  'Periksa Kebocoran Pipa',
];

const RECOMMENDATION_CHIPS_PCO = [
  'Jaga Sanitasi Area Pangan',
  'Tutup Celah Pipa & Saluran',
  'Jadwal Kontrol 14 Hari',
  'Kelola Tempat Sampah Tertutup',
];

const CLIENT_ROLES = ['PIC Utama', 'Supervisor GA', 'Pengelola Gedung', 'Pemilik / Perwakilan'];

function buildDefaultDraft(report: WorkReport): WorksheetDraft {
  const isTermite = isTermiteService(report.serviceType);
  const parsed = parsePestFindingsFromNotes(report.treatmentRecord?.technicianNotes);

  const pestEntries = DEFAULT_PEST_ENTRIES.map(entry => ({ ...entry, conditions: [...entry.conditions] }));
  if (!isTermite && parsed.findings.length > 0) {
    pestEntries.forEach(p => {
      const match = parsed.findings.find(f =>
        f.pestName.toLowerCase().includes(p.name.split(' ')[0].toLowerCase())
      );
      if (match) {
        p.selected = true;
        p.quantity = Math.max(1, match.quantity || 1);
      }
    });
  }

  let existingTechSig = '';
  try {
    existingTechSig = localStorage.getItem(getTechSigStorageKey(report.id)) || '';
  } catch {
    // ignore
  }

  return {
    serviceMode: isTermite ? 'AR' : 'PCO',
    termiteEntries: DEFAULT_TERMITE_ENTRIES.map(e => ({ ...e })),
    pestEntries,
    methods: isTermite ? ['Injeksi Termitisida Cair'] : ['Spraying Residual'],
    customMethods: [],
    chemicalName: report.treatmentRecord?.chemicalName || (isTermite ? 'Premise 200 SL' : 'Cypergard 100 EC'),
    dosage: report.treatmentRecord?.dosage || (isTermite ? '2.5 ml / L Air' : '10 ml / L Air'),
    treatmentAreaSqm: report.treatmentRecord?.treatmentAreaSqm
      ? String(report.treatmentRecord.treatmentAreaSqm)
      : '120',
    selectedAreas: isTermite
      ? ['Basement & Pondasi', 'Ruang Arsip & Dokumen']
      : ['Pantry / Dapur', 'Perimeter Luar'],
    priorityAreas: [],
    customAreas: [],
    recommendations: parsed.cleanNotes || '',
    technicianSignature: existingTechSig,
    clientName: report.customerName || '',
    clientRole: 'PIC Utama',
    clientPhone: report.customerPhone || '',
    workPointLocation: loadWorkPointLocation(report.id),
  };
}

export const TechnicianWorksheet: React.FC<TechnicianWorksheetProps> = ({
  report,
  elapsedTime,
  technicianName,
  technicianNip,
  isOnline = true,
  syncState,
  pendingCount = 0,
  isSyncing = false,
  onManualSync,
  onBack,
  onOpenGuide,
  onCapturePhoto,
  onViewPhoto,
  onSaveTreatment,
  onProceedToClientSign,
}) => {
  const effectiveSyncState: SyncConnectivityState =
    syncState ?? (!isOnline ? 'offline' : isSyncing ? 'syncing' : pendingCount > 0 ? 'unstable' : 'online');
  const draftKey = `fw_tech_draft_${report.id}`;
  const lockedServiceMode = resolveLockedWorksheetMode(report.serviceType);

  const [draft, setDraft] = useState<WorksheetDraft>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Guard against legacy draft schema and always enforce the task's locked service mode
        if (Array.isArray(parsed.termiteEntries) && Array.isArray(parsed.pestEntries)) {
          return {
            ...buildDefaultDraft(report),
            ...parsed,
            serviceMode: lockedServiceMode,
          };
        }
      }
    } catch {
      // ignore storage errors
    }
    return buildDefaultDraft(report);
  });

  const [newSpeciesInput, setNewSpeciesInput] = useState('');
  const [newPestInput, setNewPestInput] = useState('');
  const [newMethodInput, setNewMethodInput] = useState('');
  const [newAreaInput, setNewAreaInput] = useState('');
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const { confirmRequest, confirmAction, closeConfirm } = useConfirmAction();

  // Live signature canvas (Tahap 1 — Teknisi Utama)
  const techCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingTech, setIsDrawingTech] = useState(false);

  // Autosave draft locally for offline resilience
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // ignore quota errors
    }
  }, [draft, draftKey]);

  // Initialize signature canvas once on mount
  useEffect(() => {
    const canvas = techCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width) * dpr;
    canvas.height = Math.max(1, rect.height) * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#012d1d';

    if (draft.technicianSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = draft.technicianSignature;
    }
  }, []);

  const isTermite = lockedServiceMode === 'AR';
  const woCode = formatWoCode(report.id);
  const progressPhotos = report.photos.filter(p => p.photoType === 'PROGRESS');
  const totalPhotos = report.photos.length;
  const canTakeMoreProgress = totalPhotos < MAX_PHOTOS_PER_REPORT && progressPhotos.length < 4;

  const updateDraft = <K extends keyof WorksheetDraft>(key: K, value: WorksheetDraft[K]) => {
    if (key === 'serviceMode') return;
    setValidationMsg(null);
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const toggleStringItem = (list: string[], item: string): string[] =>
    list.includes(item) ? list.filter(x => x !== item) : [...list, item];

  // Canvas pointer handlers
  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = techCanvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startTechSign = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = techCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawingTech(true);
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const drawTechSign = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingTech) return;
    const ctx = techCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endTechSign = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingTech) return;
    setIsDrawingTech(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const sigUrl = techCanvasRef.current?.toDataURL('image/png') || '';
    if (sigUrl) {
      updateDraft('technicianSignature', sigUrl);
      try {
        localStorage.setItem(getTechSigStorageKey(report.id), sigUrl);
        localStorage.setItem(getTechSigTimeStorageKey(report.id), new Date().toISOString());
      } catch {
        // ignore storage quota errors
      }
    }
  };

  const clearTechSign = () => {
    const canvas = techCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    updateDraft('technicianSignature', '');
    try {
      localStorage.removeItem(getTechSigStorageKey(report.id));
    } catch {
      // ignore
    }
  };

  const handleRequestClearTechSign = () => {
    confirmAction({
      tone: 'danger',
      title: 'Hapus Tanda Tangan Teknisi?',
      description:
        'Goresan tanda tangan teknisi saat ini akan dihapus dan Anda perlu menandatangani ulang sebelum melanjutkan.',
      confirmLabel: 'Ya, Hapus TTD',
      cancelLabel: 'Batal',
      onConfirm: clearTechSign,
    });
  };

  const handleRequestBack = () => {
    confirmAction({
      tone: 'warning',
      title: 'Keluar dari Form Laporan?',
      description:
        'Perubahan form Anda sudah tersimpan otomatis sebagai draf di perangkat ini dan dapat dilanjutkan kembali kapan saja.',
      details: [
        { label: 'Nomor WO', value: woCode },
        { label: 'Lokasi', value: report.projectName },
      ],
      confirmLabel: 'Ya, Keluar',
      cancelLabel: 'Tetap di Form',
      onConfirm: onBack,
    });
  };

  const handleRequestRemoveCustomMethod = (methodName: string) => {
    confirmAction({
      tone: 'danger',
      title: 'Hapus Treatment Khusus?',
      description: 'Tindakan treatment kustom ini akan dihapus dari daftar laporan pekerjaan.',
      details: [{ label: 'Treatment', value: methodName }],
      confirmLabel: 'Ya, Hapus',
      cancelLabel: 'Batal',
      onConfirm: () =>
        updateDraft(
          'customMethods',
          draft.customMethods.filter(x => x !== methodName)
        ),
    });
  };

  // Build TreatmentInput payload compatible with Permenkes Recap & PDF export
  const buildTreatmentPayload = (): TreatmentInput => {
    const allMethods = [...draft.methods, ...draft.customMethods];
    const primaryMethodConfig = TREATMENT_METHODS.find(m => allMethods.includes(m.label));
    const apiMethod: ApplicationMethod =
      primaryMethodConfig?.apiMethod || (isTermite ? 'DRILLING' : 'SPRAYING');

    const areaList = draft.selectedAreas.map(a =>
      draft.priorityAreas.includes(a) ? `${a} (Prioritas)` : a
    );
    const areaSummary = areaList.join(', ') || (isTermite ? 'Area Pondasi & Kusen' : 'Area Operasional');

    const findings = isTermite
      ? draft.termiteEntries
          .filter(sp => sp.selected)
          .map(sp => {
            const flags = [
              sp.hasNest ? 'Sarang Terdeteksi' : '',
              sp.hasMudTube ? 'Jalur Mud Tube' : '',
            ]
              .filter(Boolean)
              .join(', ');
            return {
              pestName: sp.name,
              quantity: 1,
              treatmentMethod: allMethods.join(', ') || 'Injeksi Termitisida Cair',
              location: sp.locationNote.trim() || areaSummary,
              notes: `[Keparahan: ${sp.severity} | Koloni: ${sp.colonyEstimate}${flags ? ` | ${flags}` : ''}]`,
            };
          })
      : draft.pestEntries
          .filter(p => p.selected && p.quantity > 0)
          .map(p => ({
            pestName: p.name,
            quantity: p.quantity,
            treatmentMethod: allMethods.join(', ') || 'Spraying Residual',
            location: p.locationNote.trim() || areaSummary,
            notes: `Ditemukan ${p.quantity} titik/ekor${
              p.conditions.length > 0 ? ` (${p.conditions.join(', ')})` : ''
            }`,
          }));

    const safeFindings =
      findings.length > 0
        ? findings
        : [
            {
              pestName: isTermite ? 'Inspeksi Pencegahan Rayap' : 'Monitoring Hama Umum',
              quantity: 1,
              treatmentMethod: allMethods.join(', ') || 'Preventif',
              location: areaSummary,
              notes: 'Kondisi terkendali / preventif',
            },
          ];

    const compiledNotes = [
      `Area: ${areaSummary}.`,
      allMethods.length > 0 ? `Metode: ${allMethods.join(', ')}.` : '',
      draft.recommendations.trim() ? `Saran: ${draft.recommendations.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      applicationMethod: apiMethod,
      chemicalName: draft.chemicalName.trim() || (isTermite ? 'Premise 200 SL' : 'Cypergard 100 EC'),
      dosage: draft.dosage.trim() || (isTermite ? '2.5 ml / L Air' : '10 ml / L Air'),
      treatmentAreaSqm: Number(draft.treatmentAreaSqm) || 120,
      // CRITICAL: cleanNotes is 1st parameter, findings is 2nd parameter
      technicianNotes: serializePestFindingsToNotes(compiledNotes, safeFindings),
    };
  };

  const executeProceed = async () => {
    setIsSaving(true);
    try {
      await onSaveTreatment(buildTreatmentPayload());
    } catch {
      // Offline queue handled upstream
    } finally {
      setIsSaving(false);
    }

    try {
      localStorage.setItem(getTechSigStorageKey(report.id), draft.technicianSignature);
      localStorage.setItem(getTechSigTimeStorageKey(report.id), new Date().toISOString());
      if (draft.workPointLocation) {
        saveWorkPointLocation(report.id, draft.workPointLocation);
      }
    } catch {
      // ignore
    }

    onProceedToClientSign({
      customerName: draft.clientName.trim(),
      customerRole: draft.clientRole.trim() || 'PIC Utama',
      customerPhone: draft.clientPhone.trim(),
      technicianSignature: draft.technicianSignature,
    });
  };

  const handleSaveCurrentLocation = () => {
    setLocationError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError('Browser ini tidak mendukung fitur GPS lokasi.');
      return;
    }

    setIsCapturingLocation(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const captured: WorkPointLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          capturedAt: new Date().toISOString(),
          source: 'MANUAL_GPS',
        };
        saveWorkPointLocation(report.id, captured);
        updateDraft('workPointLocation', captured);
        setIsCapturingLocation(false);
      },
      err => {
        setLocationError(mapGeolocationErrorToIndonesian(err?.code));
        setIsCapturingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  };

  const handleProceed = () => {
    setValidationMsg(null);
    const allMethods = [...draft.methods, ...draft.customMethods];
    if (allMethods.length === 0) {
      setValidationMsg('Pilih minimal 1 tindakan treatment pada Bagian 2.');
      return;
    }
    if (draft.selectedAreas.length === 0) {
      setValidationMsg('Pilih minimal 1 area pengerjaan pada Bagian 3.');
      return;
    }
    if (!draft.technicianSignature) {
      setValidationMsg('Bubuhkan tanda tangan teknisi terlebih dahulu pada Bagian 5 (Tahap 1).');
      return;
    }
    if (!draft.clientName.trim()) {
      setValidationMsg('Isi nama perwakilan customer / PIC pada Bagian 5 (Tahap 2).');
      return;
    }

    confirmAction({
      tone: 'primary',
      title: 'Simpan & Lanjut ke Customer?',
      description:
        'Data temuan, metode treatment, dan area tindakan akan disimpan. Setelah ini Anda akan mengambil foto akhir dan menyerahkan layar ke customer untuk tanda tangan.',
      details: [
        { label: 'Layanan', value: isTermite ? 'Anti Rayap' : 'Pest Control' },
        { label: 'Metode Treatment', value: `${allMethods.length} tindakan` },
        { label: 'Area Tindakan', value: `${draft.selectedAreas.length} area` },
        { label: 'Penerima / PIC', value: `${draft.clientName.trim()} (${draft.clientRole.trim() || 'PIC Utama'})` },
      ],
      confirmLabel: 'Ya, Simpan & Lanjut',
      cancelLabel: 'Periksa Lagi',
      onConfirm: executeProceed,
    });
  };

  const availableMethods = TREATMENT_METHODS.filter(
    m => m.mode === 'BOTH' || m.mode === lockedServiceMode
  );
  const suggestionChips = isTermite ? RECOMMENDATION_CHIPS_AR : RECOMMENDATION_CHIPS_PCO;

  const allAreaRows = [
    ...DEFAULT_AREAS,
    ...draft.customAreas.map(name => ({ name, zone: 'Area Tambahan' })),
  ];

  const photoSlots: Array<{ label: string; tag: PhotoTag; hint: string }> = [
    { label: 'Kondisi Awal', tag: 'BEFORE', hint: 'Sebelum treatment' },
    { label: 'Proses 1', tag: null, hint: 'Saat penanganan' },
    { label: 'Proses 2', tag: null, hint: 'Titik tambahan' },
    { label: 'Hasil Akhir', tag: 'AFTER', hint: 'Setelah selesai' },
  ];

  return (
    <div className="flex flex-col min-h-full bg-[var(--tl-surface)]">
      {/* Frosted Sticky Header */}
      <header
        className="sticky top-0 z-30 px-4 h-14 flex items-center justify-between gap-2 backdrop-blur-md shrink-0"
        style={{
          background: 'color-mix(in srgb, var(--tl-surface) 92%, transparent)',
          boxShadow: 'var(--tl-shadow-head)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleRequestBack}
            aria-label="Kembali"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--tl-text)] hover:bg-[var(--tl-low)] active:scale-95 transition-transform cursor-pointer shrink-0"
          >
            <ArrowLeft size={19} />
          </button>
          <div className="min-w-0">
            <h1 className="text-[14px] font-bold text-[var(--tl-text)] truncate leading-tight">
              Form Laporan Pekerjaan
            </h1>
            <span className="block text-[10.5px] font-medium text-[var(--tl-text-variant)] truncate">
              {woCode} · {isTermite ? 'Anti Rayap' : 'Pest Control'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenGuide && (
            <button
              type="button"
              data-testid="worksheet-open-guide-btn"
              onClick={onOpenGuide}
              aria-label="Panduan Form Laporan"
              title="Panduan Form Laporan"
              className="w-8 h-8 rounded-full bg-[var(--tl-low)] hover:bg-[var(--tl-container)] border border-[var(--tl-border)] text-[var(--tl-text-variant)] hover:text-[var(--tl-text)] flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
            >
              <HelpCircle size={15} />
            </button>
          )}
          <span className="inline-flex items-center gap-1 text-[11.5px] font-mono font-semibold tabular-nums text-[var(--tl-text)]">
            <Clock size={12} className="text-[var(--tl-secondary)]" />
            <span>{elapsedTime}</span>
          </span>
          <span
            data-testid="worksheet-sync-indicator"
            data-sync-state={effectiveSyncState}
            aria-label={
              effectiveSyncState === 'offline'
                ? 'Status Offline'
                : effectiveSyncState === 'unstable'
                  ? 'Koneksi Tidak Stabil'
                  : effectiveSyncState === 'syncing'
                    ? 'Menyinkronkan Data'
                    : 'Status Online'
            }
            className={`inline-flex items-center gap-1 px-2 h-7 rounded-full border text-[11px] font-semibold whitespace-nowrap ${
              effectiveSyncState === 'offline'
                ? 'bg-rose-500/12 border-rose-500/35 text-rose-700 dark:text-rose-300'
                : effectiveSyncState === 'unstable'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300'
                  : effectiveSyncState === 'syncing'
                    ? 'bg-sky-500/12 border-sky-500/35 text-sky-700 dark:text-sky-300'
                    : 'bg-emerald-500/12 border-emerald-500/35 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                effectiveSyncState === 'offline'
                  ? 'bg-rose-500'
                  : effectiveSyncState === 'unstable'
                    ? 'bg-amber-500'
                    : effectiveSyncState === 'syncing'
                      ? 'bg-sky-500'
                      : 'bg-emerald-500'
              }`}
            />
            <span>
              {effectiveSyncState === 'offline'
                ? 'Offline'
                : effectiveSyncState === 'unstable'
                  ? 'Tidak Stabil'
                  : effectiveSyncState === 'syncing'
                    ? 'Sinkron...'
                    : 'Online'}
            </span>
          </span>
        </div>
      </header>

      {(effectiveSyncState === 'unstable' || effectiveSyncState === 'offline') && (
        <div
          data-testid="worksheet-sync-banner"
          className={`px-4 py-2 border-b flex items-center justify-between gap-2 text-[11.5px] ${
            effectiveSyncState === 'offline'
              ? 'bg-rose-500/10 border-rose-500/25 text-rose-900 dark:text-rose-200'
              : 'bg-amber-500/12 border-amber-500/30 text-amber-950 dark:text-amber-200'
          }`}
        >
          <span className="font-medium leading-snug min-w-0">
            {effectiveSyncState === 'offline'
              ? pendingCount > 0
                ? `Offline · ${pendingCount} data disimpan di cache browser`
                : 'Mode offline · Perubahan otomatis disimpan di cache browser'
              : pendingCount > 0
                ? `Koneksi tidak stabil · ${pendingCount} data menunggu dikirim`
                : 'Koneksi tidak stabil · Data tetap aman di cache browser'}
          </span>
          {effectiveSyncState === 'unstable' && onManualSync && (
            <button
              type="button"
              data-testid="worksheet-manual-sync-btn"
              onClick={onManualSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-[11px] font-semibold shrink-0 whitespace-nowrap active:scale-95 transition-transform cursor-pointer disabled:opacity-60"
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              <span>Sinkron Data</span>
            </button>
          )}
        </div>
      )}

      <main className="flex-1 px-4 pt-3.5 pb-36 space-y-3.5">
        {validationMsg && (
          <div
            role="alert"
            className="px-3.5 py-2.5 rounded-xl bg-[var(--tl-error-container)] text-[var(--tl-on-error-container)] text-[12px] font-semibold"
          >
            {validationMsg}
          </div>
        )}

        {/* ================================================================ */}
        {/* TOP WORK ORDER CONTEXT CARD + LOCKED SERVICE BANNER              */}
        {/* ================================================================ */}
        <section className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 space-y-3 shadow-[var(--tl-shadow-card)]">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--tl-border)] text-[11.5px] text-[var(--tl-text-variant)]">
            <span className="font-mono font-bold text-[var(--tl-text)]">
              {woCode} · {(report.scheduledStartTime || '09.00').replace(':', '.')} WIB
            </span>
            <span className="font-bold text-[var(--tl-secondary)]">
              {isTermite ? 'Anti Rayap' : 'Pest Control'}
            </span>
          </div>

          {/* Locked Service Scope Indicator — strictly follows assigned task type */}
          <div
            data-testid="locked-service-banner"
            data-tour="worksheet-locked"
            className="rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] px-3 py-2.5 flex items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[var(--tl-primary)] text-[var(--tl-on-primary)] flex items-center justify-center shrink-0">
                <Lock size={13} />
              </div>
              <div className="min-w-0">
                <strong className="block text-[12.5px] font-bold text-[var(--tl-text)] truncate">
                  {isTermite ? 'Form Khusus Anti Rayap' : 'Form Khusus Pest Control'}
                </strong>
                <span className="block text-[11px] text-[var(--tl-text-variant)] truncate">
                  Terkunci otomatis sesuai jenis tugas
                </span>
              </div>
            </div>
            <span className="text-[11px] font-mono font-bold text-[var(--tl-secondary)] shrink-0">
              {isTermite ? 'AR' : 'PCO'}
            </span>
          </div>

          {/* Inset Client & Address Summary */}
          <div className="rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] p-3 flex items-start gap-2.5">
            <MapPin size={15} className="text-[var(--tl-secondary)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <strong className="block text-[12.5px] font-bold text-[var(--tl-text)] leading-snug">
                {report.projectName}
              </strong>
              <p className="text-[11.5px] text-[var(--tl-text-variant)] mt-0.5 leading-snug">
                {report.clientName ? `${report.clientName} · ` : ''}
                {report.projectAddress}
              </p>
            </div>
          </div>

          {/* GPS Work-Point Tagging Control */}
          <div
            data-tour="worksheet-gps"
            className="rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] p-3 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-semibold text-[var(--tl-text)]">
                Koordinat Titik Pengerjaan
              </span>
              {draft.workPointLocation ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--tl-secondary)]">
                  <CheckCircle2 size={12} />
                  <span>Tersimpan</span>
                </span>
              ) : (
                <span className="text-[10.5px] text-[var(--tl-text-variant)]">
                  Belum ditandai
                </span>
              )}
            </div>

            {draft.workPointLocation && (
              <div
                data-testid="saved-workpoint-coords"
                className="rounded-lg bg-[var(--tl-card)] px-2.5 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <span className="block font-mono text-[11.5px] font-semibold text-[var(--tl-text)] truncate">
                    {formatWorkPointCoordinates(
                      draft.workPointLocation.latitude,
                      draft.workPointLocation.longitude
                    )}
                  </span>
                  <span className="block text-[10.5px] text-[var(--tl-text-variant)] mt-0.5">
                    {formatAccuracyLabel(draft.workPointLocation.accuracy)
                      ? `Akurasi ${formatAccuracyLabel(draft.workPointLocation.accuracy)}`
                      : 'GPS aktif'}
                    {draft.workPointLocation.capturedAt
                      ? ` · ${formatTimeWib(draft.workPointLocation.capturedAt)}`
                      : ''}
                  </span>
                </div>
                <MapPin size={14} className="text-[var(--tl-secondary)] shrink-0" />
              </div>
            )}

            {locationError && (
              <p
                role="alert"
                className="text-[11px] font-medium text-[var(--tl-on-error-container)] bg-[var(--tl-error-container)] rounded-lg px-2.5 py-1.5"
              >
                {locationError}
              </p>
            )}

            <button
              type="button"
              data-testid="save-current-location-btn"
              onClick={handleSaveCurrentLocation}
              disabled={isCapturingLocation}
              className="w-full min-h-[40px] px-3 rounded-xl bg-[var(--tl-card)] hover:bg-[var(--tl-container)] text-[var(--tl-primary)] border border-[var(--tl-primary)]/15 text-[12px] font-semibold inline-flex items-center justify-center gap-2 transition-colors active:scale-[0.99] disabled:opacity-60 cursor-pointer"
            >
              {isCapturingLocation ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Mengambil Koordinat GPS...</span>
                </>
              ) : (
                <>
                  <LocateFixed size={14} />
                  <span>Simpan Lokasi Saat Ini</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* ================================================================ */}
        {/* BAGIAN 1 — DETAIL TEMUAN PER HAMA                                */}
        {/* ================================================================ */}
        <section
          data-tour="worksheet-findings"
          className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 space-y-3 shadow-[var(--tl-shadow-card)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-[10.5px] font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h2 className="text-[13px] font-bold text-[var(--tl-text)]">Detail Temuan Per Hama</h2>
                <p className="text-[10.5px] text-[var(--tl-text-variant)]">
                  {isTermite
                    ? 'Centang spesies rayap & tandai estimasi keparahan'
                    : 'Pilih hama yang ditemukan & atur jumlah titik/ekor'}
                </p>
              </div>
            </div>
            <Bug size={15} className="text-[var(--tl-secondary)] shrink-0" />
          </div>

          {isTermite ? (
            /* ANTI RAYAP — Per-Species Structured Cards */
            <div className="space-y-2.5">
              {draft.termiteEntries.map(sp => (
                <div
                  key={sp.id}
                  className={`rounded-xl p-3.5 transition-colors space-y-3 ${
                    sp.selected ? 'bg-[var(--tl-low)] ring-1 ring-[var(--tl-secondary)]/40' : 'bg-[var(--tl-low)]/55'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft(
                        'termiteEntries',
                        draft.termiteEntries.map(item =>
                          item.id === sp.id ? { ...item, selected: !item.selected } : item
                        )
                      )
                    }
                    className="w-full flex items-center justify-between gap-2.5 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                          sp.selected
                            ? 'bg-[var(--tl-primary)] text-[var(--tl-on-primary)]'
                            : 'bg-[var(--tl-card)] border border-[var(--tl-outline-variant)]'
                        }`}
                      >
                        {sp.selected && <Check size={13} />}
                      </span>
                      <strong className="text-xs font-bold text-[var(--tl-text)] leading-snug">
                        {sp.name}
                      </strong>
                    </div>
                    {sp.selected && (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)] text-[10px] font-bold shrink-0">
                        Aktif
                      </span>
                    )}
                  </button>

                  {sp.selected && (
                    <div className="space-y-3 pt-2 border-t border-[var(--tl-container)]">
                      {/* Indicator Chips */}
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft(
                              'termiteEntries',
                              draft.termiteEntries.map(item =>
                                item.id === sp.id ? { ...item, hasNest: !item.hasNest } : item
                              )
                            )
                          }
                          className={`min-h-[34px] px-3 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                            sp.hasNest
                              ? 'bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)]'
                              : 'bg-[var(--tl-card)] text-[var(--tl-text-variant)]'
                          }`}
                        >
                          {sp.hasNest ? '✓ ' : ''}Sarang Terdeteksi
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft(
                              'termiteEntries',
                              draft.termiteEntries.map(item =>
                                item.id === sp.id ? { ...item, hasMudTube: !item.hasMudTube } : item
                              )
                            )
                          }
                          className={`min-h-[34px] px-3 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                            sp.hasMudTube
                              ? 'bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)]'
                              : 'bg-[var(--tl-card)] text-[var(--tl-text-variant)]'
                          }`}
                        >
                          {sp.hasMudTube ? '✓ ' : ''}Jalur Mud Tube
                        </button>
                      </div>

                      {/* Estimasi Keparahan */}
                      <div className="space-y-1">
                        <span className="block text-[10.5px] font-semibold text-[var(--tl-text-variant)]">
                          Estimasi Keparahan
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['Ringan', 'Sedang', 'Kritis'] as const).map(level => {
                            const active = sp.severity === level;
                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() =>
                                  updateDraft(
                                    'termiteEntries',
                                    draft.termiteEntries.map(item =>
                                      item.id === sp.id ? { ...item, severity: level } : item
                                    )
                                  )
                                }
                                className={`min-h-[38px] rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                                  active
                                    ? level === 'Kritis'
                                      ? 'bg-[var(--tl-error)] text-white'
                                      : 'bg-[var(--tl-primary)] text-[var(--tl-on-primary)]'
                                    : 'bg-[var(--tl-card)] text-[var(--tl-text-variant)]'
                                }`}
                              >
                                {level}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Estimasi Populasi Koloni */}
                      <div className="space-y-1">
                        <span className="block text-[10.5px] font-semibold text-[var(--tl-text-variant)]">
                          Estimasi Populasi Koloni
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['< 500', '1rb - 3rb', '> 5.000'] as const).map(est => {
                            const active = sp.colonyEstimate === est;
                            return (
                              <button
                                key={est}
                                type="button"
                                onClick={() =>
                                  updateDraft(
                                    'termiteEntries',
                                    draft.termiteEntries.map(item =>
                                      item.id === sp.id ? { ...item, colonyEstimate: est } : item
                                    )
                                  )
                                }
                                className={`min-h-[38px] rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-[var(--tl-secondary)] text-white'
                                    : 'bg-[var(--tl-card)] text-[var(--tl-text-variant)]'
                                }`}
                              >
                                {est}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Infestation Location Note */}
                      <input
                        type="text"
                        value={sp.locationNote}
                        onChange={e =>
                          updateDraft(
                            'termiteEntries',
                            draft.termiteEntries.map(item =>
                              item.id === sp.id ? { ...item, locationNote: e.target.value } : item
                            )
                          )
                        }
                        placeholder="Titik serangan (cth: Kusen & plafon)"
                        className="w-full h-10 px-3 rounded-lg bg-[var(--tl-card)] text-xs text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* + Tambah Spesies Rayap Kustom */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newSpeciesInput}
                  onChange={e => setNewSpeciesInput(e.target.value)}
                  placeholder="Tambah spesies rayap kustom..."
                  className="flex-1 h-11 px-3 rounded-xl bg-[var(--tl-low)] text-xs text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newSpeciesInput.trim();
                    if (!clean) return;
                    updateDraft('termiteEntries', [
                      ...draft.termiteEntries,
                      {
                        id: `ar-custom-${Date.now()}`,
                        name: clean,
                        selected: true,
                        hasNest: false,
                        hasMudTube: false,
                        severity: 'Sedang',
                        colonyEstimate: '1rb - 3rb',
                        locationNote: '',
                      },
                    ]);
                    setNewSpeciesInput('');
                  }}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[var(--tl-container)] hover:bg-[var(--tl-high)] text-[var(--tl-text)] text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Tambah</span>
                </button>
              </div>
            </div>
          ) : (
            /* PEST CONTROL — Per-Pest Counter & Condition Cards */
            <div className="space-y-2.5">
              {draft.pestEntries.map(pest => (
                <div
                  key={pest.id}
                  className={`rounded-xl p-3.5 transition-colors space-y-3 ${
                    pest.selected ? 'bg-[var(--tl-low)] ring-1 ring-[var(--tl-secondary)]/40' : 'bg-[var(--tl-low)]/55'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft(
                          'pestEntries',
                          draft.pestEntries.map(item =>
                            item.id === pest.id
                              ? { ...item, selected: !item.selected, quantity: Math.max(1, item.quantity) }
                              : item
                          )
                        )
                      }
                      className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                          pest.selected
                            ? 'bg-[var(--tl-primary)] text-[var(--tl-on-primary)]'
                            : 'bg-[var(--tl-card)] border border-[var(--tl-outline-variant)]'
                        }`}
                      >
                        {pest.selected && <Check size={13} />}
                      </span>
                      <div className="min-w-0">
                        <strong className="block text-xs font-bold text-[var(--tl-text)] truncate">
                          {pest.name}
                        </strong>
                        <span className="block text-[10.5px] text-[var(--tl-text-variant)]">
                          {pest.selected ? `${pest.quantity} ekor / titik ditemukan` : 'Ketuk untuk mencatat temuan'}
                        </span>
                      </div>
                    </button>

                    {pest.selected && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          aria-label={`Kurangi ${pest.name}`}
                          onClick={() =>
                            updateDraft(
                              'pestEntries',
                              draft.pestEntries.map(item =>
                                item.id === pest.id
                                  ? { ...item, quantity: Math.max(1, item.quantity - 1) }
                                  : item
                              )
                            )
                          }
                          className="w-9 h-9 rounded-lg bg-[var(--tl-card)] text-[var(--tl-text)] flex items-center justify-center active:scale-95 cursor-pointer"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-7 text-center font-mono text-xs font-bold tabular-nums text-[var(--tl-text)]">
                          {pest.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Tambah ${pest.name}`}
                          onClick={() =>
                            updateDraft(
                              'pestEntries',
                              draft.pestEntries.map(item =>
                                item.id === pest.id ? { ...item, quantity: item.quantity + 1 } : item
                              )
                            )
                          }
                          className="w-9 h-9 rounded-lg bg-[var(--tl-primary)] text-[var(--tl-on-primary)] flex items-center justify-center active:scale-95 cursor-pointer"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {pest.selected && (
                    <div className="space-y-2.5 pt-2 border-t border-[var(--tl-container)]">
                      {/* Quick quantity presets */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10.5px] font-semibold text-[var(--tl-text-variant)] mr-1">
                          Cepat:
                        </span>
                        {[
                          { label: '1-5', val: 3 },
                          { label: '6-15', val: 10 },
                          { label: '>20', val: 25 },
                        ].map(preset => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              updateDraft(
                                'pestEntries',
                                draft.pestEntries.map(item =>
                                  item.id === pest.id ? { ...item, quantity: preset.val } : item
                                )
                              )
                            }
                            className={`px-2.5 py-1 rounded-full text-[10.5px] font-mono font-bold cursor-pointer ${
                              pest.quantity === preset.val
                                ? 'bg-[var(--tl-secondary)] text-white'
                                : 'bg-[var(--tl-card)] text-[var(--tl-text-variant)]'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      {/* Condition tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {PEST_CONDITION_OPTIONS.map(cond => {
                          const active = pest.conditions.includes(cond);
                          return (
                            <button
                              key={cond}
                              type="button"
                              onClick={() =>
                                updateDraft(
                                  'pestEntries',
                                  draft.pestEntries.map(item =>
                                    item.id === pest.id
                                      ? { ...item, conditions: toggleStringItem(item.conditions, cond) }
                                      : item
                                  )
                                )
                              }
                              className={`min-h-[32px] px-2.5 rounded-full text-[10.5px] font-semibold cursor-pointer ${
                                active
                                  ? 'bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)]'
                                  : 'bg-[var(--tl-card)] text-[var(--tl-text-variant)]'
                              }`}
                            >
                              {active ? '✓ ' : ''}
                              {cond}
                            </button>
                          );
                        })}
                      </div>

                      {/* Location note */}
                      <input
                        type="text"
                        value={pest.locationNote}
                        onChange={e =>
                          updateDraft(
                            'pestEntries',
                            draft.pestEntries.map(item =>
                              item.id === pest.id ? { ...item, locationNote: e.target.value } : item
                            )
                          )
                        }
                        placeholder="Lokasi temuan (cth: Pantry & saluran)"
                        className="w-full h-10 px-3 rounded-lg bg-[var(--tl-card)] text-xs text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* + Tambah Jenis Hama Kustom */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newPestInput}
                  onChange={e => setNewPestInput(e.target.value)}
                  placeholder="Tambah jenis hama kustom..."
                  className="flex-1 h-11 px-3 rounded-xl bg-[var(--tl-low)] text-xs text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newPestInput.trim();
                    if (!clean) return;
                    updateDraft('pestEntries', [
                      ...draft.pestEntries,
                      {
                        id: `pco-custom-${Date.now()}`,
                        name: clean,
                        selected: true,
                        quantity: 1,
                        conditions: ['Hidup'],
                        locationNote: '',
                      },
                    ]);
                    setNewPestInput('');
                  }}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[var(--tl-container)] hover:bg-[var(--tl-high)] text-[var(--tl-text)] text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Tambah</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ================================================================ */}
        {/* BAGIAN 2 — TINDAKAN TREATMENT / METODE                           */}
        {/* ================================================================ */}
        <section className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 space-y-3 shadow-[var(--tl-shadow-card)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-[10.5px] font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <h2 className="text-[13px] font-bold text-[var(--tl-text)]">Tindakan Treatment &amp; Metode</h2>
                <p className="text-[10.5px] text-[var(--tl-text-variant)]">
                  Pilih metode penanganan yang diterapkan di lokasi
                </p>
              </div>
            </div>
            <Wrench size={15} className="text-[var(--tl-secondary)] shrink-0" />
          </div>

          <div className="space-y-2">
            {availableMethods.map(m => {
              const selected = draft.methods.includes(m.label);
              return (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => updateDraft('methods', toggleStringItem(draft.methods, m.label))}
                  className={`w-full min-h-[54px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-all active:scale-[0.99] cursor-pointer ${
                    selected
                      ? 'bg-[var(--tl-low)] ring-1 ring-[var(--tl-secondary)]/50'
                      : 'bg-[var(--tl-low)]/55'
                  }`}
                >
                  <div className="min-w-0">
                    <strong className="block text-xs font-bold text-[var(--tl-text)]">{m.label}</strong>
                    <small className="block text-[11px] text-[var(--tl-text-variant)] mt-0.5">
                      {m.subtitle}
                    </small>
                  </div>
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      selected
                        ? 'bg-[var(--tl-primary)] text-[var(--tl-on-primary)]'
                        : 'bg-[var(--tl-card)] border border-[var(--tl-outline-variant)]'
                    }`}
                  >
                    {selected && <Check size={13} />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Treatment Tags */}
          {draft.customMethods.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {draft.customMethods.map(cm => (
                <span
                  key={cm}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)] text-[11px] font-bold"
                >
                  <span>{cm}</span>
                  <button
                    type="button"
                    aria-label={`Hapus ${cm}`}
                    onClick={() => handleRequestRemoveCustomMethod(cm)}
                    className="p-0.5 rounded-full hover:bg-black/10 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newMethodInput}
              onChange={e => setNewMethodInput(e.target.value)}
              placeholder="Tambah treatment khusus..."
              className="flex-1 h-11 px-3 rounded-xl bg-[var(--tl-low)] text-xs text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
            />
            <button
              type="button"
              onClick={() => {
                const clean = newMethodInput.trim();
                if (!clean) return;
                if (!draft.customMethods.includes(clean)) {
                  updateDraft('customMethods', [...draft.customMethods, clean]);
                }
                setNewMethodInput('');
              }}
              className="min-h-[44px] px-3.5 rounded-xl bg-[var(--tl-container)] hover:bg-[var(--tl-high)] text-[var(--tl-text)] text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus size={14} />
              <span>Tambah</span>
            </button>
          </div>

          {/* Collapsible Detail Obat & Dosis */}
          <div className="rounded-xl bg-[var(--tl-low)] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTechDetails(v => !v)}
              className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--tl-text-variant)] cursor-pointer"
            >
              <span>Detail Obat &amp; Dosis (Opsional)</span>
              {showTechDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showTechDetails && (
              <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-[var(--tl-container)]">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--tl-text-variant)] mb-1">
                    Nama Bahan / Termitisida
                  </label>
                  <input
                    type="text"
                    value={draft.chemicalName}
                    onChange={e => updateDraft('chemicalName', e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[var(--tl-card)] text-xs text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--tl-text-variant)] mb-1">
                      Dosis Campuran
                    </label>
                    <input
                      type="text"
                      value={draft.dosage}
                      onChange={e => updateDraft('dosage', e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-[var(--tl-card)] text-xs text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--tl-text-variant)] mb-1">
                      Estimasi Luas (m²)
                    </label>
                    <input
                      type="number"
                      value={draft.treatmentAreaSqm}
                      onChange={e => updateDraft('treatmentAreaSqm', e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-[var(--tl-card)] text-xs font-mono text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ================================================================ */}
        {/* BAGIAN 3 — AREA TINDAKAN & PERLINDUNGAN                          */}
        {/* ================================================================ */}
        <section className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 space-y-3 shadow-[var(--tl-shadow-card)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-[10.5px] font-bold flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <h2 className="text-[13px] font-bold text-[var(--tl-text)]">Area Tindakan &amp; Perlindungan</h2>
                <p className="text-[10.5px] text-[var(--tl-text-variant)]">
                  Tandai area pengerjaan &amp; titik prioritas tinggi
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-[var(--tl-secondary)] shrink-0">
              {draft.selectedAreas.length} Area
            </span>
          </div>

          <div className="space-y-2">
            {allAreaRows.map(area => {
              const selected = draft.selectedAreas.includes(area.name);
              const isPriority = draft.priorityAreas.includes(area.name);
              return (
                <div
                  key={area.name}
                  className={`min-h-[50px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2 transition-colors ${
                    selected
                      ? 'bg-[var(--tl-low)] ring-1 ring-[var(--tl-secondary)]/45'
                      : 'bg-[var(--tl-low)]/55'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const nextAreas = toggleStringItem(draft.selectedAreas, area.name);
                      updateDraft('selectedAreas', nextAreas);
                      if (!nextAreas.includes(area.name) && isPriority) {
                        updateDraft(
                          'priorityAreas',
                          draft.priorityAreas.filter(p => p !== area.name)
                        );
                      }
                    }}
                    className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                        selected
                          ? 'bg-[var(--tl-primary)] text-[var(--tl-on-primary)]'
                          : 'bg-[var(--tl-card)] border border-[var(--tl-outline-variant)]'
                      }`}
                    >
                      {selected && <Check size={13} />}
                    </span>
                    <div className="min-w-0">
                      <strong className="block text-xs font-bold text-[var(--tl-text)] truncate">
                        {area.name}
                      </strong>
                      <span className="block text-[10.5px] text-[var(--tl-text-variant)]">
                        {area.zone}
                      </span>
                    </div>
                  </button>

                  {selected ? (
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft('priorityAreas', toggleStringItem(draft.priorityAreas, area.name))
                      }
                      className={`min-h-[32px] px-2.5 rounded-full text-[10.5px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer ${
                        isPriority
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'bg-[var(--tl-card)] text-[var(--tl-text-variant)]'
                      }`}
                    >
                      <Star size={12} className={isPriority ? 'fill-amber-500 text-amber-500' : ''} />
                      <span>{isPriority ? 'Prioritas Tinggi' : 'Standar'}</span>
                    </button>
                  ) : (
                    <span className="text-[10.5px] text-[var(--tl-outline)] shrink-0">Ketuk pilih</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newAreaInput}
              onChange={e => setNewAreaInput(e.target.value)}
              placeholder="Tambah area (cth: Gudang Lt. 3)..."
              className="flex-1 h-11 px-3 rounded-xl bg-[var(--tl-low)] text-xs text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
            />
            <button
              type="button"
              onClick={() => {
                const clean = newAreaInput.trim();
                if (!clean) return;
                if (!allAreaRows.some(a => a.name.toLowerCase() === clean.toLowerCase())) {
                  updateDraft('customAreas', [...draft.customAreas, clean]);
                }
                if (!draft.selectedAreas.includes(clean)) {
                  updateDraft('selectedAreas', [...draft.selectedAreas, clean]);
                }
                setNewAreaInput('');
              }}
              className="min-h-[44px] px-3.5 rounded-xl bg-[var(--tl-container)] hover:bg-[var(--tl-high)] text-[var(--tl-text)] text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus size={14} />
              <span>Tambah</span>
            </button>
          </div>
        </section>

        {/* ================================================================ */}
        {/* BAGIAN 4 — SARAN, REKOMENDASI & DOKUMENTASI FOTO (MAKS 6 FOTO)   */}
        {/* ================================================================ */}
        <section className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 space-y-3 shadow-[var(--tl-shadow-card)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-[10.5px] font-bold flex items-center justify-center shrink-0">
                4
              </span>
              <div>
                <h2 className="text-[13px] font-bold text-[var(--tl-text)]">Saran &amp; Dokumentasi Foto</h2>
                <p className="text-[10.5px] text-[var(--tl-text-variant)]">
                  Rekomendasi sanitasi &amp; bukti lapangan terkompresi
                </p>
              </div>
            </div>
            <Sparkles size={15} className="text-[var(--tl-secondary)] shrink-0" />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {suggestionChips.map(chip => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  const cur = draft.recommendations.trim();
                  if (cur.includes(chip)) return;
                  updateDraft('recommendations', cur ? `${cur}. ${chip}` : chip);
                }}
                className="min-h-[34px] px-3 rounded-full bg-[var(--tl-low)] hover:bg-[var(--tl-container)] border border-[var(--tl-border)] text-[11px] font-semibold text-[var(--tl-text)] active:scale-[0.98] cursor-pointer"
              >
                + {chip}
              </button>
            ))}
          </div>

          <div data-tour="worksheet-voice" className="space-y-2">
            <VoiceDictationButton
              value={draft.recommendations}
              onChange={next => updateDraft('recommendations', next)}
              fieldLabel="catatan observasi dan saran lapangan"
              variant="lite"
            />
            <textarea
              id="worksheet-observations-textarea"
              aria-label="Catatan observasi lapangan dan saran untuk klien"
              data-testid="worksheet-observations-textarea"
              rows={4}
              value={draft.recommendations}
              onChange={e => updateDraft('recommendations', e.target.value)}
              placeholder="Tulis atau ketuk Dikte Suara untuk mencatat temuan lapangan & saran untuk klien..."
              className="w-full p-3 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] text-xs leading-relaxed text-[var(--tl-text)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
            />
          </div>

          {/* 2-Column Photo Capture Grid (Max 6 compressed photos) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--tl-text)]">
                Dokumentasi Foto ({totalPhotos}/{MAX_PHOTOS_PER_REPORT})
              </span>
              <span className="text-[10.5px] font-medium text-[var(--tl-text-variant)]">
                Otomatis terkompresi
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {photoSlots.map((slot, idx) => {
                const matchedPhoto =
                  slot.tag === 'BEFORE'
                    ? progressPhotos.find(p => p.photoTag === 'BEFORE')
                    : slot.tag === 'AFTER'
                    ? progressPhotos.find(p => p.photoTag === 'AFTER')
                    : progressPhotos.filter(p => !p.photoTag)[idx === 1 ? 0 : 1];

                return (
                  <div
                    key={slot.label}
                    className="rounded-xl bg-[var(--tl-low)] p-2 flex flex-col gap-1.5"
                  >
                    {matchedPhoto ? (
                      <button
                        type="button"
                        onClick={() => onViewPhoto(matchedPhoto)}
                        className="relative w-full h-24 rounded-lg overflow-hidden cursor-pointer"
                      >
                        <AuthedImage
                          path={matchedPhoto.url}
                          alt={slot.label}
                          purged={!!matchedPhoto.purgedAt}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                          <Check size={13} />
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!canTakeMoreProgress}
                        onClick={() => onCapturePhoto(slot.tag)}
                        className="w-full h-24 rounded-lg border border-dashed border-[var(--tl-outline-variant)] bg-[var(--tl-card)] flex flex-col items-center justify-center gap-1 text-[var(--tl-text-variant)] disabled:opacity-45 active:scale-[0.98] cursor-pointer"
                      >
                        <Camera size={18} className="text-[var(--tl-secondary)]" />
                        <span className="text-[10.5px] font-semibold">Ambil Foto</span>
                      </button>
                    )}
                    <div className="px-0.5">
                      <strong className="block text-[11px] font-bold text-[var(--tl-text)]">
                        {slot.label}
                      </strong>
                      <span className="block text-[10px] text-[var(--tl-text-variant)]">
                        {slot.hint}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* BAGIAN 5 — PENGESAHAN LAPANGAN (2 TAHAP VALIDASI)                */}
        {/* ================================================================ */}
        <section
          data-tour="worksheet-sign"
          className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 space-y-3.5 shadow-[var(--tl-shadow-card)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-[10.5px] font-bold flex items-center justify-center shrink-0">
                5
              </span>
              <div>
                <h2 className="text-[13px] font-bold text-[var(--tl-text)]">Pengesahan Lapangan</h2>
                <p className="text-[10.5px] text-[var(--tl-text-variant)]">
                  2 tahap validasi: Teknisi Utama &amp; Customer (PIC)
                </p>
              </div>
            </div>
            <ShieldCheck size={15} className="text-[var(--tl-secondary)] shrink-0" />
          </div>

          {/* Tahap 1: Teknisi Utama */}
          <div className="rounded-xl bg-[var(--tl-low)] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-xs font-bold flex items-center justify-center shrink-0">
                  {getInitials(technicianName)}
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--tl-text-variant)]">
                    Tahap 1 · Teknisi Utama
                  </span>
                  <strong className="block text-xs font-bold text-[var(--tl-text)] truncate">
                    {technicianName}
                    {technicianNip ? ` (${technicianNip})` : ''}
                  </strong>
                </div>
              </div>
              {draft.technicianSignature ? (
                <span className="px-2 py-0.5 rounded-full bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)] text-[10px] font-bold inline-flex items-center gap-1 shrink-0">
                  <CheckCircle2 size={11} />
                  <span>Tervalidasi</span>
                </span>
              ) : (
                <span className="text-[10.5px] font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                  Wajib TTD
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--tl-text-variant)]">
                  Tanda tangan teknisi pelaksana:
                </span>
                {draft.technicianSignature && (
                  <button
                    type="button"
                    onClick={handleRequestClearTechSign}
                    className="text-[11px] font-semibold text-[var(--tl-error)] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Eraser size={12} /> Bersihkan
                  </button>
                )}
              </div>
              <div className="h-32 rounded-xl bg-white border border-[var(--tl-container)] relative overflow-hidden touch-none">
                {!draft.technicianSignature && (
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-slate-400 pointer-events-none text-xs">
                    <PenTool size={14} />
                    <span>Goreskan tanda tangan teknisi</span>
                  </div>
                )}
                <canvas
                  ref={techCanvasRef}
                  data-testid="tech-signature-canvas"
                  onPointerDown={startTechSign}
                  onPointerMove={drawTechSign}
                  onPointerUp={endTechSign}
                  onPointerOut={endTechSign}
                  className="w-full h-full cursor-crosshair relative z-10"
                  style={{ touchAction: 'none' }}
                />
              </div>
            </div>
          </div>

          {/* Tahap 2: Customer / Pihak Lokasi */}
          <div className="rounded-xl bg-[var(--tl-low)] p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck size={15} className="text-[var(--tl-secondary)] shrink-0" />
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--tl-text-variant)]">
                  Tahap 2 · Customer / Pihak Lokasi
                </span>
                <strong className="block text-xs font-bold text-[var(--tl-text)]">
                  Data PIC &amp; Serah Terima Layar
                </strong>
              </div>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--tl-text-variant)] mb-1">
                  Nama Penerima / PIC *
                </label>
                <input
                  type="text"
                  value={draft.clientName}
                  onChange={e => updateDraft('clientName', e.target.value)}
                  placeholder="cth: Bapak Hendra Wijaya"
                  className="w-full h-11 px-3 rounded-xl bg-[var(--tl-card)] text-xs font-medium text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--tl-text-variant)] mb-1">
                  Jabatan / Peran
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CLIENT_ROLES.map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => updateDraft('clientRole', role)}
                      className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${
                        draft.clientRole === role
                          ? 'bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)]'
                          : 'bg-[var(--tl-card)] text-[var(--tl-text-variant)]'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--tl-text-variant)] mb-1">
                  Nomor WhatsApp PIC (Opsional)
                </label>
                <input
                  type="tel"
                  value={draft.clientPhone}
                  onChange={e => updateDraft('clientPhone', e.target.value)}
                  placeholder="cth: 081234567890"
                  className="w-full h-11 px-3 rounded-xl bg-[var(--tl-card)] text-xs font-mono text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                />
              </div>

              {/* Handoff Trigger Box */}
              <button
                type="button"
                disabled={isSaving}
                onClick={handleProceed}
                className="w-full p-3.5 rounded-xl border border-dashed border-[var(--tl-secondary)] bg-[var(--tl-card)] hover:bg-[var(--tl-container)]/40 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)] flex items-center justify-center shrink-0">
                    <PenTool size={16} />
                  </div>
                  <div className="min-w-0">
                    <strong className="block text-xs font-bold text-[var(--tl-text)]">
                      Tap untuk Tanda Tangan Customer
                    </strong>
                    <small className="block text-[10.5px] text-[var(--tl-text-variant)]">
                      Ambil foto akhir &amp; serahkan HP ke PIC untuk TTD + penilaian rahasia
                    </small>
                  </div>
                </div>
                <ArrowRight size={16} className="text-[var(--tl-secondary)] shrink-0" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Sticky Bottom Action Tray */}
      <div className="tech-sticky-tray space-y-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleProceed}
          className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--tl-primary)] hover:bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)] text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
        >
          <span>{isSaving ? 'Menyimpan Laporan...' : 'Lanjut ke Tanda Tangan & Feedback'}</span>
          <ArrowRight size={16} />
        </button>
        <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-[var(--tl-text-variant)]">
          <Lock size={11} />
          <span>Penilaian kepuasan klien bersifat rahasia &amp; langsung ke manajemen.</span>
        </div>
      </div>

      <ConfirmActionModal request={confirmRequest} onClose={closeConfirm} />
    </div>
  );
};
