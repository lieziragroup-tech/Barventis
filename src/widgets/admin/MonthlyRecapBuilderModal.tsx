import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, Download, RefreshCw } from 'lucide-react';
import type { WorkReport } from '@/entities/types';
import {
  PEST_CATALOG_26,
  TERMITE_CATALOG_AR,
  RoomPestEntry,
  PermenkesToggleConfig,
  PermenkesCalculationInput,
  EditableRecapNarratives,
  ReportCategoryMode,
  buildFilteredRecapMatrix,
  calculatePermenkesMetrics,
  generateEditableRecapNarrative,
  canGenerateMonthlyRecap,
  extractEntriesFromWorkReports,
} from '@/shared/lib/permenkesRecapEngine';
import { exportMonthlyRecapToPdf } from '@/shared/utils/pdfExport';

interface MonthlyRecapBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string | null;
  companyId?: string | null;
  defaultCompilerName?: string;
  availableCustomers: string[];
  reports: WorkReport[];
  initialCategoryMode?: ReportCategoryMode;
}

const DEFAULT_PCO_ENTRIES: RoomPestEntry[] = [
  {
    id: 'pco-1',
    buildingName: 'GEDUNG A',
    floorOrZone: 'Lantai 1',
    roomName: 'Instalasi Gizi / Dapur',
    pestName: 'Kecoa',
    quantity: 4,
    source: 'manual',
    categoryMode: 'PCO',
  },
  {
    id: 'pco-2',
    buildingName: 'GEDUNG A',
    floorOrZone: 'Lantai 11',
    roomName: 'Ruang Rapat VVIP',
    pestName: 'Semut',
    quantity: 12,
    source: 'manual',
    categoryMode: 'PCO',
  },
  {
    id: 'pco-3',
    buildingName: 'GEDUNG B',
    floorOrZone: 'Lantai 12',
    roomName: 'Pantry & Koridor',
    pestName: 'Semut',
    quantity: 35,
    source: 'manual',
    categoryMode: 'PCO',
  },
  {
    id: 'pco-4',
    buildingName: 'AREA LUAR',
    floorOrZone: 'Perimeter',
    roomName: 'TPS & Saluran',
    pestName: 'Lalat',
    quantity: 35,
    source: 'manual',
    categoryMode: 'PCO',
  },
  {
    id: 'pco-5',
    buildingName: 'GEDUNG A',
    floorOrZone: 'Lantai Dasar',
    roomName: 'Lobby & Koridor IGD',
    pestName: 'Nyamuk',
    quantity: 18,
    source: 'manual',
    categoryMode: 'PCO',
  },
  {
    id: 'pco-6',
    buildingName: 'GEDUNG B',
    floorOrZone: 'Basement 1',
    roomName: 'Gudang & Jalur Pipa',
    pestName: 'Tikus',
    quantity: 5,
    source: 'manual',
    categoryMode: 'PCO',
  },
];

const DEFAULT_AR_ENTRIES: RoomPestEntry[] = [
  {
    id: 'ar-1',
    buildingName: 'GEDUNG A',
    floorOrZone: 'Lantai Dasar',
    roomName: 'Jalur Pondasi Keliling',
    pestName: 'Titik Drilling & Injeksi Pondasi',
    quantity: 85,
    source: 'manual',
    categoryMode: 'AR',
  },
  {
    id: 'ar-2',
    buildingName: 'GEDUNG B',
    floorOrZone: 'Basement 1',
    roomName: 'Gudang Arsip & Panel Kayu',
    pestName: 'Jalur Kembara / Mud Tubes Aktif',
    quantity: 2,
    source: 'manual',
    categoryMode: 'AR',
  },
  {
    id: 'ar-3',
    buildingName: 'AREA LUAR',
    floorOrZone: 'Perimeter Taman',
    roomName: 'Jalur Stasiun Umpan IG',
    pestName: 'Bait Station In-Ground (IG) Positif',
    quantity: 1,
    source: 'manual',
    categoryMode: 'AR',
  },
];

