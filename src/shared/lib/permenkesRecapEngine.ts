import type { WorkReport, ServiceType } from '@/entities/types';

export type ReportCategoryMode = 'PCO' | 'AR';

/**
 * Deteksi otomatis apakah sebuah layanan/laporan termasuk Anti Rayap (AR) atau Pest Control (PCO).
 */
export function resolveReportCategoryMode(serviceType?: ServiceType | string | null): ReportCategoryMode {
  const norm = String(serviceType || '').toUpperCase().trim();
  if (norm === 'TERMITE_CONTROL' || norm === 'AR' || norm.includes('RAYAP') || norm.includes('TERMITE')) {
    return 'AR';
  }
  return 'PCO';
}

/**
 * Katalog 26 Jenis Hama Standar untuk Laporan Pest Control (PCO)
 * (Acuan: Laporan Pest Control RSPON & Permenkes No. 2 Tahun 2023)
 */
export const PEST_CATALOG_26 = [
  'Kecoa',
  'Lalat',
  'Nyamuk',
  'Semut',
  'Tikus',
  'Kumbang / Kupu-Kupu',
  'Kutu',
  'Kelelawar',
  'Kelabang',
  'Kaki Seribu',
  'Kucing',
  'Tawon',
  'Laron',
  'Rayap',
  'Lalat Limbah',
  'Laba-Laba',
  'Lebah',
  'Tokek',
  'Ulat',
  'Keong',
  'Musang',
  'Ular',
  'Cacing',
  'Anjing',
  'Burung',
  'Biawak',
] as const;

/**
 * Katalog Parameter & Indikasi Khusus untuk Laporan Anti Rayap (Termite Control / AR)
 */
export const TERMITE_CATALOG_AR = [
  'Rayap Tanah (Coptotermes sp.)',
  'Rayap Kayu Kering (Cryptotermes sp.)',
  'Rayap Subterranean (Macrotermes sp.)',
  'Jalur Kembara / Mud Tubes Aktif',
  'Bait Station In-Ground (IG) Positif',
  'Bait Station Above-Ground (AG) Positif',
  'Titik Drilling & Injeksi Pondasi',
  'Perlakuan Soil Treatment / Pipanisasi',
  'Spraying Kuda-Kuda / Plafon / Kusen',
] as const;

export type StandardPestName = (typeof PEST_CATALOG_26)[number] | (typeof TERMITE_CATALOG_AR)[number] | string;

export interface RoomPestEntry {
  id: string;
  buildingName: string;
  floorOrZone: string;
  roomName: string;
  pestName: StandardPestName;
  quantity: number;
  treatmentMethod?: string;
  notes?: string;
  source: 'visit_pull' | 'manual';
  categoryMode?: ReportCategoryMode;
}

export interface ActivePestSummaryRow {
  no: number;
  pestName: string;
  totalQuantity: number;
  roomsSummary: string;
  infectedAreaCount: number;
}

export interface RoomMatrixRow {
  buildingName: string;
  floorOrZone: string;
  roomName: string;
  countsByActivePest: Record<string, number>;
  rowTotal: number;
}

export interface FilteredRecapMatrix {
  /** Hanya daftar hama/indikasi yang memiliki totalQuantity > 0 */
  activePests: string[];
  /** Baris Tabel Rekapitulasi (Halaman 2) — hanya yang > 0 */
  summaryRows: ActivePestSummaryRow[];
  /** Baris Matriks Rincian Gedung/Ruangan — hanya ruangan & kolom > 0 */
  roomRows: RoomMatrixRow[];
  /** Total per kolom hama/indikasi aktif */
  totalsByPest: Record<string, number>;
  /** Total keseluruhan temuan (> 0) */
  grandTotalQuantity: number;
  /** Total titik/ruangan unik yang memiliki temuan (> 0) */
  totalInfectedRooms: number;
}

export interface PermenkesToggleConfig {
  // Toggle untuk Mode Pest Control (PCO)
  enableRatSuccessTrap: boolean;
  enableCockroachIndex: boolean;
  enableMosquitoMbr: boolean;
  enableFlyIndex: boolean;
  enableLarvaFreeIndex: boolean;
  // Toggle khusus Mode Anti Rayap (AR)
  enableTermiteBaitInfestation?: boolean;
  enableTermiteStructureProtection?: boolean;
  enableTermiteDrillingRealization?: boolean;
  showSbmklComplianceBadge: boolean;
}

export interface PermenkesCalculationInput {
  workDaysInMonth: number;
  ratTrapsPerDay: number;
  ratCaughtCount?: number;
  cockroachTrapsPerDay: number;
  cockroachCaughtCount?: number;
  mosquitoCatchersCount: number;
  mosquitoCatchDurationHours: number;
  mosquitoMonthlyMultiplier: number;
  mosquitoCaughtCount?: number;
  flygrillTop5Readings?: number[];
  totalInspectedRoomsForLarva?: number;
  positiveLarvaRoomsCount?: number;
  // Parameter khusus Anti Rayap (AR)
  totalBaitStationsInstalled?: number;
  positiveBaitStationsCount?: number;
  totalStructureZonesInspected?: number;
  activeTermiteStructureZonesCount?: number;
  plannedDrillingPoints?: number;
  completedDrillingPoints?: number;
  termiticideLitersUsed?: number;
  warrantyMonths?: number;
}

