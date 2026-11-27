export type UserRole = "MASTER_SUPER_ADMIN" | "SUPERADMIN" | "ADMIN" | "MARKETING" | "INVENTORY" | "TEKNISI_LAPANGAN";

export interface AppUser {
    uid: string;
    email: string;
    name: string;
    role: UserRole;
    companyId: string;
    avatar?: string;
    isActive: boolean;
    wa?: string;
    jabatan?: string;
    nip?: string | null;
}

export interface Company {
    id: string;
    name: string;
    slug?: string;
    status?: "ACTIVE" | "TRIAL" | "SUSPENDED" | "EXPIRED";
    isActive: boolean;
    plan: "free" | "pro";
    maxTechnicians?: number;
    expiredAt?: Date;
}

export interface Customer {
    id: string;
    name: string;
    phone: string;
    company?: string;
    address?: string;
    email?: string;
    pic?: string;
    source: "manual_quick" | "import";
    createdBy: string;
    lastServiceDate?: Date;
    totalProjects: number;
    companyId: string;
    createdAt: Date;
}

export type QuotationStatus = "draft" | "pending" | "approved" | "rejected" | "sent_to_client" | "deal" | "cancelled";
export type ServiceType = 'GENERAL_PEST_CONTROL' | 'TERMITE_CONTROL' | 'FUMIGATION' | 'RODENT_CONTROL' | 'MOSQUITO_CONTROL' | 'BIRD_CONTROL' | 'BED_BUG_CONTROL' | 'DISINFECTION';
export type ServiceMethod =
    | "spraying"
    | "fogging"
    | "baiting_tikus"
    | "injeksi"
    | "pipanisasi"
    | "baiting_system";

// ─── QUOTATION MODULE TYPES ───────────────────────────────────────────────────

export type JenisLayanan =
    | "anti_rayap_injeksi"
    | "anti_rayap_pipanisasi"
    | "anti_rayap_baiting"
    | "anti_rayap_soil"
    | "anti_rayap_fumigasi"
    | "pest_spraying"
    | "pest_fogging"
    | "pest_rodent"
    | "pest_baiting"
    | "pest_umum"
;

export type KondisiBangunan = "pasca_konstruksi" | "pra_konstruksi" | "renovasi" | null;

export type TipeKontrak = "U" | "K" | "PH";
export type KategoriSurat = "AR" | "PCO";
export type NomorStage = "DRF" | "OFFICIAL" | "APR";
export type GaransiUnit = "tahun" | "bulan";

export type PdfTemplateVariant =
    | "auto"
    | "ar_pra_profile_8p"      // Tipe 1: PDF 0005 (Pra-Konstruksi + Pipa + Company Profile 8 Hal)
    | "ar_pasca_standar_4p"    // Tipe 2: PDF 0022 / 0019 / 0247 (Pasca/Retreatment/Pipa + Rumus Volume + Upah%)
    | "pco_rodent_survey_4p"   // Tipe 3: PDF 0009 (Proposal Rodent Control Survey + Tabel Program A-E)
    | "pco_korporat_boq_3p"    // Tipe 4: PDF 0003 / 0333 (Pest & Rodent Korporat + Total di Cover + DPP 11/12)
    | "pco_jadwal_fogging_1p"; // Tipe 5: PDF 0015 / 0276 (Jadwal Kerja Fogging 12 Bulan / Perpanjangan 1 Hal)

export interface QuotationItem {
    presetCode?: string;
    desc: string;
    volumeFormula?: string;    // Contoh: "37+37+5,5+9+6+5" atau "(7+7+5) x 3"
    qty: number;
    unit: string;
    harga: number;
}

export interface BiayaTambahan {
    label: string;
    amount: number;
}

export interface AdjustmentLogEntry {
    adjustedAt: string;
    adjustedByUid: string;
    adjustedByName: string;
    prevGaransiLabel?: string;
    newGaransiLabel?: string;
    prevTotal: number;
    newTotal: number;
    reason: string;
}

export interface FoggingScheduleItem {
    no: number;
    bulan: string;
    tgl1: string;
    tgl2: string;
}

// ── Survey & Technical Data ───────────────────────────────────────────────────

export interface SurveyPhoto {
    base64: string;
    caption?: string;
}

export interface ChemicalItem {
    bahanAktif: string;
    merkDagang: string;
}

export const DEFAULT_CHEMICALS_AR: ChemicalItem[] = [
    { bahanAktif: "Cypermethrin", merkDagang: "Cypergard 100 EC" },
    { bahanAktif: "Imidakloprid", merkDagang: "Safe 1 200 SL" },
];