export const MonthlyRecapBuilderModal: React.FC<MonthlyRecapBuilderModalProps> = ({
  isOpen,
  onClose,
  userRole,
  companyId,
  defaultCompilerName = 'Admin Operasional',
  availableCustomers,
  reports,
  initialCategoryMode = 'PCO',
}) => {
  const [categoryMode, setCategoryMode] = useState<ReportCategoryMode>(initialCategoryMode);
  const isTermite = categoryMode === 'AR';
  const activeCatalog = isTermite ? TERMITE_CATALOG_AR : PEST_CATALOG_26;

  const [customerName, setCustomerName] = useState<string>(
    availableCustomers[0] || 'RS PON Prof. Dr. dr. Mahar Mardjono'
  );
  const [periodLabel, setPeriodLabel] = useState<string>('Oktober 2026');
  const [compilerName, setCompilerName] = useState<string>(defaultCompilerName);
  const [supervisorName, setSupervisorName] = useState<string>('Rafi Musyaffa Ahmad');

  // Rule #1: Hybrid Data Source (bisa tarik dari kunjungan + tambah/edit manual)
  const [entries, setEntries] = useState<RoomPestEntry[]>(() =>
    initialCategoryMode === 'AR' ? DEFAULT_AR_ENTRIES : DEFAULT_PCO_ENTRIES
  );

  // Input baris manual dengan Dropdown (Rule #3)
  const [buildingName, setBuildingName] = useState('GEDUNG A');
  const [floorOrZone, setFloorOrZone] = useState('Lantai 1');
  const [roomName, setRoomName] = useState('');
  const [selectedPest, setSelectedPest] = useState<string>(activeCatalog[0]);
  const [quantity, setQuantity] = useState<number>(1);
  const [exporting, setExporting] = useState(false);

  // Toggle Kalkulasi Permenkes No. 2 Tahun 2023 (PCO) & Evaluasi Struktur/Baiting (AR)
  const [toggles, setToggles] = useState<PermenkesToggleConfig>({
    enableRatSuccessTrap: true,
    enableCockroachIndex: true,
    enableMosquitoMbr: true,
    enableFlyIndex: false,
    enableLarvaFreeIndex: false,
    enableTermiteBaitInfestation: true,
    enableTermiteStructureProtection: true,
    enableTermiteDrillingRealization: true,
    showSbmklComplianceBadge: true,
  });

  const [calcInput, setCalcInput] = useState<PermenkesCalculationInput>({
    workDaysInMonth: 26,
    ratTrapsPerDay: 7,
    cockroachTrapsPerDay: 2,
    mosquitoCatchersCount: 4,
    mosquitoCatchDurationHours: 1.5,
    mosquitoMonthlyMultiplier: 8,
    flygrillTop5Readings: [1, 1, 1, 0, 0],
    totalInspectedRoomsForLarva: 40,
    positiveLarvaRoomsCount: 0,
    totalBaitStationsInstalled: 24,
    totalStructureZonesInspected: 30,
    plannedDrillingPoints: 85,
    termiticideLitersUsed: 212.5,
  });

  const filteredMatrix = useMemo(() => buildFilteredRecapMatrix(entries), [entries]);

  const metrics = useMemo(
    () => calculatePermenkesMetrics(filteredMatrix, calcInput, toggles, categoryMode),
    [filteredMatrix, calcInput, toggles, categoryMode]
  );

  const [narratives, setNarratives] = useState<EditableRecapNarratives>(() =>
    generateEditableRecapNarrative(filteredMatrix, metrics, periodLabel, initialCategoryMode)
  );

  if (!isOpen) return null;

  // Rule #2: Hanya Admin yang dapat men-generate Laporan Rekapitulasi Bulanan
  if (!canGenerateMonthlyRecap(userRole)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-2xl border border-[var(--border-subtle)]"
          onClick={e => e.stopPropagation()}
        >
          <h3 className="text-base font-bold text-[var(--text-primary)]">Akses Terbatas</h3>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Pembuatan Laporan Rekapitulasi Bulanan (Pest Control maupun Anti Rayap) hanya dapat dilakukan oleh Admin.
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSwitchCategoryMode = (nextMode: ReportCategoryMode) => {
    setCategoryMode(nextMode);
    const nextCatalog = nextMode === 'AR' ? TERMITE_CATALOG_AR : PEST_CATALOG_26;
    setSelectedPest(nextCatalog[0]);
    const defaultRows = nextMode === 'AR' ? DEFAULT_AR_ENTRIES : DEFAULT_PCO_ENTRIES;
    setEntries(defaultRows);
    const nextMatrix = buildFilteredRecapMatrix(defaultRows);
    const nextMetrics = calculatePermenkesMetrics(nextMatrix, calcInput, toggles, nextMode);
    setNarratives(generateEditableRecapNarrative(nextMatrix, nextMetrics, periodLabel, nextMode));
  };

  const handlePullFromVisits = () => {
    const pulled = extractEntriesFromWorkReports(reports, customerName, categoryMode);
    if (pulled.length === 0) {
      alert(
        `Belum ditemukan data kunjungan kategori ${categoryMode === 'AR' ? 'Anti Rayap' : 'Pest Control'} (> 0) untuk "${customerName}". Anda tetap dapat mengisi atau mengedit baris secara manual di bawah.`
      );
      return;
    }
    setEntries(prev => {
      const manualOnly = prev.filter(item => item.source === 'manual');
      const next = [...pulled, ...manualOnly];
      const nextMatrix = buildFilteredRecapMatrix(next);
      const nextMetrics = calculatePermenkesMetrics(nextMatrix, calcInput, toggles, categoryMode);
      setNarratives(generateEditableRecapNarrative(nextMatrix, nextMetrics, periodLabel, categoryMode));
      return next;
    });
  };

  const handleAddManualRow = () => {
    if (!roomName.trim() || quantity <= 0) return;
    const newEntry: RoomPestEntry = {
      id: `manual-${Date.now()}`,
      buildingName: buildingName.trim() || 'GEDUNG UTAMA',
      floorOrZone: floorOrZone.trim() || (isTermite ? 'Pondasi / Lantai 1' : 'Lantai 1'),
      roomName: roomName.trim(),
      pestName: selectedPest,
      quantity: Number(quantity),
      source: 'manual',
      categoryMode,
    };
    const next = [...entries, newEntry];
    setEntries(next);
    setRoomName('');
    setQuantity(1);
    const nextMatrix = buildFilteredRecapMatrix(next);
    const nextMetrics = calculatePermenkesMetrics(nextMatrix, calcInput, toggles, categoryMode);
    setNarratives(generateEditableRecapNarrative(nextMatrix, nextMetrics, periodLabel, categoryMode));
  };

  const handleRemoveEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleRegenerateNarratives = () => {
    setNarratives(generateEditableRecapNarrative(filteredMatrix, metrics, periodLabel, categoryMode));
  };

  const handleDownloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportMonthlyRecapToPdf({
        userRole,
        categoryMode,
        companyId,
        customerName: customerName.trim() || 'Pelanggan',
        periodLabel: periodLabel.trim() || 'Oktober 2026',
        compilerName: compilerName.trim() || 'Admin Operasional',
        supervisorName: supervisorName.trim() || 'Supervisor Operasional',
        entries,
        toggles,
        calcInput,
        narratives,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto text-[var(--text-primary)] space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header & Pemilih Mode: Pest Control (PCO) vs Anti Rayap (AR) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
              {isTermite
                ? 'Laporan Rekapitulasi Pengendalian & Monitoring Anti Rayap (AR)'
                : 'Laporan Rekapitulasi Bulanan Pest Control & Kalkulator Permenkes (PCO)'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Khusus Admin • Mode Hybrid (Tarik Kunjungan / Input Manual) • Hanya menampilkan data &gt; 0
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-1">
              <button
                type="button"
                onClick={() => handleSwitchCategoryMode('PCO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  !isTermite
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Laporan Pest Control (PCO)
              </button>
              <button
                type="button"
                onClick={() => handleSwitchCategoryMode('AR')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  isTermite
                    ? 'bg-purple-700 text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Laporan Anti Rayap (AR)
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Identitas Laporan */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-[var(--bg-tertiary)] p-3.5 rounded-xl border border-[var(--border-subtle)] text-xs">
          <div>
            <label className="block font-bold text-[var(--text-secondary)] mb-1">Nama Klien / Instansi</label>
            <input
              type="text"
              list="recap-customer-list"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Ketik atau pilih nama klien..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]"
            />
            <datalist id="recap-customer-list">
              {availableCustomers.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block font-bold text-[var(--text-secondary)] mb-1">Periode Bulan</label>
            <input
              type="text"
              value={periodLabel}
              onChange={e => setPeriodLabel(e.target.value)}
              placeholder="Oktober 2026"
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]"
            />
          </div>
          <div>
            <label className="block font-bold text-[var(--text-secondary)] mb-1">Disusun Oleh (Cover)</label>
            <input
              type="text"
              value={compilerName}
              onChange={e => setCompilerName(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]"
            />
          </div>
          <div>
            <label className="block font-bold text-[var(--text-secondary)] mb-1">Supervisor Penandatangan</label>
            <input
              type="text"
              value={supervisorName}
              onChange={e => setSupervisorName(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]"
            />
          </div>
        </div>

        {/* 1. Sumber Data Hybrid: Tarik Kunjungan + Input Manual Dropdown */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
              {isTermite
                ? '1. Input Pemeriksaan & Perlakuan Anti Rayap per Struktur/Zona (Hybrid & Filter > 0)'
                : '1. Input Temuan Hama Pest Control per Ruangan (Hybrid & Filter > 0)'}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePullFromVisits}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer ${
                  isTermite
                    ? 'border-purple-600 bg-purple-50 text-purple-800 hover:bg-purple-100'
                    : 'border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <RefreshCw size={12} /> Tarik Data Kunjungan {isTermite ? 'Anti Rayap' : 'Pest Control'}
              </button>
              {entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEntries([])}
                  className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                >
                  Kosongkan Tabel
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3 sm:grid-cols-6 text-xs">
            <input
              type="text"
              value={buildingName}
              onChange={e => setBuildingName(e.target.value)}
              placeholder="Gedung (mis. GEDUNG A)"
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5"
            />
            <input
              type="text"
              value={floorOrZone}
              onChange={e => setFloorOrZone(e.target.value)}
              placeholder={isTermite ? 'Zona / Lantai' : 'Lantai / Zona'}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5"
            />
            <input
              type="text"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder={isTermite ? 'Struktur (Pondasi/Kusen) *' : 'Nama Ruangan *'}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5"
            />
            <select
              value={selectedPest}
              onChange={e => setSelectedPest(e.target.value)}
              aria-label="Pilih Jenis Hama atau Parameter Rayap"
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 font-semibold"
            >
              {activeCatalog.map(pest => (
                <option key={pest} value={pest}>
                  {pest}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              placeholder={isTermite ? 'Titik/Unit (> 0)' : 'Jumlah (> 0)'}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 font-mono"
            />
            <button
              type="button"
              onClick={handleAddManualRow}
              className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 font-bold text-white cursor-pointer ${
                isTermite ? 'bg-purple-700 hover:bg-purple-800' : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
              }`}
            >
              <Plus size={13} /> Tambah Baris
            </button>
          </div>

          {/* Preview Tabel Rekapitulasi (Hanya > 0) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <div className="bg-[var(--bg-tertiary)] px-3 py-2 text-[11px] font-bold uppercase text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                {isTermite
                  ? `Rekapitulasi Indikasi & Perlakuan Anti Rayap (> 0) — ${filteredMatrix.activePests.length} Parameter Aktif`
                  : `Rekapitulasi Hama Pest Control (> 0 Ekor) — ${filteredMatrix.activePests.length} Jenis Hama Aktif`}
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-tertiary)]/60 text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-3 py-2">No</th>
                    <th className="px-3 py-2">{isTermite ? 'Indikasi / Perlakuan (> 0)' : 'Jenis Hama (> 0)'}</th>
                    <th className="px-3 py-2 text-right">{isTermite ? 'Titik/Unit' : 'Jumlah'}</th>
                    <th className="px-3 py-2">{isTermite ? 'Struktur / Area' : 'Ruangan'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredMatrix.summaryRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-[var(--text-muted)]">
                        Belum ada data terdata (&gt; 0).
                      </td>
                    </tr>
                  ) : (
                    filteredMatrix.summaryRows.map(row => (
                      <tr key={row.pestName}>
                        <td className="px-3 py-2 font-mono">{row.no}</td>
                        <td className="px-3 py-2 font-bold">{row.pestName}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600">
                          {row.totalQuantity}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                          {row.roomsSummary}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] max-h-56">
              <div className="bg-[var(--bg-tertiary)] px-3 py-2 text-[11px] font-bold uppercase text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                Rincian Baris Lokasi ({entries.length} entri)
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-tertiary)]/60 text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-2.5 py-1.5">Lokasi / Struktur</th>
                    <th className="px-2.5 py-1.5">{isTermite ? 'Parameter Rayap' : 'Hama'}</th>
                    <th className="px-2.5 py-1.5 text-right">Qty</th>
                    <th className="px-2.5 py-1.5 text-right">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {entries.map(item => (
                    <tr key={item.id}>
                      <td className="px-2.5 py-1.5 text-[11px]">
                        <span className="font-semibold">{item.buildingName}</span> • {item.floorOrZone} •{' '}
                        {item.roomName}
                      </td>
                      <td className="px-2.5 py-1.5 font-semibold">{item.pestName}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-bold">{item.quantity}</td>
                      <td className="px-2.5 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveEntry(item.id)}
                          className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 2. Kalkulator Indikator (Permenkes 2023 untuk PCO vs Evaluasi Proteksi & Baiting untuk AR) */}
        <div className="rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                {isTermite
                  ? '2. Kalkulator Evaluasi Stasiun Umpan, Barier Injeksi & Proteksi Struktur Anti Rayap'
                  : '2. Kalkulator Baku Mutu Permenkes No. 2 Tahun 2023 (Khusus Pest Control)'}
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Centang parameter perhitungan yang ingin ditampilkan di dalam laporan PDF.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={toggles.showSbmklComplianceBadge}
                onChange={e =>
                  setToggles(prev => ({ ...prev, showSbmklComplianceBadge: e.target.checked }))
                }
              />
              <span>Tampilkan Status Evaluasi Standar</span>
            </label>
          </div>

          {!isTermite ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-[var(--bg-tertiary)] p-3 rounded-xl text-xs">
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  Hari Kerja / Bulan
                </label>
                <input
                  type="number"
                  min={1}
                  value={calcInput.workDaysInMonth}
                  onChange={e =>
                    setCalcInput(prev => ({ ...prev, workDaysInMonth: Math.max(1, Number(e.target.value) || 26) }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  Perangkap Tikus / Hari
                </label>
                <input
                  type="number"
                  min={1}
                  value={calcInput.ratTrapsPerDay}
                  onChange={e =>
                    setCalcInput(prev => ({ ...prev, ratTrapsPerDay: Math.max(1, Number(e.target.value) || 7) }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  Sticky Trap Kecoa / Hari
                </label>
                <input
                  type="number"
                  min={1}
                  value={calcInput.cockroachTrapsPerDay}
                  onChange={e =>
                    setCalcInput(prev => ({
                      ...prev,
                      cockroachTrapsPerDay: Math.max(1, Number(e.target.value) || 2),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  Penangkap Nyamuk (Org)
                </label>
                <input
                  type="number"
                  min={1}
                  value={calcInput.mosquitoCatchersCount}
                  onChange={e =>
                    setCalcInput(prev => ({
                      ...prev,
                      mosquitoCatchersCount: Math.max(1, Number(e.target.value) || 4),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  Durasi Tangkap (Jam)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  value={calcInput.mosquitoCatchDurationHours}
                  onChange={e =>
                    setCalcInput(prev => ({
                      ...prev,
                      mosquitoCatchDurationHours: Math.max(0.5, Number(e.target.value) || 1.5),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[var(--bg-tertiary)] p-3 rounded-xl text-xs">
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  Total Bait Station Dipasang
                </label>
                <input
                  type="number"
                  min={1}
                  value={calcInput.totalBaitStationsInstalled ?? 24}
                  onChange={e =>
                    setCalcInput(prev => ({
                      ...prev,
                      totalBaitStationsInstalled: Math.max(1, Number(e.target.value) || 24),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  Total Zona Struktur Diperiksa
                </label>
                <input
                  type="number"
                  min={1}
                  value={calcInput.totalStructureZonesInspected ?? 30}
                  onChange={e =>
                    setCalcInput(prev => ({
                      ...prev,
                      totalStructureZonesInspected: Math.max(1, Number(e.target.value) || 30),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  Target Titik Bor Pondasi
                </label>
                <input
                  type="number"
                  min={1}
                  value={calcInput.plannedDrillingPoints ?? 85}
                  onChange={e =>
                    setCalcInput(prev => ({
                      ...prev,
                      plannedDrillingPoints: Math.max(1, Number(e.target.value) || 85),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  Larutan Termitisida (Liter)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={1}
                  value={calcInput.termiticideLitersUsed ?? 212.5}
                  onChange={e =>
                    setCalcInput(prev => ({
                      ...prev,
                      termiticideLitersUsed: Math.max(1, Number(e.target.value) || 212.5),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {metrics.map(metric => (
              <label
                key={metric.key}
                className={`rounded-xl border p-3 text-xs cursor-pointer transition-all ${
                  metric.enabled
                    ? isTermite
                      ? 'border-purple-500/60 bg-purple-500/5'
                      : 'border-emerald-500/60 bg-emerald-500/5'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[var(--text-primary)]">{metric.title}</span>
                  <input
                    type="checkbox"
                    checked={metric.enabled}
                    onChange={e => {
                      const checked = e.target.checked;
                      setToggles(prev => ({
                        ...prev,
                        enableRatSuccessTrap:
                          metric.key === 'rat_success_trap' ? checked : prev.enableRatSuccessTrap,
                        enableCockroachIndex:
                          metric.key === 'cockroach_index' ? checked : prev.enableCockroachIndex,
                        enableMosquitoMbr:
                          metric.key === 'mosquito_mbr' ? checked : prev.enableMosquitoMbr,
                        enableFlyIndex:
                          metric.key === 'fly_index' ? checked : prev.enableFlyIndex,
                        enableLarvaFreeIndex:
                          metric.key === 'larva_abj' ? checked : prev.enableLarvaFreeIndex,
                        enableTermiteBaitInfestation:
                          metric.key === 'termite_bait_rate'
                            ? checked
                            : prev.enableTermiteBaitInfestation,
                        enableTermiteStructureProtection:
                          metric.key === 'termite_protection_index'
                            ? checked
                            : prev.enableTermiteStructureProtection,
                        enableTermiteDrillingRealization:
                          metric.key === 'termite_drilling_realization'
                            ? checked
                            : prev.enableTermiteDrillingRealization,
                      }));
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{metric.calculationBreakdown}</p>
                {toggles.showSbmklComplianceBadge && (
                  <p
                    className={`mt-1.5 text-[11px] font-bold ${
                      metric.isCompliant ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {metric.statusLabel}
                  </p>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* 3. Narasi Otomatis & Edit Manual */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
              3. Narasi Analisa, Saran &amp; Rencana Tindak Lanjut ({isTermite ? 'Khusus Anti Rayap' : 'Khusus Pest Control'})
            </h3>
            <button
              type="button"
              onClick={handleRegenerateNarratives}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90 cursor-pointer"
            >
              Susun Ulang Draf Otomatis
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                {isTermite ? 'Analisa Rayap Tanah & Subterranean' : 'Analisa Tikus & Kucing'}
              </label>
              <textarea
                rows={3}
                value={narratives.analisaTikusDanKucing}
                onChange={e =>
                  setNarratives(prev => ({ ...prev, analisaTikusDanKucing: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5"
              />
            </div>
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                {isTermite ? 'Analisa Rayap Kayu Kering & Struktur Kayu' : 'Analisa Hama Kecoa & Semut'}
              </label>
              <textarea
                rows={3}
                value={narratives.analisaKecoaDanSemut}
                onChange={e =>
                  setNarratives(prev => ({ ...prev, analisaKecoaDanSemut: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5"
              />
            </div>
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                {isTermite
                  ? 'Evaluasi Barier Injeksi & Stasiun Umpan (Baiting)'
                  : 'Analisa Serangga Lalat & Nyamuk'}
              </label>
              <textarea
                rows={3}
                value={narratives.analisaLalatDanNyamuk}
                onChange={e =>
                  setNarratives(prev => ({ ...prev, analisaLalatDanNyamuk: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5"
              />
            </div>
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                {isTermite ? 'Status Perlindungan & Masa Garansi Bangunan' : 'Analisa Hama Lainnya (> 0)'}
              </label>
              <textarea
                rows={3}
                value={narratives.analisaHamaLainnya}
                onChange={e =>
                  setNarratives(prev => ({ ...prev, analisaHamaLainnya: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5"
              />
            </div>
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                {isTermite ? 'Saran Perbaikan Fisik & Kelembaban' : 'Saran / Rekomendasi'}
              </label>
              <textarea
                rows={3}
                value={narratives.saranRekomendasi}
                onChange={e =>
                  setNarratives(prev => ({ ...prev, saranRekomendasi: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5"
              />
            </div>
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                {isTermite ? 'Rencana Tindak Lanjut & Jadwal Kontrol Garansi' : 'Rencana Tindak Lanjut'}
              </label>
              <textarea
                rows={3}
                value={narratives.rencanaTindakLanjut}
                onChange={e =>
                  setNarratives(prev => ({ ...prev, rencanaTindakLanjut: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={handleDownloadPdf}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer ${
              isTermite ? 'bg-purple-700 hover:bg-purple-800' : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
            }`}
          >
            <Download size={14} />
            {exporting
              ? 'Membuat PDF Rekapitulasi...'
              : isTermite
              ? 'Unduh PDF Rekapitulasi Anti Rayap'
              : 'Unduh PDF Rekapitulasi Pest Control'}
          </button>
        </div>
      </div>
    </div>
  );
};