export interface PermenkesMetricResult {
  key:
    | 'rat_success_trap'
    | 'cockroach_index'
    | 'mosquito_mbr'
    | 'fly_index'
    | 'larva_abj'
    | 'termite_bait_rate'
    | 'termite_protection_index'
    | 'termite_drilling_realization';
  title: string;
  enabled: boolean;
  formulaText: string;
  calculationBreakdown: string;
  numericValue: number;
  secondaryMonthlyValue?: number;
  unit: string;
  sbmklThresholdText: string;
  isCompliant: boolean;
  statusLabel: string;
}

export interface EditableRecapNarratives {
  analisaTikusDanKucing: string;
  analisaKecoaDanSemut: string;
  analisaLalatDanNyamuk: string;
  analisaHamaLainnya: string;
  saranRekomendasi: string;
  rencanaTindakLanjut: string;
}

export interface CustomerRecapPermissionConfig {
  allowMonthlyRecap: boolean;
  defaultBuildings: string[];
  preferredReportMode?: ReportCategoryMode;
}

const RECAP_PERM_STORAGE_KEY = 'gep_customer_recap_permissions_v1';

export function getCustomerRecapPermission(customerName: string): CustomerRecapPermissionConfig {
  const key = (customerName || '').trim().toLowerCase();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RECAP_PERM_STORAGE_KEY) : null;
    if (raw) {
      const map = JSON.parse(raw) as Record<string, CustomerRecapPermissionConfig>;
      if (map[key]) return map[key];
    }
  } catch {
    // ignore storage errors
  }
  const isHospitalOrCorp = /\b(rs|rumah sakit|rspon|rsud|klinik|gedung|pt|hotel|bank|apartemen)\b/i.test(customerName || '');
  return {
    allowMonthlyRecap: isHospitalOrCorp,
    defaultBuildings: ['GEDUNG A', 'GEDUNG B', 'AREA LUAR'],
    preferredReportMode: 'PCO',
  };
}

export function setCustomerRecapPermission(
  customerName: string,
  config: CustomerRecapPermissionConfig
): void {
  const key = (customerName || '').trim().toLowerCase();
  if (!key) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(RECAP_PERM_STORAGE_KEY);
    const map: Record<string, CustomerRecapPermissionConfig> = raw ? JSON.parse(raw) : {};
    map[key] = config;
    localStorage.setItem(RECAP_PERM_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

/**
 * Rule #2: Hanya Admin yang dapat men-generate Laporan Rekapitulasi Bulanan & mengatur kalkulasi Permenkes/AR.
 */
export function canGenerateMonthlyRecap(userRole?: string | null): boolean {
  const norm = String(userRole || '').toUpperCase().trim();
  return norm === 'ADMIN';
}

const FINDINGS_TAG_PREFIX = '[TEMUAN_HAMA_JSON:';

export function serializePestFindingsToNotes(
  cleanNotes: string,
  findings: { pestName: string; quantity: number; treatmentMethod: string; location: string; notes: string }[]
): string {
  const activeOnly = findings.filter(f => f.pestName && Number(f.quantity) > 0);
  const base = (cleanNotes || '').replace(/\[TEMUAN_HAMA_JSON:[^\]]+\]/g, '').trim();
  if (activeOnly.length === 0) return base;
  return `${base} ${FINDINGS_TAG_PREFIX}${JSON.stringify(activeOnly)}]`.trim();
}

export function parsePestFindingsFromNotes(rawNotes?: string | null): {
  cleanNotes: string;
  findings: { pestName: string; quantity: number; treatmentMethod: string; location: string; notes: string }[];
} {
  const text = String(rawNotes || '');
  const match = text.match(/\[TEMUAN_HAMA_JSON:(\[.*?\])\]/);
  const cleanNotes = text.replace(/\[TEMUAN_HAMA_JSON:\[.*?\]\]/g, '').trim();
  if (!match) return { cleanNotes, findings: [] };
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed)) {
      return {
        cleanNotes,
        findings: parsed
          .filter(x => x && x.pestName && Number(x.quantity) > 0)
          .map(x => ({
            pestName: String(x.pestName),
            quantity: Number(x.quantity) || 0,
            treatmentMethod: String(x.treatmentMethod || 'Monitoring & Treatment'),
            location: String(x.location || 'Area Umum'),
            notes: String(x.notes || '-'),
          })),
      };
    }
  } catch {
    // ignore malformed tag
  }
  return { cleanNotes, findings: [] };
}

