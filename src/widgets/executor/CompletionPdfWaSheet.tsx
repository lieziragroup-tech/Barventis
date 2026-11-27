import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Bug,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  CloudOff,
  Copy,
  Download,
  FileText,
  HelpCircle,
  Home,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { DocumentationPhoto, WorkReport } from '@/entities/types';
import { exportReportToPdf } from '@/shared/utils/pdfExport';
import { formatFileSizeKb } from '@/shared/utils/pdfReportHelpers';
import { parsePestFindingsFromNotes } from '@/shared/lib/permenkesRecapEngine';
import { AuthedImage } from '../common/AuthedImage';
import {
  extractColonyFromFindings,
  extractSeverityFromFindings,
  formatDurationId,
  formatTimeWib,
  formatWoCode,
  getInitials,
  getServiceLabel,
  getTechnicianTeamList,
  getTechSigStorageKey,
  getTechSigTimeStorageKey,
  isSampleCompleteReport,
  isTermiteService,
} from './techLiteUtils';
import { ConfirmActionModal, useConfirmAction } from './ConfirmActionModal';
import { WorkPointMiniMap } from './WorkPointMiniMap';
import {
  loadWorkPointLocation,
  resolveReportDisplayLocation,
} from './workPointLocationUtils';

interface CompletionPdfWaSheetProps {
  report: WorkReport;
  companyId?: string | null;
  technicianName?: string;
  technicianNip?: string | null;
  pendingQueueCount: number;
  isSyncing: boolean;
  isHistoryDetail?: boolean;
  onOpenGuide?: () => void;
  onSyncNow: () => void;
  onViewPhoto: (photo: DocumentationPhoto) => void;
  onBack: () => void;
}