export const DEFAULT_CHEMICALS_PCO: ChemicalItem[] = [
    { bahanAktif: "Cypermethrin + Lambda Cyhalothrin", merkDagang: "Cypergard 100 EC" },
    { bahanAktif: "Lambda Cyhalothrin", merkDagang: "Demand CS" },
    { bahanAktif: "Brodifacum", merkDagang: "Klerat" },
];

export const DEFAULT_FOCUS_TARGET =
    "Nyamuk, Serangga Merayap, Lalat, Rodentia, Ngengat, Myriapoda dan Semut";

export const DEFAULT_TEKNIK_PCO = [
    "Melakukan pengasapan (fogging) pada seluruh area luar gedung (outdoor) dengan menggunakan Thermal Fogging.",
    "Melakukan penyemprotan pada bagian luar gedung, saluran drainage, parit, semak/taman, got dan bak sampah dengan mengunakan B&G.",
    "Melakukan penyemprotan residual pada dinding di bagian dalam gedung (indoor) dengan mengunakan ULV.",
];

export const METODE_BY_LAYANAN: Record<string, string[]> = {
    anti_rayap_injeksi: [
        "Melakukan pengeboran disetiap sisi pondasi luar dan dalam bangunan dengan jarak 10-15 cm dari dinding bangunan. Jarak antar lubang bor sebesar 30-40 cm dengan kedalaman lubang 30-40 cm.",
        "Melakukan Injeksi larutan termitisida pada lubang bor sebanyak 2,5 Liter – 3 Liter.",
        "Menutup lubang bor dengan bahan yang warnanya sama dengan warna lantai.",
        "Pengeboran dan penginjeksian larutan pestisida pada sisi-sisi kusen pintu dan jendela dengan kedalaman sampai menembus dinding tembok dibalik kusen dan menutup kembali lubang bekas bor dengan bahan yang warnanya disesuaikan dengan warna kayu/kusen.",
        "Melakukan penyemprotan larutan termitisida pada seluruh plafon dan partisi.",
        "Membersihkan bekas pekerjaan anti rayap.",
    ],
    anti_rayap_soil: [
        "Pemaparan larutan termitisida pada permukaan tanah sebelum pemasangan lantai kerja dengan dosis 5 liter larutan termitisida per 1 m².",
        "Penginjeksian larutan termitisida pada sloof pondasi dengan jarak injeksi 40 – 50 cm dengan dosis 2,5 s.d 3 liter per titik.",
        "Membersihkan bekas-bekas pekerjaan anti rayap.",
        "Bahan aktif yang digunakan adalah Cypermethrin dengan merek dagang Cypergard, kemasan @500 ml, dosis 10 ml per 1 liter air.",
    ],
    anti_rayap_pra: [
        "Pemaparan larutan termitisida pada permukaan tanah sebelum pemasangan lantai kerja dengan dosis 5 liter larutan termitisida per 1 m².",
        "Penginjeksian larutan termitisida pada sloof pondasi dengan jarak injeksi 40 – 50 cm dengan dosis 2,5 s.d 3 liter per titik.",
        "Membersihkan bekas-bekas pekerjaan anti rayap.",
        "Bahan aktif yang digunakan adalah Cypermethrin dengan merek dagang Cypergard, kemasan @500 ml, dosis 10 ml per 1 liter air.",
    ],
    anti_rayap_pipanisasi: [
        "Melakukan pemasangan jalur pipa pada kiri dan kanan tapak bangunan sebelum pemasangan lantai kerja.",
        "Melakukan penginjeksian larutan termitisida pada jalur inlet pipa yang telah dipasang.",
        "Membersihkan bekas-bekas pekerjaan anti rayap.",
    ],
    anti_rayap_baiting: [
        "Pemasangan stasiun umpan (bait station) di sekeliling bangunan dengan jarak 2-3 meter.",
        "Monitoring stasiun umpan secara berkala untuk mendeteksi aktivitas rayap.",
        "Penggantian umpan dengan bahan aktif apabila terdapat aktivitas rayap.",
        "Pencatatan dan pelaporan kondisi setiap stasiun umpan.",
    ],
    anti_rayap_fumigasi: [
        "Penutupan seluruh bangunan/area dengan tenda fumigasi yang kedap udara.",
        "Penginjeksian gas fumigan ke dalam ruang tertutup.",
        "Monitoring konsentrasi gas selama periode fumigasi berlangsung.",
        "Aerasi dan pemastian kadar gas aman sebelum bangunan dapat dihuni kembali.",
        "Pembersihan area setelah pekerjaan selesai.",
    ],
};