/**
 * Rule #1 (Hybrid Pull): Menarik data temuan (> 0) dari kumpulan WorkReport kunjungan teknisi,
 * dan dapat difilter sesuai kategori laporan ('PCO' vs 'AR').
 */
export function extractEntriesFromWorkReports(
  reports: WorkReport[],
  clientNameFilter?: string,
  categoryMode?: ReportCategoryMode
): RoomPestEntry[] {
  const entries: RoomPestEntry[] = [];
  const filterNorm = (clientNameFilter || '').trim().toLowerCase();

  for (const r of reports) {
    const reportMode = resolveReportCategoryMode(r.serviceType);
    if (categoryMode && reportMode !== categoryMode) continue;

    const cName = (r.clientName || r.projectName || '').trim();
    if (filterNorm && !cName.toLowerCase().includes(filterNorm)) continue;

    const parsed = parsePestFindingsFromNotes(r.treatmentRecord?.technicianNotes || r.notes);
    if (parsed.findings.length > 0) {
      parsed.findings.forEach((f, idx) => {
        if (Number(f.quantity) > 0) {
          const locParts = (f.location || 'GEDUNG UTAMA - Lantai 1 - Area Layanan')
            .split(/[-/>,]/)
            .map(s => s.trim())
            .filter(Boolean);
          entries.push({
            id: `pull-${r.id}-${idx}`,
            buildingName: locParts[0] || 'GEDUNG UTAMA',
            floorOrZone: locParts[1] || 'Lantai 1',
            roomName: locParts.slice(2).join(' ') || locParts[0] || r.projectName,
            pestName: f.pestName,
            quantity: Number(f.quantity),
            treatmentMethod: f.treatmentMethod,
            notes: f.notes,
            source: 'visit_pull',
            categoryMode: reportMode,
          });
        }
      });
    } else if (reportMode === 'AR' && r.treatmentRecord?.drillingPointsCount && r.treatmentRecord.drillingPointsCount > 0) {
      entries.push({
        id: `pull-ar-${r.id}`,
        buildingName: 'GEDUNG UTAMA',
        floorOrZone: 'Pondasi & Lantai Dasar',
        roomName: r.projectName || 'Jalur Pondasi',
        pestName: 'Titik Drilling & Injeksi Pondasi',
        quantity: Number(r.treatmentRecord.drillingPointsCount),
        treatmentMethod: r.treatmentRecord.applicationMethod,
        notes: r.treatmentRecord.technicianNotes || '-',
        source: 'visit_pull',
        categoryMode: 'AR',
      });
    }
  }
  return entries;
}

/**
 * Rule #1 & Rule #3: Menggabungkan data Hybrid (visit_pull + manual) dan
 * HANYA memvisualisasikan/menampilkan hama/indikasi dengan jumlah > 0.
 */
export function buildFilteredRecapMatrix(entries: RoomPestEntry[]): FilteredRecapMatrix {
  const validEntries = entries.filter(
    item => item && item.pestName && Number(item.quantity) > 0
  );

  const pestTotalsMap = new Map<string, number>();
  const pestRoomsMap = new Map<string, Set<string>>();

  for (const entry of validEntries) {
    const pest = entry.pestName.trim();
    const qty = Number(entry.quantity) || 0;
    pestTotalsMap.set(pest, (pestTotalsMap.get(pest) || 0) + qty);

    const roomLabel = [entry.buildingName, entry.floorOrZone, entry.roomName]
      .map(s => (s || '').trim())
      .filter(Boolean)
      .join(' - ');
    if (!pestRoomsMap.has(pest)) {
      pestRoomsMap.set(pest, new Set());
    }
    if (roomLabel) {
      pestRoomsMap.get(pest)!.add(roomLabel);
    }
  }

  const combinedCatalog = [...PEST_CATALOG_26, ...TERMITE_CATALOG_AR];
  const catalogOrder = new Map<string, number>(
    combinedCatalog.map((name, index) => [name.toLowerCase(), index])
  );

  const activePests = Array.from(pestTotalsMap.entries())
    .filter(([, total]) => total > 0)
    .sort((a, b) => {
      const idxA = catalogOrder.get(a[0].toLowerCase()) ?? 999;
      const idxB = catalogOrder.get(b[0].toLowerCase()) ?? 999;
      if (idxA !== idxB) return idxA - idxB;
      return a[0].localeCompare(b[0]);
    })
    .map(([pestName]) => pestName);

  const totalsByPest: Record<string, number> = {};
  const summaryRows: ActivePestSummaryRow[] = activePests.map((pestName, idx) => {
    const totalQuantity = pestTotalsMap.get(pestName) || 0;
    totalsByPest[pestName] = totalQuantity;
    const roomsSet = pestRoomsMap.get(pestName) || new Set<string>();
    return {
      no: idx + 1,
      pestName,
      totalQuantity,
      roomsSummary: Array.from(roomsSet).join(', ') || '-',
      infectedAreaCount: roomsSet.size,
    };
  });

  const roomKeyMap = new Map<string, RoomMatrixRow>();
  for (const entry of validEntries) {
    const bld = (entry.buildingName || 'GEDUNG UTAMA').trim();
    const flr = (entry.floorOrZone || 'Lantai 1').trim();
    const rm = (entry.roomName || 'Area Layanan').trim();
    const key = `${bld}||${flr}||${rm}`;

    if (!roomKeyMap.has(key)) {
      const initialCounts: Record<string, number> = {};
      for (const pest of activePests) {
        initialCounts[pest] = 0;
      }
      roomKeyMap.set(key, {
        buildingName: bld,
        floorOrZone: flr,
        roomName: rm,
        countsByActivePest: initialCounts,
        rowTotal: 0,
      });
    }

    const row = roomKeyMap.get(key)!;
    const pest = entry.pestName.trim();
    const qty = Number(entry.quantity) || 0;
    row.countsByActivePest[pest] = (row.countsByActivePest[pest] || 0) + qty;
    row.rowTotal += qty;
  }

  const roomRows = Array.from(roomKeyMap.values()).filter(r => r.rowTotal > 0);
  const grandTotalQuantity = Object.values(totalsByPest).reduce((acc, v) => acc + v, 0);

  return {
    activePests,
    summaryRows,
    roomRows,
    totalsByPest,
    grandTotalQuantity,
    totalInfectedRooms: roomRows.length,
  };
}