function normalizeWaPhone(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

function buildFormalWaMessage(report: WorkReport): string {
  const isTermite = isTermiteService(report.serviceType);
  const serviceLabel = isTermite ? 'Pengendalian Rayap (Anti Rayap)' : 'Pengendalian Hama (Pest Control)';
  const dateStr = new Date(report.checkOutAt || report.createdAt).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const parsed = parsePestFindingsFromNotes(report.treatmentRecord?.technicianNotes);
  const recipient = report.customerName ? `Bapak/Ibu ${report.customerName}` : 'Bapak/Ibu Pengelola Lokasi';
  const summaryNote = parsed.cleanNotes ? `\nCatatan lapangan: ${parsed.cleanNotes}` : '';

  return [
    `Selamat pagi/siang ${recipient},`,
    ``,
    `Terima kasih telah menerima kunjungan tim *PT Guci Emas Pratama*. Berikut ringkasan Berita Acara pekerjaan (${formatWoCode(report.id)}):`,
    ``,
    `• Lokasi: ${report.projectName}`,
    `• Layanan: ${serviceLabel}`,
    `• Tanggal: ${dateStr}`,
    `• Teknisi: ${report.executorName || 'Tim Lapangan'}`,
    `• Dokumentasi: ${report.photos.length} foto bukti tersimpan${summaryNote}`,
    ``,
    `Dokumen PDF Berita Acara resmi telah kami siapkan dan siap dilampirkan. Apabila ada pertanyaan, silakan balas pesan ini.`,
    ``,
    `Salam hangat,`,
    `*PT Guci Emas Pratama*`,
  ].join('\n');
}

function getPhotoCaption(photo: DocumentationPhoto, index: number): string {
  if (photo.photoType === 'CHECK_IN') return 'Kehadiran (Check-In)';
  if (photo.photoType === 'CHECK_OUT') return 'Penyelesaian (Check-Out)';
  if (photo.photoTag === 'BEFORE') return 'Kondisi Awal (Before)';
  if (photo.photoTag === 'AFTER') return 'Hasil Akhir (After)';
  return `Proses Pekerjaan ${index + 1}`;
}

const METHOD_LABELS: Record<string, string> = {
  SPRAYING: 'Spraying Residual',
  BAITING: 'Umpan Rayap / Baiting System',
  DRILLING: 'Injeksi Termitisida & Pengeboran',
  TRENCHING: 'Trenching Barrier Pondasi',
  FOGGING: 'Thermal Fogging',
  MISTING: 'Cold Fogging (ULV) / Mist Blower',
  DUSTING: 'Dusting Celah & Partisi',
  GEL_INJECTION: 'Gel Baiting & Injeksi',
};

export const CompletionPdfWaSheet: React.FC<CompletionPdfWaSheetProps> = ({
  report,
  companyId,
  technicianName,
  technicianNip,
  pendingQueueCount,
  isSyncing,
  isHistoryDetail = false,
  onOpenGuide,
  onSyncNow,
  onViewPhoto,
  onBack,
}) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [copiedWa, setCopiedWa] = useState(false);
  const [savedToOutboxNotice, setSavedToOutboxNotice] = useState(false);
  const { confirmRequest, confirmAction, closeConfirm } = useConfirmAction();

  const isTermite = isTermiteService(report.serviceType);
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const hasOutboxPending = pendingQueueCount > 0 || isOffline;

  const woCode = formatWoCode(report.id);
  const parsed = useMemo(
    () => parsePestFindingsFromNotes(report.treatmentRecord?.technicianNotes),
    [report.treatmentRecord?.technicianNotes]
  );

  const severityLabel = extractSeverityFromFindings(parsed.findings);
  const colonyLabel = extractColonyFromFindings(parsed.findings);
  const teamList = useMemo(() => getTechnicianTeamList(report), [report]);
  const isSoloTech = teamList.length <= 1;

  // Read cached technician signature from device storage if signed on this device
  const localTechSig = useMemo(() => {
    try {
      return localStorage.getItem(getTechSigStorageKey(report.id)) || '';
    } catch {
      return '';
    }
  }, [report.id]);

  const resolvedTechSig = localTechSig || report.technicianSignature || '';
  const isSampleReport = isSampleCompleteReport(report.id);

  const localTechSigAt = useMemo(() => {
    try {
      return localStorage.getItem(getTechSigTimeStorageKey(report.id)) || '';
    } catch {
      return '';
    }
  }, [report.id]);

  const displayLocation = useMemo(
    () => resolveReportDisplayLocation(report, loadWorkPointLocation(report.id)),
    [report]
  );

  const waText = buildFormalWaMessage(report);
  const waPhone = normalizeWaPhone(report.customerPhone);
  const waHref = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const workDateLabel = new Date(report.checkOutAt || report.createdAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const timeRangeLabel =
    report.checkInAt && report.checkOutAt
      ? `${formatTimeWib(report.checkInAt).replace(' WIB', '')} – ${formatTimeWib(report.checkOutAt)}`
      : formatTimeWib(report.checkOutAt || report.scheduledStartTime);

  const durationLabel = formatDurationId(report.durationSeconds, report.checkInAt, report.checkOutAt);

  const displayTechName = report.executorName || technicianName || 'Teknisi Lapangan';
  const techInitials = getInitials(displayTechName);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    setPdfNotice(null);
    try {
      const result = await exportReportToPdf(report, undefined, {
        companyId,
        createdBy: displayTechName,
        petugasSignature: resolvedTechSig || undefined,
      });
      setPdfNotice(`Salinan PDF tersimpan (${formatFileSizeKb(result.sizeBytes)}): ${result.filename}`);
      setTimeout(() => setPdfNotice(null), 5000);
    } catch {
      setPdfNotice('Gagal membuat file PDF. Ketuk tombol unduh untuk mencoba kembali.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleCopyWaDraft = async () => {
    try {
      await navigator.clipboard.writeText(waText);
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const primaryMethodDisplay = report.treatmentRecord?.applicationMethod
    ? METHOD_LABELS[report.treatmentRecord.applicationMethod] || report.treatmentRecord.applicationMethod
    : isTermite
    ? 'Injeksi Termitisida & Barrier'
    : 'Spraying Residual & Monitoring';

  const pestTags =
    parsed.findings.length > 0
      ? parsed.findings.map(f => (f.quantity > 1 ? `${f.pestName} (${f.quantity})` : f.pestName))
      : report.targetFocus && report.targetFocus.length > 0
      ? report.targetFocus
      : report.focusTarget
      ? [report.focusTarget]
      : [isTermite ? 'Rayap Tanah / Kayu Kering' : 'Hama Umum (Preventif)'];

  return (
    <div className="flex flex-col min-h-full bg-[var(--tl-surface)]">
      {/* Frosted Stack Header */}
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
            onClick={onBack}
            aria-label="Kembali"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--tl-text)] hover:bg-[var(--tl-low)] active:scale-95 transition-transform cursor-pointer shrink-0"
          >
            <ArrowLeft size={19} />
          </button>
          <div className="min-w-0">
            <h1 className="text-[14.5px] font-bold text-[var(--tl-text)] tracking-tight leading-tight truncate">
              Detail Pekerjaan
            </h1>
            <p className="text-[10.5px] text-[var(--tl-text-variant)] font-mono truncate">
              {woCode} · {workDateLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenGuide && (
            <button
              type="button"
              data-testid="summary-open-guide-btn"
              onClick={onOpenGuide}
              aria-label="Panduan Ringkasan Laporan"
              title="Panduan Ringkasan Laporan"
              className="w-8 h-8 rounded-full bg-[var(--tl-low)] hover:bg-[var(--tl-container)] border border-[var(--tl-border)] text-[var(--tl-text-variant)] hover:text-[var(--tl-text)] flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
            >
              <HelpCircle size={15} />
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--tl-text-variant)]">
            <span
              className={`w-2 h-2 rounded-full ${
                isOffline ? 'bg-rose-500' : pendingQueueCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
            <span>{isOffline ? 'Offline' : 'Online'}</span>
          </span>
          <div
            aria-hidden="true"
            className="w-8 h-8 rounded-full bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-[11px] font-bold flex items-center justify-center shrink-0"
          >
            {techInitials}
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pt-3.5 pb-40 space-y-3.5">
        {/* Post-checkout completion confirmation banner */}
        {!isHistoryDetail && (
          <div className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 flex items-center gap-3 shadow-[var(--tl-shadow-card)]">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                hasOutboxPending
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)]'
              }`}
            >
              {hasOutboxPending ? <CloudOff size={19} /> : <CheckCircle2 size={19} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-[13.5px] font-bold text-[var(--tl-text)]">
                {hasOutboxPending ? 'Tersimpan di Antrean Offline' : 'Laporan Selesai & Disahkan'}
              </h2>
              <p className="text-[12px] text-[var(--tl-text-variant)] mt-0.5 leading-snug">
                {hasOutboxPending
                  ? 'Data aman tersimpan di HP. Kirim ulang otomatis saat sinyal kembali.'
                  : 'Berita Acara siap diunduh sebagai PDF atau dibagikan ke PIC via WhatsApp.'}
              </p>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* CARD 1 — KARTU PENUGASAN UTAMA                                   */}
        {/* ================================================================ */}
        <section
          data-tour="summary-minimap"
          className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 space-y-3 shadow-[var(--tl-shadow-card)]"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--tl-border)] text-[11.5px]">
            <span className="font-mono font-bold text-[var(--tl-text-variant)]">
              {woCode} · {getServiceLabel(report.serviceType)}
              {isSampleReport ? ' · Contoh Lengkap' : ''}
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-[var(--tl-secondary)] shrink-0">
              <CheckCircle2 size={12} />
              <span>Selesai</span>
            </span>
          </div>

          <div>
            <h2 className="text-[15px] font-bold text-[var(--tl-text)] leading-snug">
              {report.projectName}
            </h2>
            {report.clientName && (
              <p className="text-[11.5px] text-[var(--tl-text-variant)] mt-0.5">{report.clientName}</p>
            )}
          </div>

          {/* Inset Location & Time Metadata */}
          <div className="rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] divide-y divide-[var(--tl-border)] text-xs overflow-hidden">
            <div className="p-3 flex items-start gap-2.5">
              <MapPin size={15} className="text-[var(--tl-secondary)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="block text-[10.5px] font-semibold text-[var(--tl-text-variant)]">
                  Lokasi Pengerjaan
                </span>
                <strong className="block text-[var(--tl-text)] font-bold leading-relaxed">
                  {report.projectAddress || '-'}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-[var(--tl-border)]">
              <div className="p-2.5 flex items-start gap-2">
                <Calendar size={14} className="text-[var(--tl-secondary)] shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10.5px] text-[var(--tl-text-variant)]">Tanggal</span>
                  <strong className="text-[var(--tl-text)] font-bold">{workDateLabel}</strong>
                </div>
              </div>
              <div className="p-2.5 flex items-start gap-2">
                <Clock size={14} className="text-[var(--tl-secondary)] shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10.5px] text-[var(--tl-text-variant)]">
                    Waktu{durationLabel !== '-' ? ` (${durationLabel})` : ''}
                  </span>
                  <strong className="text-[var(--tl-text)] font-semibold font-mono text-[11.5px]">
                    {timeRangeLabel}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Mini-Map Titik Koordinat Pengerjaan */}
          {displayLocation && (
            <WorkPointMiniMap
              location={displayLocation}
              projectName={report.projectName}
            />
          )}

          {/* PIC Contact Bar */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[var(--tl-container)] text-[var(--tl-text)] flex items-center justify-center shrink-0">
                <UserCheck size={16} />
              </div>
              <div className="min-w-0">
                <span className="block text-[10.5px] text-[var(--tl-text-variant)]">PIC / Penerima Lokasi</span>
                <strong className="block text-xs font-bold text-[var(--tl-text)] truncate">
                  {report.customerName || 'Perwakilan Lokasi'}
                </strong>
              </div>
            </div>
            {report.customerPhone && (
              <a
                href={`tel:${report.customerPhone.replace(/\s+/g, '')}`}
                aria-label={`Hubungi ${report.customerName || 'PIC'}`}
                className="min-h-[38px] px-3 rounded-xl bg-[var(--tl-low)] hover:bg-[var(--tl-container)] text-[var(--tl-primary)] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
              >
                <Phone size={14} />
                <span>Hubungi</span>
              </a>
            )}
          </div>
        </section>

        {/* ================================================================ */}
        {/* CARD 2 — DOKUMENTASI & PENGESAHAN PEKERJAAN                      */}
        {/* ================================================================ */}
        <section
          data-tour="summary-docs"
          className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 space-y-3.5 shadow-[var(--tl-shadow-card)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Camera size={15} className="text-[var(--tl-secondary)]" />
              <h3 className="text-[13px] font-bold text-[var(--tl-text)]">Dokumentasi &amp; Pengesahan</h3>
            </div>
            <span className="text-[11px] font-semibold text-[var(--tl-secondary)]">
              {report.photos.length} Foto
            </span>
          </div>

          {/* Teknisi Pelaksana Block (Teknisi Tunggal vs Tim Pelaksana) */}
          <div className="rounded-xl bg-[var(--tl-low)] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--tl-text-variant)] flex items-center gap-1.5">
                <Users size={13} className="text-[var(--tl-secondary)]" />
                <span>Teknisi Pelaksana</span>
              </span>
              <span className="text-[10.5px] font-medium text-[var(--tl-text-variant)]">
                {isSoloTech ? 'Teknisi Tunggal' : `Tim (${teamList.length} Orang)`}
              </span>
            </div>

            <div className="space-y-1.5">
              {teamList.map((member, idx) => (
                <div
                  key={`${member.name}-${idx}`}
                  className="flex items-center justify-between gap-2 bg-[var(--tl-card)] rounded-xl p-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-[10.5px] font-bold flex items-center justify-center shrink-0">
                      {getInitials(member.name)}
                    </div>
                    <div className="min-w-0">
                      <strong className="block text-[12px] font-semibold text-[var(--tl-text)] truncate">
                        {member.name}
                      </strong>
                      <span className="block text-[10.5px] text-[var(--tl-text-variant)] truncate">
                        {member.role}
                        {idx === 0 && technicianNip ? ` · NIP ${technicianNip}` : ''}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10.5px] font-semibold text-[var(--tl-secondary)] whitespace-nowrap shrink-0">
                    Hadir
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 2-Column Verified Photo Grid (Up to 6 Photos) */}
          {report.photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {report.photos.slice(0, 6).map((photo, idx) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => onViewPhoto(photo)}
                  className="group rounded-xl overflow-hidden bg-[var(--tl-low)] text-left active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--tl-container)]">
                    <AuthedImage
                      path={photo.url}
                      alt={getPhotoCaption(photo, idx)}
                      purged={!!photo.purgedAt}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-black/65 text-white text-[9.5px] font-mono backdrop-blur-xs">
                        {formatTimeWib(photo.capturedAt)}
                      </span>
                      {photo.isWithinRadius && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600/90 text-white text-[9.5px] font-semibold">
                          Geo Valid
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="px-2.5 py-2">
                    <strong className="block text-[11px] font-semibold text-[var(--tl-text)] truncate">
                      {getPhotoCaption(photo, idx)}
                    </strong>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-[var(--tl-low)] p-4 text-center text-xs text-[var(--tl-text-variant)]">
              Belum ada foto dokumentasi terlampir pada laporan ini.
            </div>
          )}

          {/* Pengesahan Digital Berpasangan (2-Column Paired Signatures) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--tl-text-variant)] flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-[var(--tl-secondary)]" />
                <span>Pengesahan Digital Berpasangan</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Left: Teknisi Pelaksana */}
              <div className="rounded-xl bg-[var(--tl-low)] p-3 flex flex-col justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tl-text-variant)]">
                  Teknisi Pelaksana
                </span>
                <div className="h-16 rounded-lg bg-white border border-[var(--tl-container)] flex items-center justify-center p-1.5 overflow-hidden">
                  {resolvedTechSig ? (
                    <img
                      src={resolvedTechSig}
                      alt="Tanda tangan teknisi"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-emerald-700 gap-0.5">
                      <BadgeCheck size={18} />
                      <span className="text-[9.5px] font-bold tracking-wide uppercase">Terverifikasi</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <strong className="block text-[11px] font-bold text-[var(--tl-text)] truncate">
                    {displayTechName}
                  </strong>
                  <span className="block text-[10px] font-mono text-[var(--tl-text-variant)]">
                    {formatTimeWib(localTechSigAt || report.checkOutAt || report.updatedAt)}
                  </span>
                </div>
              </div>

              {/* Right: Klien / Customer (PIC) */}
              <div className="rounded-xl bg-[var(--tl-low)] p-3 flex flex-col justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tl-text-variant)]">
                  Klien / Customer (PIC)
                </span>
                <div className="h-16 rounded-lg bg-white border border-[var(--tl-container)] flex items-center justify-center p-1.5 overflow-hidden">
                  {report.customerSignature ? (
                    <img
                      src={report.customerSignature}
                      alt="Tanda tangan customer"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-emerald-700 gap-0.5">
                      <BadgeCheck size={18} />
                      <span className="text-[9.5px] font-bold tracking-wide uppercase">Disahkan PIC</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <strong className="block text-[11px] font-bold text-[var(--tl-text)] truncate">
                    {report.customerName || 'Perwakilan Lokasi'}
                  </strong>
                  <span className="block text-[10px] font-mono text-[var(--tl-text-variant)]">
                    {formatTimeWib(report.checkOutAt || report.updatedAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Catatan Lapangan Teknisi (NEVER displays confidential client rating!) */}
          {parsed.cleanNotes && (
            <div className="rounded-xl bg-[var(--tl-low)] p-3 border border-[var(--tl-container)]">
              <span className="block text-[10.5px] font-semibold text-[var(--tl-text-variant)] mb-1">
                Catatan Lapangan Teknisi
              </span>
              <p className="text-[11.5px] text-[var(--tl-text)] leading-relaxed">
                &ldquo;{parsed.cleanNotes}&rdquo;
              </p>
            </div>
          )}
        </section>

        {/* ================================================================ */}
        {/* CARD 3 — PELAPORAN KERJA & PENANGANAN HAMA                       */}
        {/* ================================================================ */}
        <section className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] p-3.5 space-y-3 shadow-[var(--tl-shadow-card)]">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-[var(--tl-secondary)]" />
            <h3 className="text-[13px] font-bold text-[var(--tl-text)]">Pelaporan Kerja &amp; Penanganan Hama</h3>
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Kategori Layanan */}
            <div className="rounded-xl bg-[var(--tl-low)] p-3 flex items-center justify-between gap-2">
              <span className="text-[var(--tl-text-variant)] font-medium">Kategori Layanan</span>
              <strong className="text-[var(--tl-text)] font-bold text-right">
                {isTermite ? 'Anti Rayap (Termite Control)' : 'Pest Control (Hama Umum)'}
              </strong>
            </div>

            {/* Jenis Hama yang Ditangani */}
            <div className="rounded-xl bg-[var(--tl-low)] p-3 space-y-2">
              <span className="text-[var(--tl-text-variant)] font-medium flex items-center gap-1.5">
                <Bug size={13} className="text-[var(--tl-secondary)]" />
                <span>Jenis Hama yang Ditangani</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {pestTags.map(tag => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-lg bg-[var(--tl-card)] text-[var(--tl-text)] text-[11px] font-semibold"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Tingkat Serangan / Infestasi (if recorded) */}
            {(severityLabel || colonyLabel) && (
              <div className="rounded-xl bg-[var(--tl-low)] p-3 grid grid-cols-2 gap-2.5">
                {severityLabel && (
                  <div>
                    <span className="block text-[10.5px] text-[var(--tl-text-variant)]">Tingkat Serangan</span>
                    <strong className="text-[var(--tl-text)] font-bold">{severityLabel}</strong>
                  </div>
                )}
                {colonyLabel && (
                  <div>
                    <span className="block text-[10.5px] text-[var(--tl-text-variant)]">Estimasi Koloni</span>
                    <strong className="text-[var(--tl-text)] font-mono font-bold">{colonyLabel}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Metode Penanganan & Bahan Terpakai */}
            <div className="rounded-xl bg-[var(--tl-low)] p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <Wrench size={14} className="text-[var(--tl-secondary)] shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[10.5px] text-[var(--tl-text-variant)]">Metode Penanganan</span>
                  <strong className="text-[var(--tl-text)] font-semibold">{primaryMethodDisplay}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--tl-container)]">
                <div>
                  <span className="block text-[10.5px] text-[var(--tl-text-variant)]">Bahan / Obat Terpakai</span>
                  <strong className="text-[var(--tl-text)] font-semibold">
                    {report.treatmentRecord?.chemicalName || (isTermite ? 'Termitisida Standar SOP' : 'Insektisida Standar SOP')}
                  </strong>
                </div>
                <div>
                  <span className="block text-[10.5px] text-[var(--tl-text-variant)]">Dosis &amp; Luas Area</span>
                  <strong className="text-[var(--tl-text)] font-semibold">
                    {report.treatmentRecord?.dosage || 'Sesuai SOP'}
                    {report.treatmentRecord?.treatmentAreaSqm
                      ? ` · ${report.treatmentRecord.treatmentAreaSqm} m²`
                      : ''}
                  </strong>
                </div>
              </div>
            </div>

            {/* Hasil & Rekomendasi */}
            <div className="rounded-xl bg-[var(--tl-low)] p-3 space-y-1">
              <span className="block text-[10.5px] text-[var(--tl-text-variant)]">Hasil &amp; Rekomendasi Kerja</span>
              <p className="text-[var(--tl-text)] leading-relaxed font-medium">
                {parsed.cleanNotes ||
                  'Seluruh area target telah selesai ditangani sesuai prosedur operasional standar PT Guci Emas Pratama.'}
              </p>
            </div>
          </div>
        </section>

        {/* Offline Queue Retry Card */}
        {hasOutboxPending && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <strong className="block text-xs font-bold text-amber-900 dark:text-amber-200">
                Antrean Offline ({Math.max(1, pendingQueueCount)})
              </strong>
              <small className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                {savedToOutboxNotice
                  ? 'Pengingat kirim ulang aktif saat sinyal pulih.'
                  : 'Kirim ulang sekarang jika sinyal sudah stabil.'}
              </small>
            </div>
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => {
                if (isOffline) {
                  setSavedToOutboxNotice(true);
                } else {
                  onSyncNow();
                }
              }}
              className="min-h-[40px] px-3.5 rounded-xl bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isOffline ? 'Simpan Antrean' : isSyncing ? 'Mengirim...' : 'Kirim Ulang'}
            </button>
          </div>
        )}

        {pdfNotice && (
          <div
            role="status"
            data-testid="pdf-download-notice"
            className="px-4 py-3 rounded-xl bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)] text-xs font-semibold flex items-start gap-2"
          >
            <Check size={15} className="shrink-0 mt-0.5" />
            <span className="break-all leading-snug">{pdfNotice}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onBack}
          className="w-full min-h-[44px] rounded-xl bg-[var(--tl-low)] hover:bg-[var(--tl-container)] text-[var(--tl-text)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {isHistoryDetail ? <ArrowLeft size={15} /> : <Home size={15} />}
          <span>{isHistoryDetail ? 'Kembali ke Riwayat Pekerjaan' : 'Kembali ke Beranda'}</span>
        </button>
      </main>

      {/* Compact 2-Row Floating Footer Action Tray */}
      <div data-tour="summary-actions" className="tech-sticky-tray space-y-2">
        <button
          type="button"
          data-testid="detail-download-pdf-btn"
          disabled={downloadingPdf}
          onClick={() =>
            confirmAction({
              tone: 'primary',
              title: 'Unduh Salinan PDF (Offline)?',
              description: 'Laporan kerja lengkap beserta bukti foto dan tanda tangan akan disimpan langsung ke perangkat Anda sebagai file PDF offline.',
              details: [
                { label: 'Nomor WO', value: woCode },
                { label: 'Lokasi', value: report.projectName },
                { label: 'Dokumentasi', value: `${report.photos.length} Foto & Pengesahan` },
              ],
              confirmLabel: 'Ya, Unduh PDF',
              onConfirm: handleDownloadPdf,
            })
          }
          className="w-full min-h-[46px] px-4 rounded-xl bg-[var(--tl-primary)] hover:bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)] text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
        >
          <Download size={16} />
          <span>{downloadingPdf ? 'Menyiapkan PDF Offline...' : 'Unduh Salinan PDF (Offline)'}</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              confirmAction({
                tone: 'primary',
                title: 'Kirim Ringkasan via WhatsApp?',
                description: 'Anda akan membuka WhatsApp dengan draf resmi Berita Acara untuk dikirim ke PIC lokasi.',
                details: [
                  { label: 'Penerima / PIC', value: report.customerName || 'Perwakilan Lokasi' },
                  { label: 'Nomor WA', value: report.customerPhone || 'Pilih kontak di WhatsApp' },
                  { label: 'Nomor WO', value: woCode },
                ],
                confirmLabel: 'Buka WhatsApp',
                confirmHref: waHref,
              })
            }
            className="min-h-[42px] px-3 rounded-xl bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)] text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <MessageCircle size={15} />
            <span className="truncate">Kirim WA PIC</span>
          </button>

          <button
            type="button"
            onClick={handleCopyWaDraft}
            className="min-h-[42px] px-3 rounded-xl bg-[var(--tl-low)] hover:bg-[var(--tl-container)] text-[var(--tl-text)] text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform cursor-pointer"
          >
            {copiedWa ? <Check size={15} className="text-[var(--tl-secondary)]" /> : <Copy size={15} />}
            <span>{copiedWa ? 'Tersalin' : 'Salin Pesan WA'}</span>
          </button>
        </div>
      </div>

      <ConfirmActionModal request={confirmRequest} onClose={closeConfirm} />
    </div>
  );
};