export interface NomorSuratLog {
    id: string;
    noSurat: string;
    stage?: NomorStage;
    draftNoSurat?: string;
    kategori: KategoriSurat;
    tipe: TipeKontrak;
    tipeLabel: string;
    jenisLayanan: JenisLayanan;
    kepada: string;
    byUid: string;
    byName: string;
    dibuat: Date;
    status: QuotationStatus;
    quoId: string | null;
    companyId: string;
    isManual?: boolean;
    keteranganManual?: string;
}

export type KategoriProyek = "Residensial" | "Komersial" | "Korporat" | "Instansi" | "Industri" | "Lainnya";

export interface Quotation {
    id: string;
    noSurat: string;
    draftNoSurat?: string;
    approvedNoSurat?: string;
    stage?: NomorStage;
    kategoriProyek: KategoriProyek;
    kategori: KategoriSurat;
    tipeKontrak: TipeKontrak;
    jenisLayanan: JenisLayanan;
    pdfVariant?: PdfTemplateVariant;
    isRevisi?: boolean;
    perihal: string;
    kepadaNama: string;
    kepadaAlamatLines: string[];
    kepadaUp?: string;
    kepadaWa?: string;      // Nomor WhatsApp klien
    objekPekerjaan?: string; // Contoh: "bangunan rumah tinggal pra konstruksi" / "Bank Victoria Cabang Fatmawati"
    lokasiPekerjaan?: string;// Alamat lokasi kerja bila berbeda dengan alamat surat klien
    latitude?: number;       // Titik koordinat GPS lintang lokasi klien
    longitude?: number;      // Titik koordinat GPS bujur lokasi klien
    tanggal: Date;
    items: QuotationItem[];
    biayaTambahan: BiayaTambahan[];
    upahPeralatanPct?: number; // Contoh: 25 (Upah & Peralatan Kerja 25%)
    diskonUpahPct?: number;    // Contoh: 15 (Diskon Upah & Peralatan Kerja 15%)
    upahPeralatanRp?: number;
    diskonUpahRp?: number;
    diskonPct: number;
    ppn: boolean;
    ppnScheme?: "non_ppn" | "ppn_12_dpp_nilai_lain";
    ppnDppFaktor?: number;
    approvalSignatureBase64?: string;
    approvalSignedAt?: string;
    approvalSignedByRole?: string;
    // Garansi dalam Tahun maupun Bulan (Custom / Preset)
    garansiTahun?: number;
    garansiNilai?: number;
    garansiUnit?: GaransiUnit; // 'tahun' | 'bulan'
    jenisGaransi?: string;
    tampilkanPengontrolan?: boolean;
    estimasiHari?: number;
    subtotal: number;
    diskonRp: number;
    ppnRp: number;
    total: number;
    marketingUid: string;
    marketingNama: string;
    marketingWa?: string;
    status: QuotationStatus;
    rejectionReason?: string;
    approvedBy?: string;
    approvedAt?: Date;
    dealAt?: Date;
    sentToClientAt?: Date;
    pdfUrl?: string;
    pdfBase64?: string;
    signedPdfBase64?: string;
    /** Penanda dari daftar ringan (PDF tidak ikut diunduh di daftar; ambil dengan getQuotationPdf). */
    hasPdf?: boolean;
    hasSignedPdf?: boolean;
    signedAt?: Date;
    signedBy?: string;
    // Survey & Technical
    surveyor?: string;
    tanggalSurvey?: string;
    hasilSurvey?: string;      // Temuan survey, mis: "Kami menemukan bekas serangan rayap pada kusen..."
    kunjunganPerBulan?: number;// Untuk Rodent Control / PCO kontrak (mis. 3 kali kunjungan per bulan)
    jadwalFoggingTahun?: number;
    jadwalFoggingRows?: FoggingScheduleItem[];
    surveyPhotos?: SurveyPhoto[];
    lampiranPages?: SurveyPhoto[];
    chemicals?: ChemicalItem[];
    metode?: string[];          // AR: metode pelaksanaan
    focusTarget?: string;       // PCO: hama yang dikendalikan
    teknikPelaksanaan?: string[];
    peralatan?: string[];
    kondisiBangunan?: KondisiBangunan;
    adjustmentHistory?: AdjustmentLogEntry[];
    companyId: string;
    createdAt: Date;
    notesMarketing?: string;
}