/**
 * Menghitung rumus Permenkes RI No. 2 Tahun 2023 untuk Mode Pest Control (PCO)
 * ATAU Indikator Teknis Pengendalian & Garansi untuk Mode Anti Rayap (AR).
 */
export function calculatePermenkesMetrics(
  matrix: FilteredRecapMatrix,
  input: PermenkesCalculationInput,
  toggles: PermenkesToggleConfig,
  categoryMode: ReportCategoryMode = 'PCO'
): PermenkesMetricResult[] {
  if (categoryMode === 'AR') {
    return calculateTermiteMetrics(matrix, input, toggles);
  }

  const results: PermenkesMetricResult[] = [];
  const workDays = Math.max(1, Number(input.workDaysInMonth) || 26);

  // 1. Success Trap Tikus (%) — Permenkes No. 2 Tahun 2023 Tabel 25 Hal. 75–76 (< 1%)
  const ratCount =
    input.ratCaughtCount !== undefined
      ? Number(input.ratCaughtCount)
      : matrix.totalsByPest['Tikus'] || 0;
  const totalRatTraps = Math.max(1, (Number(input.ratTrapsPerDay) || 1) * workDays);
  const ratSuccessTrapPct = Number(((ratCount / totalRatTraps) * 100).toFixed(2));
  const ratCompliant = ratSuccessTrapPct < 1.0;

  results.push({
    key: 'rat_success_trap',
    title: 'Success Trap Tikus (%)',
    enabled: toggles.enableRatSuccessTrap,
    formulaText: '(Jumlah perangkap positif tikus / Total perangkap dipasang) × 100%',
    calculationBreakdown: `(${ratCount} ekor / (${input.ratTrapsPerDay} unit/hari × ${workDays} hari = ${totalRatTraps} unit)) × 100% = ${ratSuccessTrapPct}%`,
    numericValue: ratSuccessTrapPct,
    unit: '%',
    sbmklThresholdText: '< 1% (Permenkes No. 2/2023 Tabel 25)',
    isCompliant: ratCompliant,
    statusLabel: ratCompliant
      ? 'Memenuhi Baku Mutu SBMKL (< 1%)'
      : 'Melebihi Baku Mutu SBMKL (>= 1%) — Perlu Intensifikasi Trapping',
  });

  // 2. Indeks Populasi Kecoa — Permenkes No. 2 Tahun 2023 Tabel 24 Hal. 72 & 75 (< 2)
  const cockroachCount =
    input.cockroachCaughtCount !== undefined
      ? Number(input.cockroachCaughtCount)
      : matrix.totalsByPest['Kecoa'] || 0;
  const totalCockroachTraps = Math.max(1, (Number(input.cockroachTrapsPerDay) || 1) * workDays);
  const cockroachIndex = Number((cockroachCount / totalCockroachTraps).toFixed(2));
  const cockroachCompliant = cockroachIndex < 2.0;

  results.push({
    key: 'cockroach_index',
    title: 'Indeks Populasi Kecoa',
    enabled: toggles.enableCockroachIndex,
    formulaText: 'Jumlah kecoa tertangkap / Jumlah perangkap (sticky trap) dipasang',
    calculationBreakdown: `${cockroachCount} ekor / (${input.cockroachTrapsPerDay} trap/hari × ${workDays} hari = ${totalCockroachTraps} trap) = ${cockroachIndex}`,
    numericValue: cockroachIndex,
    unit: 'ekor/trap',
    sbmklThresholdText: '< 2 ekor/trap (Permenkes No. 2/2023 Tabel 24)',
    isCompliant: cockroachCompliant,
    statusLabel: cockroachCompliant
      ? 'Memenuhi Baku Mutu SBMKL (< 2)'
      : 'Melebihi Baku Mutu SBMKL (>= 2) — Perlu Gel Baiting & Residual Spraying',
  });

  // 3. Mosquito Biting Rate (MBR) — Permenkes No. 2 Tahun 2023 Hal. 71–74
  const mosquitoCount =
    input.mosquitoCaughtCount !== undefined
      ? Number(input.mosquitoCaughtCount)
      : matrix.totalsByPest['Nyamuk'] || 0;
  const catchers = Math.max(1, Number(input.mosquitoCatchersCount) || 1);
  const durationHours = Math.max(0.25, Number(input.mosquitoCatchDurationHours) || 1.5);
  const multiplier = Math.max(1, Number(input.mosquitoMonthlyMultiplier) || 8);
  const mbrDaily = Number((mosquitoCount / (catchers * durationHours)).toFixed(2));
  const mbrMonthly = Number((mbrDaily * multiplier).toFixed(2));
  const mbrCompliant = mbrDaily < 1.0;

  results.push({
    key: 'mosquito_mbr',
    title: 'Mosquito Biting Rate (MBR) Nyamuk',
    enabled: toggles.enableMosquitoMbr,
    formulaText: 'Jumlah nyamuk tertangkap / (Jumlah penangkap × Waktu penangkapan jam)',
    calculationBreakdown: `Harian: ${mosquitoCount} / (${catchers} orang × ${durationHours} jam) = ${mbrDaily} | Bulanan (×${multiplier}): ${mbrMonthly}`,
    numericValue: mbrDaily,
    secondaryMonthlyValue: mbrMonthly,
    unit: 'ekor/orang/jam',
    sbmklThresholdText: 'MHD < 1 / Evaluasi Tren Bulanan (Permenkes No. 2/2023)',
    isCompliant: mbrCompliant,
    statusLabel: mbrCompliant
      ? 'Terkendali (< 1 ekor/orang/jam)'
      : 'Perlu Pengendalian ULV Cold Fogging & Thermal Fogging Rutin',
  });

  // 4. Indeks Populasi Lalat (Flygrill) — Permenkes No. 2 Tahun 2023 Tabel 24 Hal. 72 & 75 (< 2)
  const top5 =
    input.flygrillTop5Readings && input.flygrillTop5Readings.length > 0
      ? input.flygrillTop5Readings.slice(0, 5)
      : [0, 0, 0, 0, 0];
  const flyIndex = Number(
    (top5.reduce((sum, val) => sum + Number(val || 0), 0) / Math.max(1, top5.length)).toFixed(2)
  );
  const flyCompliant = flyIndex < 2.0;

  results.push({
    key: 'fly_index',
    title: 'Indeks Populasi Lalat (Flygrill)',
    enabled: toggles.enableFlyIndex,
    formulaText: 'Rata-rata 5 nilai tertinggi dari 10x pengamatan 30 detik pada blok grill',
    calculationBreakdown: `Rata-rata 5 nilai tertinggi (${top5.join(', ')}) = ${flyIndex} ekor/grill`,
    numericValue: flyIndex,
    unit: 'ekor/grill',
    sbmklThresholdText: '< 2 ekor/grill (Permenkes No. 2/2023 Tabel 24)',
    isCompliant: flyCompliant,
    statusLabel: flyCompliant
      ? 'Memenuhi Baku Mutu SBMKL (< 2)'
      : 'Melebihi Baku Mutu SBMKL (>= 2) — Perlu Fly Bait & Sanitasi Area TPS/Dapur',
  });

  // 5. Angka Bebas Jentik (ABJ %) — Permenkes No. 2 Tahun 2023 Tabel 24 Hal. 71 & 73 (>= 95%)
  const totalRooms = Math.max(
    1,
    Number(input.totalInspectedRoomsForLarva) || Math.max(20, matrix.totalInfectedRooms)
  );
  const positiveRooms = Math.max(0, Number(input.positiveLarvaRoomsCount) || 0);
  const negativeRooms = Math.max(0, totalRooms - positiveRooms);
  const abjPct = Number(((negativeRooms / totalRooms) * 100).toFixed(2));
  const abjCompliant = abjPct >= 95.0;

  results.push({
    key: 'larva_abj',
    title: 'Angka Bebas Jentik (ABJ %)',
    enabled: toggles.enableLarvaFreeIndex,
    formulaText: '(Jumlah ruang/kontainer negatif jentik / Total ruang diperiksa) × 100%',
    calculationBreakdown: `(${negativeRooms} negatif / ${totalRooms} ruang diperiksa) × 100% = ${abjPct}%`,
    numericValue: abjPct,
    unit: '%',
    sbmklThresholdText: '>= 95% (Permenkes No. 2/2023 Tabel 24)',
    isCompliant: abjCompliant,
    statusLabel: abjCompliant
      ? 'Memenuhi Baku Mutu SBMKL (>= 95%)'
      : 'Di Bawah Baku Mutu SBMKL (< 95%) — Wajib Larvasidasi (Abatisasi)',
  });

  return results;
}