export interface TariffRow {
    service: ServiceType;
    method: ServiceMethod;
    label: string;
    basis: "m2" | "m_linear" | "titik";
    hppRate: number;
    sellRate: number;
}

export interface PricingConfig {
    tariffTable: TariffRow[];
    bbmZones: { zona_a: number; zona_b: number; zona_c: number };
    warrantyMultiplier: { y1: number; y2: number; y3: number };
    marginGuard: { blockBelow: number; warnBelow: number; premiumAbove: number };
}

export interface SPK {
    id: string;
    quotationId: string;
    quotationNoSurat: string;
    customerId: string;
    customerName: string;
    technicianId: string;
    technicianName: string;
    scheduleDate: Date;
    actualStart?: Date;
    actualEnd?: Date;
    durationMin?: number;
    status: "assigned" | "in_progress" | "done";
    gpsStart?: { lat: number; lng: number };
    gpsEnd?: { lat: number; lng: number };
    serviceType: ServiceType;
    perihal: string;
    lokasi: string;
    notes: string;
    alatPekerjaan?: string[];
    companyId: string;
    createdAt: Date;
    createdBy: string;
    createdByName: string;
}

export interface Report {
    id: string;
    spkId: string;
    technicianId: string;
    technicianName: string;
    customerId: string;
    customerName: string;
    serviceType: ServiceType;
    formData: Record<string, unknown>;
    photos: string[];
    submittedAt: Date;
    durationMin: number;
    pdfUrl: string;
    shareToken: string;
    sentToClient: boolean;
    sentAt?: Date;
    companyId: string;
}

export type WorkReportStatus = 'DRAFT' | 'READY' | 'WORKING' | 'COMPLETED' | 'FLAGGED' | 'REVIEWED';
export type RiskLevel = 'NORMAL' | 'LOW_RISK' | 'REVIEW' | 'HIGH_RISK' | 'CRITICAL';
export type PhotoType = 'CHECK_IN' | 'PROGRESS' | 'CHECK_OUT';
export type PhotoTag = 'BEFORE' | 'AFTER' | null;

export type ApplicationMethod = 'SPRAYING' | 'BAITING' | 'DRILLING' | 'TRENCHING' | 'FOGGING' | 'MISTING' | 'DUSTING' | 'GEL_INJECTION';
export type ContractType = 'ONE_TIME' | 'RECURRING';

export interface TreatmentRecord {
  applicationMethod: ApplicationMethod;
  chemicalName: string;
  activeIngredient?: string | null;
  dosage: string;
  treatmentAreaSqm?: number | null;
  drillingPointsCount?: number | null;
  areaPlafon?: string | null;
  fumigantType?: string | null;
  gasConcentrationPpm?: number | null;
  sealingStartedAt?: string | null;
  aerationCompletedAt?: string | null;
  safetyNotes?: string | null;
  technicianNotes?: string | null;
}

export interface Project {
  id: string;
  projectName: string;
  clientName: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
  workDate: string;
  workType: string;
  serviceType: ServiceType;
  focusTarget?: string | null;
  targetFocus: string[];
  buildingAreaSqm?: number | null;
  contractType: ContractType;
  warrantyMonths: number;
  nextServiceDate?: string | null;
  scheduledStartTime: string;
  notes?: string | null;
  contractValue?: number;
  quotationId?: string | null;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  lockedAt?: string | null;
}

export interface DocumentationPhoto {
  id: string;
  photoType: PhotoType;
  photoTag?: PhotoTag;
  latitude: number;
  longitude: number;
  accuracy: number;
  distanceToProject: number;
  isWithinRadius: boolean;
  capturedAt: string;
  metadata: {
    projectName?: string;
    executorName?: string;
    caption?: string | null;
    pdfSnapshotUrl?: string | null;
    rawArchivedAt?: string | null;
  };
  purgedAt?: string | null;
  pdfSnapshotUrl?: string | null;
  rawArchivedAt?: string | null;
  url: string;
}

export interface RiskEvent {
  id: string;
  eventType: string;
  points: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  expectedValue?: string | null;
  actualValue?: string | null;
  createdAt: string;
}

export interface WorkReport {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  projectAddress: string;
  projectLatitude: number;
  projectLongitude: number;
  projectRadius: number;
  scheduledStartTime: string;
  serviceType: ServiceType;
  focusTarget?: string | null;
  targetFocus: string[];
  buildingAreaSqm?: number | null;
  contractType: ContractType;
  warrantyMonths: number;
  nextServiceDate?: string | null;
  executorId: string;
  executorName: string;
  executorEmail: string;
  status: WorkReportStatus;
  checkInAt?: string | null;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkInAccuracy?: number | null;
  checkInDistance?: number | null;
  checkInValid?: boolean | null;
  checkOutAt?: string | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  checkOutAccuracy?: number | null;
  checkOutDistance?: number | null;
  checkOutValid?: boolean | null;
  durationSeconds?: number | null;
  riskScore: number;
  riskLevel: RiskLevel;
  riskEvents: RiskEvent[];
  treatmentRecord: TreatmentRecord | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerFeedback?: string | null;
  customerSignature?: string | null;
  technicianSignature?: string | null;
  notes?: string | null;
  teamMembers?: { id?: string; name: string; role?: string; isManual?: boolean }[];
  photos: DocumentationPhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkReportListItem {
  id: string;
  status: WorkReportStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  durationSeconds: number | null;
  riskScore: number;
  riskLevel: RiskLevel;
  checkInValid: boolean | null;
  checkOutValid: boolean | null;
  checkInDistance: number | null;
  checkOutDistance: number | null;
  createdAt: string;
  project: { id: string; name: string; clientName: string; address: string; serviceType: ServiceType; focusTarget: string | null; targetFocus?: string[] };
  executor: { id: string; name: string };
  treatmentSummary: { applicationMethod: ApplicationMethod; chemicalName: string; dosage: string } | null;
}

export interface AuditLogEntry {
  id: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string;
  createdAt: string;
}

export interface DailyJobTrendPoint {
  /** YYYY-MM-DD dalam zona waktu operasional (Asia/Jakarta). */
  date: string;
  total: number;
  completed: number;
  flagged: number;
}

export interface WorkStatusBreakdownItem {
  status: WorkReportStatus;
  count: number;
}

export interface PriorityVerificationReportItem {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  serviceType: ServiceType;
  executorName: string;
  status: WorkReportStatus;
  riskScore: number;
  riskLevel: RiskLevel;
  checkInValid: boolean | null;
  checkInDistance: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface KPIStats {
  totalJobs: number;
  completedJobs: number;
  workingJobs: number;
  flaggedJobs: number;
  highRiskCount: number;
  avgDurationMinutes: number;
  avgRiskScore: number;
  windowDays?: number;
  periodStart?: string;
  periodEnd?: string;
  generatedAt?: string;
  priorityUniqueCount?: number;
  dailyTrend?: DailyJobTrendPoint[];
  statusBreakdown?: WorkStatusBreakdownItem[];
  priorityReports?: PriorityVerificationReportItem[];
}

export type OperationalDashboardSummary = Required<KPIStats>;

export interface ExecutorStats {
  id: string;
  name: string;
  email: string;
  nip: string | null;
  phone: string | null;
  isActive: boolean;
  totalJobs: number;
  completedJobs: number;
  highRiskJobs: number;
  avgDurationMinutes: number;
}

export interface RiskConfig {
  lateCheckinThresholdMinutes: number;
  lateCheckinPoints: number;
  outsideRadiusPoints: number;
  shortDurationCriticalMinutes: number;
  shortDurationCriticalPoints: number;
  shortDurationWarningMinutes: number;
  shortDurationWarningPoints: number;
  minTotalPhotos: number;
  minTotalPhotosPoints: number;
  requireProgressPhoto: boolean;
  noProgressPhotoPoints: number;
  locationDriftThresholdMeters: number;
  locationDriftPoints: number;
  missingTreatmentRecordPoints: number;
  fumigationMissingAerationPoints: number;
  reviewThreshold: number;
  highRiskThreshold: number;
  criticalThreshold: number;
  lowRiskThreshold: number;
}

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  timeStart?: string;
  timeEnd?: string;
  executorId: string;
  projectId: string;
  riskLevel: string;
  status: string;
  serviceType: string;
  search: string;
  page?: number;
  limit?: number;
}

export const DEFAULT_FILTERS: ReportFilters = {
  executorId: 'ALL',
  projectId: 'ALL',
  riskLevel: 'ALL',
  status: 'ALL',
  serviceType: 'ALL',
  search: '',
};

export interface UserLocation {
  userId: string;
  userName: string;
  latitude: number;
  longitude: number;
  trackedAt: string;
  accuracy?: number;
}