/**
 * Kalkulator Khusus Laporan Anti Rayap (Termite Control / AR)
 */
export function calculateTermiteMetrics(
  matrix: FilteredRecapMatrix,
  input: PermenkesCalculationInput,
  toggles: PermenkesToggleConfig
): PermenkesMetricResult[] {
  const results: PermenkesMetricResult[] = [];

  // 1. Tingkat Infestasi Stasiun Umpan Rayap (Bait Station Infestation Rate %)
  const totalBait = Math.max(1, Number(input.totalBaitStationsInstalled) || 24);
  const positiveBait =
    input.positiveBaitStationsCount !== undefined
      ? Number(input.positiveBaitStationsCount)
      : (matrix.totalsByPest['Bait Station In-Ground (IG) Positif'] || 0) +
        (matrix.totalsByPest['Bait Station Above-Ground (AG) Positif'] || 0);
  const baitInfestationPct = Number(((positiveBait / totalBait) * 100).toFixed(2));
  const baitCompliant = baitInfestationPct === 0;

  results.push({
    key: 'termite_bait_rate',
    title: 'Tingkat Infestasi Stasiun Umpan Rayap (Bait Station %)',
    enabled: toggles.enableTermiteBaitInfestation ?? true,
    formulaText: '(Jumlah Bait Station positif terinfestasi rayap / Total Bait Station dipasang) × 100%',
    calculationBreakdown: `(${positiveBait} unit aktif / ${totalBait} unit stasiun umpan diperiksa) × 100% = ${baitInfestationPct}%`,
    numericValue: baitInfestationPct,
    unit: '%',
    sbmklThresholdText: '0% pasca-eliminasi koloni (Standar SNI / Termite Baiting)',
    isCompliant: baitCompliant,
    statusLabel: baitCompliant
      ? 'Koloni Tereliminasi / 0% Stasiun Aktif'
      : 'Masih Dalam Fase Umpan Aktif (Colony Elimination Progress)',
  });

  // 2. Indeks Proteksi Struktur Bangunan Bebas Rayap (%)
  const totalZones = Math.max(1, Number(input.totalStructureZonesInspected) || Math.max(20, matrix.totalInfectedRooms + 15));
  const activeTermiteZones =
    input.activeTermiteStructureZonesCount !== undefined
      ? Number(input.activeTermiteStructureZonesCount)
      : matrix.roomRows.filter(r =>
          Object.entries(r.countsByActivePest).some(
            ([k, v]) => v > 0 && /rayap|mud tubes/i.test(k)
          )
        ).length;
  const safeZones = Math.max(0, totalZones - activeTermiteZones);
  const protectionPct = Number(((safeZones / totalZones) * 100).toFixed(2));
  const protectionCompliant = protectionPct >= 95.0;

  results.push({
    key: 'termite_protection_index',
    title: 'Indeks Proteksi Struktur Bangunan Bebas Rayap (%)',
    enabled: toggles.enableTermiteStructureProtection ?? true,
    formulaText: '(Jumlah titik struktur/ruangan bebas rayap aktif / Total titik struktur diperiksa) × 100%',
    calculationBreakdown: `(${safeZones} zona aman / ${totalZones} zona struktur diperiksa) × 100% = ${protectionPct}%`,
    numericValue: protectionPct,
    unit: '%',
    sbmklThresholdText: '>= 95% — Target Garansi 100% Bebas Serangan Rayap',
    isCompliant: protectionCompliant,
    statusLabel: protectionCompliant
      ? 'Barier Kimia & Struktur Terlindungi (>= 95%)'
      : 'Perlu Spot Re-Treatment / Injeksi Ulang pada Titik Temuan',
  });

  // 3. Realisasi Titik Drilling & Injeksi Barier Termitisida (%)
  const plannedPts = Math.max(1, Number(input.plannedDrillingPoints) || 100);
  const completedPts =
    input.completedDrillingPoints !== undefined
      ? Number(input.completedDrillingPoints)
      : matrix.totalsByPest['Titik Drilling & Injeksi Pondasi'] || plannedPts;
  const realizationPct = Number(((completedPts / plannedPts) * 100).toFixed(2));
  const liters = Number(input.termiticideLitersUsed) || Number((completedPts * 2.5).toFixed(1));

  results.push({
    key: 'termite_drilling_realization',
    title: 'Realisasi Titik Drilling & Injeksi Barier Termitisida',
    enabled: toggles.enableTermiteDrillingRealization ?? true,
    formulaText: '(Jumlah titik bor/injeksi terealisasi / Target titik bor) × 100%',
    calculationBreakdown: `${completedPts} dari ${plannedPts} titik bor (${realizationPct}%) • Estimasi larutan termitisida: ${liters} Liter`,
    numericValue: realizationPct,
    unit: '%',
    sbmklThresholdText: '100% titik pondasi (Jarak 30-40 cm, @2,5-3 Liter/titik)',
    isCompliant: realizationPct >= 100,
    statusLabel:
      realizationPct >= 100
        ? 'Barier Pondasi Terpasang Penuh (100%)'
        : 'Pekerjaan Bertahap Sesuai Progres Konstruksi',
  });

  return results;
}

/**
 * Rule #4: Menyusun draf narasi otomatis sesuai kategori laporan ('PCO' vs 'AR'),
 * yang dapat diedit manual oleh Admin sebelum cetak PDF.
 */
export function generateEditableRecapNarrative(
  matrix: FilteredRecapMatrix,
  metrics: PermenkesMetricResult[],
  periodLabel: string,
  categoryMode: ReportCategoryMode = 'PCO'
): EditableRecapNarratives {
  if (categoryMode === 'AR') {
    const coptotermes = matrix.totalsByPest['Rayap Tanah (Coptotermes sp.)'] || 0;
    const macrotermes = matrix.totalsByPest['Rayap Subterranean (Macrotermes sp.)'] || 0;
    const mudTubes = matrix.totalsByPest['Jalur Kembara / Mud Tubes Aktif'] || 0;
    const drywood = matrix.totalsByPest['Rayap Kayu Kering (Cryptotermes sp.)'] || 0;
    const drillingPts = matrix.totalsByPest['Titik Drilling & Injeksi Pondasi'] || 0;
    const baitIG = matrix.totalsByPest['Bait Station In-Ground (IG) Positif'] || 0;
    const baitAG = matrix.totalsByPest['Bait Station Above-Ground (AG) Positif'] || 0;

    const protMetric = metrics.find(m => m.key === 'termite_protection_index');
    const baitMetric = metrics.find(m => m.key === 'termite_bait_rate');

    return {
      analisaTikusDanKucing:
        `[Analisa Rayap Tanah & Subterranean] Pada periode ${periodLabel}, hasil pemeriksaan struktur bangunan mencatat temuan Rayap Tanah (Coptotermes sp.) sebanyak ${coptotermes} titik, Macrotermes sp. sebanyak ${macrotermes} titik, dan jalur kembara (mud tubes) aktif sebanyak ${mudTubes} titik. ` +
        (protMetric?.enabled
          ? `Indeks Proteksi Struktur Bangunan berada pada angka ${protMetric.numericValue}% (${protMetric.statusLabel}). `
          : '') +
        `Seluruh jalur kembara aktif telah dikerok dan diberikan injeksi termitisida langsung pada sumber celah pondasi.`,

      analisaKecoaDanSemut:
        `[Analisa Rayap Kayu Kering & Struktur Kayu] Pada periode ${periodLabel}, ditemukan indikasi Rayap Kayu Kering (Cryptotermes sp.) pada kusen/plafon/partisi sebanyak ${drywood} titik. Penanganan dilakukan dengan penginjeksian larutan termitisida pada lubang-lubang kusen serta penyemprotan residual pada rangka plafon dan kuda-kuda kayu.`,

      analisaLalatDanNyamuk:
        `[Evaluasi Barier Injeksi & Stasiun Umpan (Baiting System)] Total titik pengeboran dan injeksi pondasi yang tercatat adalah ${drillingPts} titik, sedangkan monitoring stasiun umpan mencatat ${baitIG} unit In-Ground (IG) positif dan ${baitAG} unit Above-Ground (AG) positif. ` +
        (baitMetric?.enabled
          ? `Tingkat infestasi stasiun umpan adalah ${baitMetric.numericValue}% (${baitMetric.statusLabel}).`
          : ''),

      analisaHamaLainnya:
        `[Status Perlindungan & Masa Garansi Anti Rayap] Secara keseluruhan, barier termitisida di sekeliling pondasi bangunan berfungsi baik dalam menahan koloni rayap dari luar. Titik-titik yang memiliki kelembaban tinggi tetap menjadi fokus pengawasan pada jadwal kontrol garansi berikutnya.`,

      saranRekomendasi:
        `1. Menjaga agar area sekitar pondasi, kusen kayu, dan ruang bawah tangga tidak lembab atau terkena rembesan pipa air bocor yang dapat memicu daya tarik koloni rayap tanah.\n` +
        `2. Menghindari penumpukan kayu bekas, kardus, atau sisa bekisting yang bersentuhan langsung dengan tanah di area taman/perimeter gedung.\n` +
        `3. Tidak memindahkan atau membuka stasiun umpan rayap (Bait Station IG/AG) yang sedang terpasang agar proses eliminasi koloni berjalan tuntas.`,

      rencanaTindakLanjut:
        `1. Melaksanakan kunjungan kontrol berkala (Quality Control Garansi Anti Rayap) sesuai jadwal untuk memeriksa ulang seluruh titik kritis dan stasiun umpan.\n` +
        `2. Melakukan spot re-treatment (injeksi ulang termitisida tanpa biaya tambahan selama masa garansi) apabila ditemukan indikasi jalur kembara baru pada area yang bergaransi.\n` +
        `3. Melakukan penggantian/penambahan umpan (hexaflumuron/chlorfluazuron) pada stasiun umpan yang masih menunjukkan aktivitas makan rayap.`,
    };
  }

  const ratQty = matrix.totalsByPest['Tikus'] || 0;
  const catQty = matrix.totalsByPest['Kucing'] || 0;
  const roachQty = matrix.totalsByPest['Kecoa'] || 0;
  const antQty = matrix.totalsByPest['Semut'] || 0;
  const flyQty = matrix.totalsByPest['Lalat'] || 0;
  const mosquitoQty = matrix.totalsByPest['Nyamuk'] || 0;

  const ratMetric = metrics.find(m => m.key === 'rat_success_trap');
  const roachMetric = metrics.find(m => m.key === 'cockroach_index');
  const mosquitoMetric = metrics.find(m => m.key === 'mosquito_mbr');

  const otherActivePests = matrix.summaryRows
    .filter(r => !['Tikus', 'Kucing', 'Kecoa', 'Semut', 'Lalat', 'Nyamuk'].includes(r.pestName))
    .map(r => `${r.pestName} (${r.totalQuantity} ekor di ${r.roomsSummary})`);

  return {
    analisaTikusDanKucing:
      `Pada periode ${periodLabel}, tercatat temuan Tikus sebanyak ${ratQty} ekor dan Kucing sebanyak ${catQty} ekor. ` +
      (ratMetric?.enabled
        ? `Hasil perhitungan Success Trap Tikus adalah ${ratMetric.numericValue}% (${ratMetric.statusLabel}). `
        : '') +
      `Pengendalian difokuskan pada pemasangan perangkap (cage trap & glue trap), pengecekan umpan rodentisida pada bait station, serta penutupan celah akses masuk di sekitar saluran dan plafon.`,

    analisaKecoaDanSemut:
      `Pada periode ${periodLabel}, ditemukan Kecoa sebanyak ${roachQty} ekor dan Semut sebanyak ${antQty} ekor. ` +
      (roachMetric?.enabled
        ? `Indeks Populasi Kecoa tercatat sebesar ${roachMetric.numericValue} (${roachMetric.statusLabel}). `
        : '') +
      `Tindakan pengendalian dilakukan melalui aplikasi gel baiting pada celah kabinet/dapur, pemasangan sticky trap monitoring, serta residual spraying pada jalur pergerakan serangga merayap.`,

    analisaLalatDanNyamuk:
      `Pada periode ${periodLabel}, populasi serangga terbang yang terdata meliputi Lalat sebanyak ${flyQty} ekor dan Nyamuk sebanyak ${mosquitoQty} ekor. ` +
      (mosquitoMetric?.enabled
        ? `Nilai Mosquito Biting Rate (MBR) harian berada pada angka ${mosquitoMetric.numericValue} (akumulasi bulanan ${mosquitoMetric.secondaryMonthlyValue}). `
        : '') +
      `Pengendalian dilakukan dengan Cold Fogging (ULV) di area dalam gedung, Thermal Fogging pada area perimeter/saluran luar, serta aplikasi larvasida pada titik genangan air.`,

    analisaHamaLainnya:
      otherActivePests.length > 0
        ? `Selain hama utama di atas, pada periode ${periodLabel} ditemukan hama aktif (> 0) berikut: ${otherActivePests.join('; ')}. Seluruh titik temuan telah diberikan penanganan langsung di lokasi.`
        : `Pada periode ${periodLabel}, tidak ditemukan aktivitas hama lainnya (> 0) di luar kategori utama.`,

    saranRekomendasi:
      `1. Menjaga kerapatan pintu akses (door closer / tirai plastik) dan menutup celah pipa/kabel (proofing) agar hama dari area luar tidak masuk ke dalam gedung.\n` +
      `2. Meningkatkan sanitasi area tempat penampungan sampah sementara (TPS), dapur/gizi, dan saluran drainase agar tidak menjadi sumber pakan maupun perindukan vektor.\n` +
      `3. Memastikan tidak ada tumpukan kardus atau barang tidak terpakai di ruang gudang dan panel listrik yang dapat menjadi sarang tikus maupun kecoa.`,

    rencanaTindakLanjut:
      `1. Melanjutkan monitoring intensif perangkap tikus, sticky trap kecoa, serta penyemprotan berkala (Residual Spraying & Cold Fogging ULV) sesuai jadwal kontrak kerja.\n` +
      `2. Melakukan evaluasi titik-titik ruangan yang masih menunjukkan temuan > 0 pada periode ${periodLabel} untuk penambahan titik umpan pada periode berikutnya.\n` +
      `3. Berkoordinasi dengan tim Kesehatan Lingkungan (Kesling) / pengelola gedung terkait temuan akses fisik bangunan yang memerlukan perbaikan.`,
  };
}
