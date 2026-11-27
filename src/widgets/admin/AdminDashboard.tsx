import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ADMIN_TAB_VARIANTS,
  COLLAPSE_PANEL_VARIANTS,
  MODAL_BACKDROP_VARIANTS,
  MODAL_PANEL_VARIANTS,
} from '@/shared/lib/motion';
import {
  WorkReport,
  WorkReportListItem,
  Project,
  ExecutorStats,
  RiskConfig,
  DocumentationPhoto,
  ReportFilters,
  DEFAULT_FILTERS,
  KPIStats,
  WorkReportStatus,
  Quotation,
} from '@/entities/types';
import {
  fetchAdminReports,
  fetchAdminReportDetail,
  fetchAdminSummary,
  fetchExecutors,
  fetchAdminProjects,
  fetchRiskConfig,
  updateRiskConfig,
  resetRiskConfig,
  reviewReport,
  downloadReportsCsv,
  fetchUsers,
  suspendUser,
  activateUser,
  deleteUser,
  createUser,
  resetUserPassword,
  AdminUser,
} from '@/shared/api/admin';
import { getQuotations } from '@/shared/api/quotationService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { fetchLatestLocations, UserLocation } from '@/shared/api/location';
import { ApiError } from '@/shared/api/client';
import { RiskBadge } from '../common/RiskBadge';
import { LocationMap } from '../maps/LocationMap';
import { AllProjectsMap } from '../maps/AllProjectsMap';
import { PhotoViewerModal } from '../common/PhotoViewerModal';
import { AuthedImage } from '../common/AuthedImage';
import { RISK_LEVEL_OPTIONS, STATUS_OPTIONS, getWorkReportStatusMeta } from '@/shared/utils/riskMeta';
import { exportTableToExcel, exportTableToPDF } from '@/shared/utils/exportUtils';
import { exportReportToPdf } from '@/shared/utils/pdfExport';
import {
  buildArchivePhotoEntries,
  downloadRawPhotosArchiveAndOffload,
  type ArchivePhotoEntry,
} from '@/shared/utils/photoArchiveExporter';
import { SERVICE_TYPE_OPTIONS, getServiceTypeMeta, APPLICATION_METHOD_LABELS } from '@/shared/utils/serviceMeta';
import {
  LayoutDashboard,
  RefreshCw,
  ShieldAlert,
  Search,
  Download,
  Clock,
  MapPin,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Eye,
  SlidersHorizontal,
  X,
  Check,
  Loader2,
  Settings2,
  Users,
  FlaskConical,
  Trash2,
  Briefcase,
  Package,
  FileText,
  ShieldCheck,
  Palette,
  RotateCcw,
  Sun,
  Moon,
  Monitor,
  ArrowLeft,
  Lock,
  Plus,
  Copy,
  LogOut,
} from 'lucide-react';

import { useAuth } from '@/app/providers/AuthContext';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';
import { generateInvite, DEFAULT_ACCOUNT_PASSWORD } from '@/shared/api/auth';
import { TemplateSettingsPanel } from '@/widgets/admin/TemplateSettingsPanel';
import { MonthlyRecapBuilderModal } from '@/widgets/admin/MonthlyRecapBuilderModal';
import { canGenerateMonthlyRecap } from '@/shared/lib/permenkesRecapEngine';
import { CompanyPicker } from '@/widgets/admin/CompanyPicker';
import { OperationsAnalyticsBento, ExecutiveQuotationSummary } from '@/widgets/admin/OperationsAnalyticsBento';
import { isDirectorUser } from '@/shared/lib/roles';
import { useAuthStore } from '@/app/store/authStore';
import { useTheme } from '@/shared/hooks/useTheme';
import { InventoryPage } from '../../pages/inventory/InventoryPage';
import { KontrolRayapPage } from '../../pages/customers/KontrolRayapPage';
import { QuotationPage } from '../../pages/quotation/QuotationPage';
import { CustomersPage } from '../../pages/customers/CustomersPage';
import { TrackingPage } from '../../pages/tracking/TrackingPage';
import { CashflowPage } from '../../pages/cashflow/CashflowPage';
import { PerformaPage } from '../../pages/performance/PerformaPage';
import { SPKPage } from '../../pages/spk/SPKPage';
import { CompaniesPage } from '../../pages/super-admin/CompaniesPage';
import { Header } from '../common/Header';
import { AppLayout } from '../common/AppLayout';
import { AppGuideTour, type AppGuideMode } from '../common/AppGuideTour';
import { RoleGuidebookModal } from '../common/RoleGuidebookModal';

type Tab =
  | 'dashboard'
  | 'reports'
  | 'anomalies'
  | 'projects'
  | 'executors'
  | 'risk-config'
  | 'tracking'
  | 'approval'
  | 'profile'
  | 'inventory'
  | 'quotation'
  | 'kontrol-rayap'
  | 'templates'
  | 'customers'
  | 'order-tracking'
  | 'cashflow'
  | 'performa'
  | 'spk-cms'
  | 'saas-companies';

const DATE_PRESETS = [
  { id: 'all', label: 'Semua' },
  { id: 'today', label: 'Hari Ini' },
  { id: 'last7days', label: '7 Hari' },
  { id: 'last30days', label: '30 Hari' },
] as const;

function presetToRange(preset: string): { startDate?: string; endDate?: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === 'today') return { startDate: iso(today), endDate: iso(today) };
  if (preset === 'last7days') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { startDate: iso(start), endDate: iso(today) };
  }
  if (preset === 'last30days') {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { startDate: iso(start), endDate: iso(today) };
  }
  return {};
}

const MotionDiv = motion.div as any;

const EMPTY_KPI: KPIStats = {
  totalJobs: 0,
  completedJobs: 0,
  workingJobs: 0,
  flaggedJobs: 0,
  highRiskCount: 0,
  avgDurationMinutes: 0,
  avgRiskScore: 0,
};

export const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, resolvedTheme, setTheme, options: themeOptions } = useTheme();
  const isAdmin = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN';
  const isSuper = user?.role === 'SUPERADMIN';
  const isMasterSuper = user?.role === 'MASTER_SUPER_ADMIN';
  const isDirector = isDirectorUser(user);
  const activeCompanyId = useAuthStore(st => st.activeCompanyId) || user?.companyId || null;

  // Tab awal: SUPERADMIN & ADMIN langsung membuka Dashboard Utama ('dashboard') agar ringkasan langsung terlihat
  const [activeTab, setActiveTab] = useState<Tab>(
    user?.role === 'MASTER_SUPER_ADMIN'
      ? 'saas-companies'
      : user?.role === 'INVENTORY'
      ? 'inventory'
      : user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'
      ? 'dashboard'
      : 'quotation'
  );

  useEffect(() => {
    if (user?.role === 'MASTER_SUPER_ADMIN' && activeTab !== 'saas-companies' && activeTab !== 'profile') {
      setActiveTab('saas-companies');
    }
  }, [user?.role, activeTab]);

  const [inviteRole, setInviteRole] = useState<AdminUser['role']>('TEKNISI_LAPANGAN');
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: DEFAULT_ACCOUNT_PASSWORD,
    role: 'TEKNISI_LAPANGAN' as AdminUser['role'],
    phone: '',
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userSearchQ, setUserSearchQ] = useState('');
  const [memberStatusFilter, setMemberStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [memberGeofenceMap, setMemberGeofenceMap] = useState<Record<string, boolean>>({});
  const [trackingMode, setTrackingMode] = useState<'live' | 'journey'>('live');
  const [trackingMemberSearch, setTrackingMemberSearch] = useState('');
  const [selectedTrackingUserId, setSelectedTrackingUserId] = useState<string | null>(null);
  const [defaultGeofenceRadius, setDefaultGeofenceRadius] = useState<number>(250);
  const [geofenceRadiusSaved, setGeofenceRadiusSaved] = useState<boolean>(false);
  const [visitTargets, setVisitTargets] = useState<Record<string, number>>({});
  const [liveTrackingEnabled, setLiveTrackingEnabled] = useState<boolean>(true);
  const [masterFeedbackEnabled, setMasterFeedbackEnabled] = useState<boolean>(true);
  const [liveTrackingAreas, setLiveTrackingAreas] = useState<{ id: string; name: string; radiusMeters: number }[]>([
    { id: 'area-1', name: 'Area Operasional Jabodetabek', radiusMeters: 250 },
  ]);
  const [newTrackingAreaName, setNewTrackingAreaName] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appGuideMode, setAppGuideMode] = useState<AppGuideMode>('idle');
  const [showRoleGuidebook, setShowRoleGuidebook] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [inviteLink, setInviteLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [reports, setReports] = useState<WorkReportListItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);

  const [quotationsList, setQuotationsList] = useState<Quotation[]>([]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectServiceType, setProjectServiceType] = useState('ALL');
  const [projectStatus, setProjectStatus] = useState('ALL');
  const [projectPage, setProjectPage] = useState(1);
  const [projectTotalPages, setProjectTotalPages] = useState(1);
  const [projectTotalCount, setProjectTotalCount] = useState(0);

  const [executors, setExecutors] = useState<ExecutorStats[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [riskConfig, setRiskConfig] = useState<RiskConfig | null>(null);
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);

  const [summaryData, setSummaryData] = useState<KPIStats | null>(null);
  const kpi = summaryData ?? EMPTY_KPI;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleRefreshError, setStaleRefreshError] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState<string>('all');
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [previousStatusFilter, setPreviousStatusFilter] = useState<string | null>(null);
  const [cameFromDashboard, setCameFromDashboard] = useState(false);
  const [previousFiltersSnapshot, setPreviousFiltersSnapshot] = useState<{
    filters: ReportFilters;
    datePreset: string;
    searchInput: string;
  } | null>(null);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showMonthlyRecapModal, setShowMonthlyRecapModal] = useState(false);
  const [recapModalMode, setRecapModalMode] = useState<'PCO' | 'AR'>('PCO');
  const [searchInput, setSearchInput] = useState('');

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedReport, setSelectedReport] = useState<WorkReport | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<DocumentationPhoto | null>(null);
  const [adminReviewNotes, setAdminReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // State untuk Unduh Arsip Foto Raw (.ZIP kompatibel WinRAR) & Offload Database
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveTargetReports, setArchiveTargetReports] = useState<WorkReport[]>([]);
  const [archivePreviewEntries, setArchivePreviewEntries] = useState<ArchivePhotoEntry[]>([]);
  const [archivePreparing, setArchivePreparing] = useState(false);
  const [archiveDownloading, setArchiveDownloading] = useState(false);
  const [archiveOffloadDb, setArchiveOffloadDb] = useState(true);
  const [archiveScopeTitle, setArchiveScopeTitle] = useState('Semua Laporan pada Filter');

  // Feedback banner & reversible undo state
  const [actionBanner, setActionBanner] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
    undoLabel?: string;
    onUndo?: () => Promise<void> | void;
  } | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetchAdminProjects({
        search: projectSearch,
        serviceType: projectServiceType,
        status: projectStatus,
        page: projectPage,
        limit: 8,
      });
      setProjects(res.projects);
      setProjectTotalPages(res.totalPages || 1);
      setProjectTotalCount(res.totalCount || res.projects.length);
    } catch (err) {
      console.error(err);
    }
  }, [projectSearch, projectServiceType, projectStatus, projectPage]);

  useEffect(() => {
    setProjectPage(1);
  }, [projectSearch, projectServiceType, projectStatus]);

  useEffect(() => {
    if (activeTab === 'projects') {
      const t = setTimeout(loadProjects, 300);
      return () => clearTimeout(t);
    }
  }, [loadProjects, activeTab]);

  /** Unduh Laporan Kunjungan (PDF) untuk laporan yang sedang dibuka. */
  const handleDownloadVisitReport = async () => {
    if (!selectedReport || pdfBusy) return;
    setPdfBusy(true);
    try {
      const companyId =
        user?.role === 'MASTER_SUPER_ADMIN' || user?.role === 'SUPERADMIN' ? activeCompanyId : user?.companyId;
      await exportReportToPdf(selectedReport, undefined, {
        companyId,
        createdBy: user?.name ?? selectedReport.executorName,
      });
    } catch (err) {
      console.error('[pdf] gagal membuat laporan kunjungan', err);
      setActionBanner({
        tone: 'error',
        message: 'Gagal membuat PDF laporan kunjungan. Periksa data laporan lalu coba lagi.',
      });
    } finally {
      setPdfBusy(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [filters, datePreset, searchInput]);

  const effectiveFilters = useMemo<ReportFilters>(
    () => ({ ...filters, ...presetToRange(datePreset), search: searchInput, page, limit: 20 }),
    [filters, datePreset, searchInput, page]
  );

  const loadReports = useCallback(async () => {
    if (!isAdmin || (isSuper && !activeCompanyId)) return;
    setReportsLoading(true);
    setReportsError(null);
    try {
      const res = await fetchAdminReports(effectiveFilters);
      setReports(res.reports);
      setTotalPages(res.totalPages || 1);
      setTotalCount(res.totalCount || res.reports.length);
    } catch (err) {
      setReportsError(
        err instanceof ApiError
          ? err.message
          : 'Daftar laporan belum dapat dimuat. Periksa koneksi internet Anda lalu coba lagi.'
      );
    } finally {
      setReportsLoading(false);
    }
  }, [effectiveFilters, isAdmin, isSuper, activeCompanyId]);

  useEffect(() => {
    if (!isAdmin || (isSuper && !activeCompanyId)) return;
    const t = setTimeout(loadReports, 300);
    return () => clearTimeout(t);
  }, [loadReports, isAdmin, isSuper, activeCompanyId]);

  const loadInitialDashboard = useCallback(async () => {
    if (!isAdmin || (isSuper && !activeCompanyId)) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    setStaleRefreshError(null);
    try {
      const targetCompany = (isSuper ? activeCompanyId : user?.companyId) ?? '';
      const [summary, projectRes, executorList, quos, latestLocs] = await Promise.all([
        fetchAdminSummary(),
        fetchAdminProjects({ limit: 24, page: 1 }),
        fetchExecutors(),
        targetCompany ? getQuotations({ companyId: targetCompany }).catch(() => []) : Promise.resolve([]),
        fetchLatestLocations().catch(() => []),
      ]);
      setSummaryData(summary);
      setProjects(projectRes.projects);
      setProjectTotalPages(projectRes.totalPages || 1);
      setProjectTotalCount(projectRes.totalCount || projectRes.projects.length);
      setExecutors(executorList);
      setQuotationsList(quos);
      setUserLocations(latestLocs);
      await loadReports();
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : 'Ringkasan operasional belum dapat dimuat. Periksa koneksi internet Anda lalu coba lagi.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, isSuper, activeCompanyId, user?.companyId, loadReports]);

  // Reset state saat SUPERADMIN berpindah perusahaan agar data perusahaan lama tidak pernah ditampilkan sebagai data baru
  useEffect(() => {
    setSummaryData(null);
    setQuotationsList([]);
    setReports([]);
    setProjects([]);
    setExecutors([]);
    setRiskConfig(null);
    setAdminUsers([]);
    setSelectedReportId(null);
    setSelectedProject(null);
    setLoadError(null);
    setStaleRefreshError(null);
    void loadInitialDashboard();
  }, [isAdmin, isSuper, activeCompanyId, loadInitialDashboard]);

  const refreshSummaryAndReports = useCallback(async () => {
    if (!isAdmin || (isSuper && !activeCompanyId)) return;
    setIsRefreshingSummary(true);
    setStaleRefreshError(null);
    try {
      const targetCompany = (isSuper ? activeCompanyId : user?.companyId) ?? '';
      const [summary, quos] = await Promise.all([
        fetchAdminSummary(),
        targetCompany ? getQuotations({ companyId: targetCompany }).catch(() => quotationsList) : Promise.resolve([]),
        loadReports(),
      ]);
      setSummaryData(summary);
      setQuotationsList(quos);
      setLoadError(null);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Pembaruan ringkasan gagal dimuat. Periksa koneksi internet Anda lalu coba lagi.';
      if (summaryData) {
        setStaleRefreshError(msg);
      } else {
        setLoadError(msg);
      }
    } finally {
      setIsRefreshingSummary(false);
    }
  }, [isAdmin, isSuper, activeCompanyId, user?.companyId, loadReports, summaryData, quotationsList]);

  const quotationSummary = useMemo<ExecutiveQuotationSummary | null>(() => {
    if (!isAdmin) return null;
    const totalQuotations = quotationsList.length;
    const draftCount = quotationsList.filter(q => q.status === 'draft' || q.status === 'pending').length;
    const approvedCount = quotationsList.filter(q => q.status === 'approved' || q.status === 'sent_to_client').length;
    const dealCount = quotationsList.filter(q => q.status === 'deal').length;
    return {
      totalQuotations,
      draftCount,
      approvedCount,
      dealCount,
      onOpenQuotations: () => setActiveTab('quotation'),
    };
  }, [isAdmin, quotationsList]);

  useEffect(() => {
    if (!isAdmin || (isSuper && !activeCompanyId)) return;
    if ((activeTab === 'risk-config' || activeTab === 'templates' || activeTab === 'reports' || activeTab === 'anomalies') && riskConfig === null) {
      fetchRiskConfig()
        .then(setRiskConfig)
        .catch(() => undefined);
    }
    if (activeTab === 'tracking') {
      fetchLatestLocations()
        .then(setUserLocations)
        .catch(() => setUserLocations([]));
    }
    if (activeTab === 'approval' || activeTab === 'executors') {
      fetchUsers()
        .then(setAdminUsers)
        .catch(() => setAdminUsers([]));
    }
  }, [activeTab, riskConfig, isAdmin, isSuper, activeCompanyId]);

  useEffect(() => {
    if (!selectedReportId) {
      setSelectedReport(null);
      return;
    }
    setDetailLoading(true);
    fetchAdminReportDetail(selectedReportId)
      .then(setSelectedReport)
      .catch(() => setSelectedReport(null))
      .finally(() => setDetailLoading(false));
  }, [selectedReportId]);

  const visibleReports = useMemo(() => {
    if (activeTab === 'anomalies') return reports.filter(r => r.status === 'FLAGGED' || r.riskScore >= 40);
    return reports;
  }, [reports, activeTab]);

  const handleSelectStatusFromBento = useCallback(
    (nextStatus: string) => {
      setPreviousStatusFilter(filters.status);
      setFilters(prev => ({ ...prev, status: nextStatus }));
      if (nextStatus !== 'ALL') {
        setCameFromDashboard(true);
        setActiveTab(nextStatus === 'FLAGGED' ? 'anomalies' : 'reports');
      }
    },
    [filters.status]
  );

  const handleUndoStatusFilter = useCallback(() => {
    if (previousStatusFilter === null) return;
    setFilters(prev => ({ ...prev, status: previousStatusFilter }));
    setPreviousStatusFilter(null);
    if (cameFromDashboard) {
      setCameFromDashboard(false);
      setActiveTab('dashboard');
    }
  }, [previousStatusFilter, cameFromDashboard]);

  const handleResetAllFilters = useCallback(() => {
    setPreviousFiltersSnapshot({
      filters: { ...filters },
      datePreset,
      searchInput,
    });
    setFilters(DEFAULT_FILTERS);
    setDatePreset('all');
    setSearchInput('');
  }, [filters, datePreset, searchInput]);

  const handleUndoResetAllFilters = useCallback(() => {
    if (!previousFiltersSnapshot) return;
    setFilters(previousFiltersSnapshot.filters);
    setDatePreset(previousFiltersSnapshot.datePreset);
    setSearchInput(previousFiltersSnapshot.searchInput);
    setPreviousFiltersSnapshot(null);
  }, [previousFiltersSnapshot]);

  const hasActiveReportFilters =
    filters.status !== 'ALL' ||
    filters.riskLevel !== 'ALL' ||
    filters.executorId !== 'ALL' ||
    filters.projectId !== 'ALL' ||
    filters.serviceType !== 'ALL' ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate) ||
    Boolean(filters.timeStart) ||
    Boolean(filters.timeEnd) ||
    datePreset !== 'all' ||
    Boolean(searchInput.trim());

  const handleGenerateInvite = async (role: AdminUser['role']) => {
    const companyId = (isSuper ? activeCompanyId : user?.companyId) ?? null;
    if (!user || !companyId) {
      setActionBanner({ tone: 'error', message: 'Pilih perusahaan terlebih dahulu sebelum membuat link undangan.' });
      return;
    }
    try {
      setIsGeneratingInvite(true);
      const res = await generateInvite(role, { companyId, createdBy: user.uid });
      const url = `${window.location.origin}/signup?invite=${res.token}`;
      setInviteLink({ url, expiresAt: res.expiresAt.toLocaleString('id-ID') });
    } catch (err) {
      setActionBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat link undangan. Coba lagi.',
      });
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingUser) return;
    setCreatingUser(true);
    try {
      const created = await createUser({ ...newUser, phone: newUser.phone || undefined });
      setAdminUsers(prev => [created, ...prev]);
      setNewUser({ name: '', email: '', password: DEFAULT_ACCOUNT_PASSWORD, role: 'TEKNISI_LAPANGAN', phone: '' });
      setActionBanner({
        tone: 'success',
        message: `Akun ${created.email} berhasil dibuat. Bagikan email dan kata sandi awal kepada pengguna.`,
      });
    } catch (err) {
      setActionBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat akun pengguna. Periksa kembali data input.',
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleResetPasswordToDefault = async (targetUser: AdminUser) => {
    try {
      const resetPw = await resetUserPassword(targetUser.id, targetUser.email);
      setActionBanner({
        tone: 'success',
        message: `Kata sandi akun ${targetUser.name} (${targetUser.email}) berhasil direset menjadi default: ${resetPw}.`,
      });
    } catch (err) {
      setActionBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal mereset kata sandi pengguna.',
      });
    }
  };

  const handleActivate = async (targetUser: AdminUser) => {
    if (!isDirector && targetUser.role === 'ADMIN') {
      setActionBanner({
        tone: 'error',
        message: 'Admin tidak memiliki wewenang untuk mengubah status akun Admin lain. Hanya Direktur yang berwenang.',
      });
      return;
    }
    try {
      await activateUser(targetUser.id);
      setAdminUsers(prev => prev.map(u => (u.id === targetUser.id ? { ...u, is_active: true } : u)));
      setActionBanner({
        tone: 'success',
        message: `Akun ${targetUser.name} telah diaktifkan kembali.`,
        undoLabel: 'Urungkan',
        onUndo: async () => {
          await suspendUser(targetUser.id);
          setAdminUsers(prev => prev.map(u => (u.id === targetUser.id ? { ...u, is_active: false } : u)));
          setActionBanner(null);
        },
      });
    } catch (err) {
      setActionBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengaktifkan akun pengguna.',
      });
    }
  };

  const handleSuspend = async (targetUser: AdminUser) => {
    if (!isDirector && targetUser.role === 'ADMIN') {
      setActionBanner({
        tone: 'error',
        message: 'Admin tidak memiliki wewenang untuk menonaktifkan akun Admin lainnya. Hanya Direktur yang berwenang.',
      });
      return;
    }
    try {
      await suspendUser(targetUser.id);
      setAdminUsers(prev => prev.map(u => (u.id === targetUser.id ? { ...u, is_active: false } : u)));
      setActionBanner({
        tone: 'info',
        message: `Akun ${targetUser.name} dinonaktifkan sementara.`,
        undoLabel: 'Urungkan (Aktifkan Kembali)',
        onUndo: async () => {
          await activateUser(targetUser.id);
          setAdminUsers(prev => prev.map(u => (u.id === targetUser.id ? { ...u, is_active: true } : u)));
          setActionBanner(null);
        },
      });
    } catch (err) {
      setActionBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal menonaktifkan akun pengguna.',
      });
    }
  };

  const handleDeleteUser = async (id: string) => {
    const targetUser = adminUsers.find(u => u.id === id);
    if (!isDirector && targetUser?.role === 'ADMIN') {
      setActionBanner({
        tone: 'error',
        message: 'Admin tidak memiliki wewenang untuk menghapus akun Admin lainnya. Hanya Direktur yang berwenang.',
      });
      return;
    }
    try {
      await deleteUser(id);
      setAdminUsers(prev => prev.filter(u => u.id !== id));
      setActionBanner({ tone: 'success', message: 'Akun pengguna berhasil dihapus secara permanen.' });
    } catch (e: any) {
      setActionBanner({
        tone: 'error',
        message: e?.message || 'Gagal menghapus akun pengguna. Pastikan pengguna bukan satu-satunya Admin aktif.',
      });
    }
  };

  const handleExportExcel = () => {
    exportTableToExcel(reports, 'Laporan_FieldWork');
  };

  const handleExportPDF = () => {
    const cols = ['projectName', 'clientName', 'executorName', 'status', 'riskScore'];
    exportTableToPDF(reports, cols, 'Laporan Lapangan', 'Laporan_FieldWork');
  };

  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await downloadReportsCsv(effectiveFilters);
    } catch {
      setActionBanner({
        tone: 'error',
        message: 'Gagal mengekspor CSV. Periksa koneksi internet Anda lalu coba lagi.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Membuka modal Unduh Arsip Foto Raw (.ZIP kompatibel WinRAR) untuk 1 laporan yang sedang dibuka.
   */
  const handleOpenArchiveForSingleReport = (report: WorkReport) => {
    const entries = buildArchivePhotoEntries([report]);
    setArchiveScopeTitle(`${report.clientName || report.projectName} — ${report.executorName}`);
    setArchiveTargetReports([report]);
    setArchivePreviewEntries(entries);
    setArchiveOffloadDb(true);
    setArchiveModalOpen(true);
  };

  /**
   * Membuka modal Unduh Arsip Foto Raw (.ZIP kompatibel WinRAR) untuk seluruh laporan pada daftar filter aktif.
   */
  const handleOpenArchiveForFilteredReports = async () => {
    if (archivePreparing) return;
    setArchivePreparing(true);
    setArchiveModalOpen(true);
    setArchiveScopeTitle(`Filter Laporan Aktif (${visibleReports.length} Laporan)`);
    try {
      const fullReports = await Promise.all(
        visibleReports.map(r => fetchAdminReportDetail(r.id).catch(() => null))
      );
      const validReports = fullReports.filter((r): r is WorkReport => r !== null);
      const entries = buildArchivePhotoEntries(validReports);
      setArchiveTargetReports(validReports);
      setArchivePreviewEntries(entries);
      setArchiveOffloadDb(true);
    } finally {
      setArchivePreparing(false);
    }
  };

  /**
   * Mengeksekusi pengunduhan arsip foto raw (.ZIP / WinRAR) dengan nama file sesuai
   * Tanggal + Laporan/Pelanggan + Teknisi + Tahap, serta menghapus foto raw dari DB
   * sementara salinan foto di dalam PDF tetap tersimpan aman.
   */
  const handleExecuteArchiveDownload = async () => {
    if (archiveDownloading || archivePreviewEntries.length === 0) return;
    setArchiveDownloading(true);
    try {
      const result = await downloadRawPhotosArchiveAndOffload(archiveTargetReports, {
        offloadRawFromDb: archiveOffloadDb,
      });

      if (selectedReportId && archiveTargetReports.some(r => r.id === selectedReportId)) {
        const refreshed = await fetchAdminReportDetail(selectedReportId).catch(() => null);
        if (refreshed) setSelectedReport(refreshed);
      }
      await loadReports();

      const freedKb = Math.max(1, Math.round(result.freedBytesEstimate / 1024));
      setArchiveModalOpen(false);
      setActionBanner({
        tone: 'success',
        message: result.offloadedFromDb
          ? `Arsip ${result.archiveFilename} (${result.totalPhotosArchived} foto raw) berhasil diunduh. Kuota database dihemat ±${freedKb} KB & foto di dalam PDF Laporan Kunjungan tetap tersimpan utuh.`
          : `Arsip ${result.archiveFilename} (${result.totalPhotosArchived} foto raw) berhasil diunduh.`,
      });
    } catch (err) {
      setActionBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat arsip foto raw.',
      });
    } finally {
      setArchiveDownloading(false);
    }
  };

  const handleAdminReview = async () => {
    if (!selectedReportId || !adminReviewNotes.trim() || isSubmittingReview) return;
    setIsSubmittingReview(true);
    try {
      const updated = await reviewReport(selectedReportId, adminReviewNotes.trim());
      setSelectedReport(updated);
      setIsReviewing(false);
      setAdminReviewNotes('');
      await refreshSummaryAndReports();
    } catch (err) {
      setActionBanner({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal menyimpan verifikasi laporan. Coba lagi.',
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleSaveRiskConfig = async (partial: Partial<RiskConfig>) => {
    const updated = await updateRiskConfig(partial);
    setRiskConfig(updated);
  };

  const handleResetRiskConfigWithUndo = async () => {
    const previous = riskConfig ? { ...riskConfig } : null;
    const reset = await resetRiskConfig();
    setRiskConfig(reset);
    if (previous) {
      setActionBanner({
        tone: 'info',
        message: 'Konfigurasi poin risiko dikembalikan ke standar bawaan.',
        undoLabel: 'Urungkan',
        onUndo: async () => {
          const restored = await updateRiskConfig(previous);
          setRiskConfig(restored);
          setActionBanner(null);
        },
      });
    }
  };

  // Menu terkonsolidasi menjadi 10 modul utama yang fokus (tanpa duplikasi halaman di sidebar)
  // dengan tetap mendukung penuh seluruh alias activeTab lama dan grup standar.
  const isMarketingUser = user?.role === 'MARKETING';
  const ALL_ITEMS: {
    id: Tab;
    label: string;
    shortLabel: string;
    group: string;
    icon: React.ReactNode;
    danger?: boolean;
    badge?: number;
    roles: string[];
    keywords?: string[];
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Dashboard',
      group: '',
      icon: <LayoutDashboard size={16} />,
      roles: ['ADMIN', 'SUPERADMIN'],
      keywords: ['dashboard', 'ringkasan', 'kpi'],
    },
    {
      id: 'reports',
      label: 'Laporan Kerja',
      shortLabel: 'Laporan Kerja',
      group: '',
      icon: kpi.flaggedJobs > 0 ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} />,
      danger: kpi.flaggedJobs > 0,
      badge: kpi.flaggedJobs > 0 ? kpi.flaggedJobs : undefined,
      roles: ['ADMIN', 'SUPERADMIN'],
      keywords: ['laporan kerja', 'digital report', 'verifikasi', 'pdf'],
    },
    {
      id: 'tracking',
      label: 'Peta Lokasi',
      shortLabel: 'Peta Lokasi',
      group: '',
      icon: <MapPin size={16} />,
      roles: ['ADMIN', 'SUPERADMIN'],
      keywords: ['lokasi teknisi', 'gps', 'peta'],
    },
    {
      id: 'customers',
      label: 'Pelanggan',
      shortLabel: 'Pelanggan',
      group: '',
      icon: <Users size={16} />,
      roles: ['ADMIN', 'SUPERADMIN'],
      keywords: ['pelanggan', 'klien', 'koordinat', 'radius'],
    },
    {
      id: 'approval',
      label: 'Tim & Akun',
      shortLabel: 'Tim & Akun',
      group: '',
      icon: <UserCheck size={16} />,
      roles: ['ADMIN', 'SUPERADMIN'],
      keywords: ['teknisi', 'anggota', 'akun', 'tim'],
    },
    {
      id: 'templates',
      label: 'Pengaturan',
      shortLabel: 'Pengaturan',
      group: '',
      icon: <Settings2 size={16} />,
      roles: ['ADMIN', 'SUPERADMIN'],
      keywords: ['pengaturan', 'kop', 'radius', 'profil'],
    },
  ];

  // Petakan alias tab lama ke ID menu induk di sidebar agar highlight menu selalu akurat
  const sidebarActiveTabId = useMemo<Tab>(() => {
    if (activeTab === 'kontrol-rayap') return 'customers';
    if (activeTab === 'projects') return 'spk-cms';
    if (activeTab === 'anomalies') return 'reports';
    if (activeTab === 'cashflow' || activeTab === 'performa') return 'order-tracking';
    if (activeTab === 'executors') return 'approval';
    if ((activeTab === 'risk-config' || activeTab === 'profile') && isAdmin) {
      return 'templates';
    }
    return activeTab;
  }, [activeTab, isAdmin]);

  const sidebarItems = ALL_ITEMS.filter(i => user && i.roles.includes(user.role));
  const currentTabMeta = sidebarItems.find(i => i.id === sidebarActiveTabId) ?? sidebarItems[0];

  const handleHeaderRefresh = useCallback(() => {
    if (activeTab === 'projects') {
      void loadProjects();
      return;
    }
    if (activeTab === 'dashboard') {
      void refreshSummaryAndReports();
      return;
    }
    if (activeTab === 'reports' || activeTab === 'anomalies') {
      void loadReports();
      return;
    }
    if (activeTab === 'tracking') {
      void fetchLatestLocations().then(setUserLocations);
      return;
    }
    if (activeTab === 'approval') {
      void fetchUsers().then(setAdminUsers);
      return;
    }
    void refreshSummaryAndReports();
  }, [activeTab, loadProjects, loadReports, refreshSummaryAndReports]);

  // Konfigurasi kompatibilitas indikator mobile bottom navigation (dipertahankan untuk invariant showFloatingBottom = true)
  const showFloatingBottom = true;

  return (
    <AppLayout
      sidebarItems={sidebarItems}
      activeTab={sidebarActiveTabId}
      onTabChange={id => {
        setCameFromDashboard(false);
        setActiveTab(id as Tab);
      }}
      isSidebarOpen={mobileMenuOpen}
      onSidebarOpenChange={setMobileMenuOpen}
      header={
        <Header
          currentUser={user!}
          onLogout={logout}
          onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
          mobileMenuOpen={mobileMenuOpen}
          pageTitle={currentTabMeta?.label ?? 'PT Guci Emas Pratama'}
          pageGroup={currentTabMeta?.group}
          onRefresh={handleHeaderRefresh}
          modules={sidebarItems}
          activeModuleId={sidebarActiveTabId}
          onSelectModule={id => {
            setCameFromDashboard(false);
            setActiveTab(id as Tab);
          }}
          onOpenAppGuide={() => {
            setMobileMenuOpen(false);
            setAppGuideMode('hub');
          }}
        />
      }
      dynamicIslandItems={showFloatingBottom ? [] : []}
      sidebarHeader={
        <div>
          <strong className="block text-sm leading-tight font-bold text-white">
            Fieldwork
          </strong>
          <p className="text-[11px] text-white/75 mt-0.5">
            PT Guci Emas Pratama
          </p>
          {isSuper && <CompanyPicker />}
        </div>
      }
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
        {isSuper && !activeCompanyId && (
          <div
            role="status"
            className="p-4 rounded-xl border border-[var(--status-draft-border)] bg-[var(--status-draft-bg)] text-sm text-[var(--status-draft-text)]"
          >
            Pilih perusahaan yang akan dikelola pada menu di sidebar untuk mulai melihat ringkasan operasional dan mengatur template.
          </div>
        )}

        {/* Global Action / Undo Feedback Banner */}
        {actionBanner && (
          <div
            role="status"
            aria-live="polite"
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs sm:text-sm ${
              actionBanner.tone === 'error'
                ? 'bg-[var(--status-flagged-bg)] border-[var(--status-flagged-border)] text-[var(--status-flagged-text)]'
                : actionBanner.tone === 'success'
                ? 'bg-[var(--status-completed-bg)] border-[var(--status-completed-border)] text-[var(--status-completed-text)]'
                : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-primary)]'
            }`}
          >
            <span className="font-medium">{actionBanner.message}</span>
            <div className="flex items-center gap-2 shrink-0">
              {actionBanner.onUndo && actionBanner.undoLabel && (
                <button
                  type="button"
                  onClick={() => void actionBanner.onUndo?.()}
                  className="px-3 py-1 rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold hover:bg-[var(--bg-tertiary)] transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  <span>{actionBanner.undoLabel}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActionBanner(null)}
                aria-label="Tutup pesan status"
                className="p-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Tab Dashboard: Fokus HANYA pada Data & Visual Penting (Tanpa Tabel Panjang yang Menumpuk di Bawah) */}
        {activeTab === 'dashboard' && (
          <OperationsAnalyticsBento
            summary={summaryData}
            quotationSummary={quotationSummary}
            reports={reports}
            projects={projects}
            executors={executors}
            quotations={quotationsList}
            userLocations={userLocations}
            companyDisplayName={user?.name || 'Gucimas Pratama'}
            isLoading={isLoading}
            isRefreshing={isRefreshingSummary}
            error={loadError}
            staleRefreshError={staleRefreshError}
            activeStatusFilter={filters.status}
            previousStatusFilter={previousStatusFilter}
            onRetry={loadInitialDashboard}
            onRefresh={refreshSummaryAndReports}
            onSelectStatusFilter={handleSelectStatusFromBento}
            onUndoStatusFilter={handleUndoStatusFilter}
            onOpenAnomaliesTab={() => {
              setCameFromDashboard(true);
              setActiveTab('anomalies');
            }}
            onOpenReportsTab={() => {
              setCameFromDashboard(true);
              setActiveTab('reports');
            }}
            onOpenExecutorsTab={() => {
              setCameFromDashboard(true);
              setActiveTab('executors');
            }}
            onOpenProjectsTab={() => {
              setCameFromDashboard(true);
              setActiveTab('projects');
            }}
            onOpenQuotationsTab={() => {
              setCameFromDashboard(true);
              setActiveTab('quotation');
            }}
            onOpenCustomersTab={() => {
              setCameFromDashboard(true);
              setActiveTab('customers');
            }}
            onOpenReportDetail={id => setSelectedReportId(id)}
          />
        )}

        {/* Non-dashboard loading & error states */}
        {activeTab !== 'dashboard' && isLoading && (
          <div className="clean-card p-6 space-y-3" aria-busy="true">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        )}

        {activeTab !== 'dashboard' && loadError && !isLoading && (
          <div
            role="alert"
            className="bg-[var(--status-flagged-bg)] border border-[var(--status-flagged-border)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <p className="text-xs sm:text-sm text-[var(--status-flagged-text)] font-medium">{loadError}</p>
            <button
              type="button"
              onClick={loadInitialDashboard}
              className="self-start sm:self-auto px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!isLoading && (
          <AnimatePresence mode="wait" initial={false}>
            <MotionDiv
              key={activeTab}
              variants={ADMIN_TAB_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              {(activeTab === 'reports' || activeTab === 'anomalies') && (
                <div className="space-y-4">
                  {/* Navigasi Kembali & Undo jika pengguna masuk dari klik status di Dashboard */}
                  {cameFromDashboard && (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={() => {
                          setCameFromDashboard(false);
                          setActiveTab('dashboard');
                        }}
                        className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent-text)] transition-colors cursor-pointer"
                      >
                        <ArrowLeft size={15} aria-hidden="true" />
                        <span>Kembali ke Dashboard</span>
                      </button>
                      {previousStatusFilter !== null && (
                        <button
                          type="button"
                          onClick={handleUndoStatusFilter}
                          className="px-3 py-1 rounded-lg bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          Urungkan Filter Status
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── 5 Kartu Ringkasan KPI (Laporan Kerja — Fieldwork Glassmorphism & Micro-Interactions) ── */}
                  <div data-app-tour="reports-kpi" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('reports');
                        setFilters(prev => ({ ...prev, status: 'ALL' }));
                      }}
                      className={`kpi-card neutral group text-left cursor-pointer ${
                        activeTab === 'reports' && filters.status === 'ALL'
                          ? 'ring-2 ring-[var(--accent)]/40 border-[var(--accent)]'
                          : ''
                      }`}
                    >
                      <div>
                        <span>Semua Laporan</span>
                        <span className="text-[11px] font-semibold text-[#1f7a4c] dark:text-emerald-300 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150 whitespace-nowrap shrink-0">
                          Semua ›
                        </span>
                      </div>
                      <strong className="font-mono tabular-nums tracking-tight">
                        {kpi.totalJobs || reports.length}
                      </strong>
                      <small className="group-hover:text-[var(--text-secondary)] transition-colors duration-150">
                        Klik tampilkan semua
                      </small>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('reports');
                        setFilters(prev => ({ ...prev, status: 'COMPLETED' }));
                      }}
                      className={`kpi-card completed group text-left cursor-pointer ${
                        activeTab === 'reports' && filters.status === 'COMPLETED'
                          ? 'ring-2 ring-emerald-600/35 border-emerald-600'
                          : ''
                      }`}
                    >
                      <div>
                        <span>Selesai</span>
                        <span className="text-[11px] font-semibold text-[#1f7a4c] dark:text-emerald-300 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150 whitespace-nowrap shrink-0">
                          Filter ›
                        </span>
                      </div>
                      <strong className="font-mono tabular-nums tracking-tight">
                        {kpi.completedJobs}
                      </strong>
                      <small className="group-hover:text-[var(--text-secondary)] transition-colors duration-150">
                        Tugas tuntas
                      </small>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('anomalies')}
                      className={`kpi-card flagged group text-left cursor-pointer ${
                        activeTab === 'anomalies'
                          ? 'ring-2 ring-rose-600/35 border-rose-600'
                          : ''
                      }`}
                    >
                      <div>
                        <span>Perlu Dicek</span>
                        <span className="text-[11px] font-semibold text-[#b54141] dark:text-rose-300 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150 whitespace-nowrap shrink-0">
                          Tinjau ›
                        </span>
                      </div>
                      <strong className="font-mono tabular-nums tracking-tight">
                        {kpi.flaggedJobs}
                      </strong>
                      <small className="group-hover:text-[var(--text-secondary)] transition-colors duration-150">
                        Risiko / Di luar radius
                      </small>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('reports');
                        setFilters(prev => ({ ...prev, status: 'WORKING' }));
                      }}
                      className={`kpi-card working group text-left cursor-pointer ${
                        activeTab === 'reports' && filters.status === 'WORKING'
                          ? 'ring-2 ring-amber-600/35 border-amber-600'
                          : ''
                      }`}
                    >
                      <div>
                        <span>Sedang Kerja</span>
                        <span className="text-[11px] font-semibold text-[#b47818] dark:text-amber-300 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150 whitespace-nowrap shrink-0">
                          Pantau ›
                        </span>
                      </div>
                      <strong className="font-mono tabular-nums tracking-tight">
                        {kpi.workingJobs}
                      </strong>
                      <small className="group-hover:text-[var(--text-secondary)] transition-colors duration-150">
                        On-site aktif
                      </small>
                    </button>

                    <div className="kpi-card ready col-span-2 sm:col-span-1 cursor-default">
                      <div>
                        <span>Rata-Rata Durasi</span>
                        <Clock size={13} className="text-[#356c91] dark:text-sky-300 shrink-0" />
                      </div>
                      <strong className="font-mono tabular-nums tracking-tight">
                        {kpi.avgDurationMinutes}m
                      </strong>
                      <small>
                        Skor Risiko Rata-rata: {kpi.avgRiskScore}
                      </small>
                    </div>
                  </div>

                  {activeTab === 'anomalies' && (
                    <div className="bg-[var(--status-flagged-bg)] border border-[var(--status-flagged-border)] rounded-xl p-4 mb-4">
                      <h3 className="text-sm font-bold text-[var(--status-flagged-text)] mb-1.5">
                        Informasi &amp; Kriteria Anomali
                      </h3>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        Sistem mendeteksi sebuah penugasan sebagai <strong>Anomali</strong> apabila memenuhi salah satu dari kriteria berikut sesuai konfigurasi perusahaan:
                      </p>
                      <ul className="list-disc list-inside text-xs sm:text-sm text-[var(--text-secondary)] mt-2 space-y-1 ml-1">
                        <li>
                          Radius Check-In &amp; Check-Out melebihi toleransi (maks.{' '}
                          {riskConfig?.locationDriftThresholdMeters || 200} meter).
                        </li>
                        <li>
                          Durasi pekerjaan terlalu singkat (kurang dari{' '}
                          {riskConfig?.shortDurationCriticalMinutes || 15} menit).
                        </li>
                        <li>Pekerjaan tidak memiliki foto progres pekerjaan atau data treatment.</li>
                      </ul>
                    </div>
                  )}

                  {/* Filter & Action Toolbar (2 Baris Terstruktur) */}
                  <div data-app-tour="reports-toolbar" className="clean-card p-4 sm:p-5 space-y-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)]">
                    {/* Baris 1: Pencarian Lebar di Kiri + Aksi Rekap & Unduh di Kanan */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="relative flex-1 min-w-[240px]">
                        <Search
                          size={15}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                          aria-hidden="true"
                        />
                        <input
                          type="text"
                          aria-label="Cari pelaksana, nama proyek, atau alamat"
                          placeholder="Cari pelaksana, nama proyek, atau alamat..."
                          value={searchInput}
                          onChange={e => setSearchInput(e.target.value)}
                          className="w-full h-9 pl-9 pr-8 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        />
                        {searchInput && (
                          <button
                            type="button"
                            aria-label="Bersihkan pencarian"
                            onClick={() => setSearchInput('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {canGenerateMonthlyRecap(user?.role) && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setRecapModalMode('PCO');
                                setShowMonthlyRecapModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-semibold transition-colors cursor-pointer"
                              title="Buat Laporan Rekapitulasi Pest Control & Kalkulator Permenkes No. 2 Tahun 2023"
                            >
                              <FileText size={13} className="text-[var(--text-muted)]" />
                              <span>Rekap Pest Control</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRecapModalMode('AR');
                                setShowMonthlyRecapModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-semibold transition-colors cursor-pointer"
                              title="Buat Laporan Rekapitulasi Pengendalian & Monitoring Anti Rayap"
                            >
                              <FileText size={13} className="text-[var(--text-muted)]" />
                              <span>Rekap Anti Rayap</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleOpenArchiveForFilteredReports()}
                          disabled={archivePreparing || visibleReports.length === 0}
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                          title="Unduh Arsip Foto Raw (.ZIP kompatibel WinRAR) dengan nama file sesuai Laporan, Teknisi & Tanggal, sekaligus optimasi kuota Database"
                        >
                          <Download size={13} />
                          <span>{archivePreparing ? 'Menyiapkan Foto...' : 'Arsip Foto Raw (RAR/ZIP)'}</span>
                        </button>

                        <div className="inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden divide-x divide-[var(--border-subtle)]">
                          <button
                            type="button"
                            onClick={handleExportPDF}
                            className="inline-flex items-center gap-1.5 h-9 px-3 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-semibold transition-colors cursor-pointer"
                            title="Unduh Laporan (PDF)"
                          >
                            <Download size={13} className="text-[var(--text-muted)]" />
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleExportExcel}
                            className="inline-flex items-center gap-1.5 h-9 px-3 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-semibold transition-colors cursor-pointer"
                            title="Unduh Laporan (Excel)"
                          >
                            <span>Excel</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleExportCsv}
                            disabled={isExporting}
                            className="inline-flex items-center gap-1.5 h-9 px-3 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer"
                            title="Unduh Laporan (CSV)"
                          >
                            <span>{isExporting ? 'Mengunduh...' : 'CSV'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Baris 2: Filter Periode + Filter Layanan + Filter Lengkap */}
                    <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-0.5 text-xs">
                          {DATE_PRESETS.map(preset => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setDatePreset(preset.id)}
                              aria-pressed={datePreset === preset.id}
                              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                                datePreset === preset.id
                                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs'
                                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        <div className="inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setFilters(prev => ({ ...prev, serviceType: 'ALL' }))}
                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                              filters.serviceType === 'ALL'
                                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            Semua Layanan
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilters(prev => ({ ...prev, serviceType: 'GENERAL_PEST_CONTROL' }))}
                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                              filters.serviceType !== 'ALL' && filters.serviceType !== 'TERMITE_CONTROL'
                                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            Pest Control
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilters(prev => ({ ...prev, serviceType: 'TERMITE_CONTROL' }))}
                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                              filters.serviceType === 'TERMITE_CONTROL'
                                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            Anti Rayap
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {hasActiveReportFilters && (
                          <button
                            type="button"
                            onClick={handleResetAllFilters}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <RotateCcw size={12} />
                            <span>Reset</span>
                          </button>
                        )}

                        {previousFiltersSnapshot && !hasActiveReportFilters && (
                          <button
                            type="button"
                            onClick={handleUndoResetAllFilters}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[var(--border-focus)] bg-[var(--accent-glow)] text-[var(--accent-text)] text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <span>Urungkan Reset</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setShowFilterDrawer(!showFilterDrawer)}
                          aria-expanded={showFilterDrawer}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                            showFilterDrawer
                              ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                              : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <SlidersHorizontal size={12} />
                          <span>Filter Lengkap</span>
                        </button>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {showFilterDrawer && (
                        <motion.div
                          key="admin-filter-drawer"
                          variants={COLLAPSE_PANEL_VARIANTS}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="overflow-hidden"
                        >
                          <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                            Dari Tanggal
                          </label>
                          <input
                            type="date"
                            value={filters.startDate ?? ''}
                            onChange={e => {
                              setFilters(prev => ({ ...prev, startDate: e.target.value }));
                              setDatePreset('custom');
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                            Sampai Tanggal
                          </label>
                          <input
                            type="date"
                            value={filters.endDate ?? ''}
                            onChange={e => {
                              setFilters(prev => ({ ...prev, endDate: e.target.value }));
                              setDatePreset('custom');
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                            Rentang Jam Check-In
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              aria-label="Jam check-in mulai"
                              value={filters.timeStart ?? ''}
                              onChange={e => setFilters(prev => ({ ...prev, timeStart: e.target.value }))}
                              className="w-full px-2 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] font-mono"
                            />
                            <span className="text-[var(--text-muted)] text-xs">-</span>
                            <input
                              type="time"
                              aria-label="Jam check-in selesai"
                              value={filters.timeEnd ?? ''}
                              onChange={e => setFilters(prev => ({ ...prev, timeEnd: e.target.value }))}
                              className="w-full px-2 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] font-mono"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                            Pelaksana
                          </label>
                          <select
                            value={filters.executorId}
                            onChange={e => setFilters(prev => ({ ...prev, executorId: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                          >
                            <option value="ALL">Semua Pelaksana</option>
                            {executors.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                            Proyek
                          </label>
                          <select
                            value={filters.projectId}
                            onChange={e => setFilters(prev => ({ ...prev, projectId: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                          >
                            <option value="ALL">Semua Proyek</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.projectName}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                            Level Risiko
                          </label>
                          <select
                            value={filters.riskLevel}
                            onChange={e => setFilters(prev => ({ ...prev, riskLevel: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                          >
                            {RISK_LEVEL_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                            Status Laporan
                          </label>
                          <select
                            value={filters.status}
                            onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                          >
                            {STATUS_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                            Jenis Layanan
                          </label>
                          <select
                            value={filters.serviceType}
                            onChange={e => setFilters(prev => ({ ...prev, serviceType: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                          >
                            {SERVICE_TYPE_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Reports Error State */}
                  {reportsError && (
                    <div
                      role="alert"
                      className="p-4 rounded-xl bg-[var(--status-flagged-bg)] border border-[var(--status-flagged-border)] text-[var(--status-flagged-text)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm"
                    >
                      <span>{reportsError}</span>
                      <button
                        type="button"
                        onClick={() => void loadReports()}
                        className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                      >
                        Coba Lagi
                      </button>
                    </div>
                  )}

                  {/* Desktop Table */}
                  <div data-app-tour="reports-table" className="hidden md:block clean-card bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-[var(--text-secondary)] min-w-[960px]">
                        <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-bold uppercase tracking-wider text-[11px]">
                          <tr>
                            <th className="px-4 py-3">Tanggal</th>
                            <th className="px-4 py-3">Pelaksana</th>
                            <th className="px-4 py-3">Proyek</th>
                            <th className="px-4 py-3">Layanan</th>
                            <th className="px-4 py-3">Check-In</th>
                            <th className="px-4 py-3">Check-Out</th>
                            <th className="px-4 py-3">Durasi</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-center">Risiko</th>
                            <th className="px-4 py-3 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {reportsLoading && visibleReports.length === 0 ? (
                            Array.from({ length: 4 }).map((_, idx) => (
                              <tr key={idx}>
                                <td colSpan={10} className="px-4 py-3">
                                  <Skeleton className="h-8 w-full rounded-lg" />
                                </td>
                              </tr>
                            ))
                          ) : visibleReports.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="text-center py-10 text-[var(--text-muted)]">
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-[var(--text-secondary)]">
                                    Tidak ada laporan yang sesuai dengan filter saat ini.
                                  </p>
                                  {hasActiveReportFilters && (
                                    <button
                                      type="button"
                                      onClick={handleResetAllFilters}
                                      className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-semibold hover:opacity-90 cursor-pointer"
                                    >
                                      Reset semua filter
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : (
                            visibleReports.map(report => {
                              const durationMin = report.durationSeconds ? Math.round(report.durationSeconds / 60) : 0;
                              const svcMeta = getServiceTypeMeta(report.project.serviceType);
                              const statusMeta = getWorkReportStatusMeta(report.status as WorkReportStatus);
                              return (
                                <tr
                                  key={report.id}
                                  className={`row-fade-in hover:bg-[var(--bg-tertiary)]/80 transition-colors ${
                                    report.riskScore >= 40 ? 'bg-[var(--status-flagged-bg)]/30' : ''
                                  }`}
                                >
                                  <td className="px-4 py-3 font-mono tabular-nums font-medium text-[var(--text-secondary)] whitespace-nowrap">
                                    {new Date(report.createdAt).toLocaleDateString('id-ID')}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="font-bold text-[var(--text-primary)] block">
                                      {report.executor.name}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 max-w-xs">
                                    <span className="font-bold text-[var(--text-primary)] truncate block">
                                      {report.project.name}
                                    </span>
                                    <span className="text-xs text-[var(--text-muted)] truncate block">
                                      {report.project.clientName}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <span
                                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${svcMeta.badgeClass}`}
                                    >
                                      {svcMeta.shortLabel}
                                    </span>
                                    {report.treatmentSummary && (
                                      <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                                        {report.treatmentSummary.chemicalName}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                                    {report.checkInAt ? (
                                      <div>
                                        <span className="font-semibold text-[var(--text-primary)]">
                                          {new Date(report.checkInAt).toLocaleTimeString('id-ID', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}{' '}
                                          WIB
                                        </span>
                                        <span
                                          className={`block text-xs ${
                                            report.checkInValid
                                              ? 'text-[var(--status-completed-text)]'
                                              : 'text-[var(--status-flagged-text)] font-bold'
                                          }`}
                                        >
                                          {report.checkInValid ? 'Valid' : 'Di Luar Radius'} (
                                          {report.checkInDistance}m)
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-[var(--text-muted)]">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                                    {report.checkOutAt ? (
                                      <span className="font-semibold text-[var(--text-primary)]">
                                        {new Date(report.checkOutAt).toLocaleTimeString('id-ID', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}{' '}
                                        WIB
                                      </span>
                                    ) : report.status === 'WORKING' ? (
                                      <span className="text-[var(--status-working-text)] font-bold">Sedang Kerja</span>
                                    ) : (
                                      <span className="text-[var(--text-muted)]">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                                    {report.durationSeconds ? (
                                      <span>
                                        {Math.floor(durationMin / 60)}j {durationMin % 60}m
                                      </span>
                                    ) : (
                                      <span className="text-[var(--text-muted)]">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <span
                                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.badgeClass}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} aria-hidden="true" />
                                      <span>{statusMeta.label}</span>
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap">
                                    <RiskBadge level={report.riskLevel} score={report.riskScore} size="sm" />
                                  </td>
                                  <td className="px-4 py-3 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedReportId(report.id)}
                                      className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--accent-glow)] text-[var(--text-primary)] font-semibold text-xs transition-colors cursor-pointer"
                                    >
                                      Buka Detail
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {visibleReports.length === 0 ? (
                      <div className="clean-card bg-[var(--bg-card)] p-6 rounded-xl text-center text-xs text-[var(--text-muted)] space-y-2">
                        <p>Tidak ada laporan yang sesuai dengan filter.</p>
                        {hasActiveReportFilters && (
                          <button
                            type="button"
                            onClick={handleResetAllFilters}
                            className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-semibold"
                          >
                            Reset semua filter
                          </button>
                        )}
                      </div>
                    ) : (
                      visibleReports.map(report => {
                        const durationMin = report.durationSeconds ? Math.round(report.durationSeconds / 60) : 0;
                        const svcMeta = getServiceTypeMeta(report.project.serviceType);
                        const statusMeta = getWorkReportStatusMeta(report.status as WorkReportStatus);
                        return (
                          <div
                            key={report.id}
                            className={`clean-card bg-[var(--bg-card)] p-4 rounded-xl border space-y-2.5 ${
                              report.riskScore >= 40
                                ? 'border-[var(--status-flagged-border)]'
                                : 'border-[var(--border-subtle)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${statusMeta.badgeClass}`}
                                >
                                  {statusMeta.label}
                                </span>
                                <RiskBadge level={report.riskLevel} score={report.riskScore} size="sm" />
                              </div>
                              <span className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                                {new Date(report.createdAt).toLocaleDateString('id-ID')}
                              </span>
                            </div>
                            <div>
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded border mb-1 ${svcMeta.badgeClass}`}
                              >
                                {svcMeta.shortLabel}
                              </span>
                              <h4 className="font-bold text-sm text-[var(--text-primary)]">{report.executor.name}</h4>
                              <p className="text-xs text-[var(--text-secondary)] font-semibold mt-0.5">
                                {report.project.name}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs bg-[var(--bg-tertiary)] p-2.5 rounded-lg border border-[var(--border-subtle)] font-mono tabular-nums">
                              <div>
                                <span className="text-xs text-[var(--text-muted)] block font-sans">CHECK-IN</span>
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {report.checkInAt
                                    ? new Date(report.checkInAt).toLocaleTimeString('id-ID', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '-'}{' '}
                                  WIB
                                </span>
                              </div>
                              <div>
                                <span className="text-xs text-[var(--text-muted)] block font-sans">CHECK-OUT</span>
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {report.checkOutAt
                                    ? new Date(report.checkOutAt).toLocaleTimeString('id-ID', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : report.status === 'WORKING'
                                    ? 'Sedang Kerja'
                                    : '-'}
                                </span>
                              </div>
                              <div className="col-span-2 pt-1 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                                <span className="text-[var(--text-muted)] font-sans">Durasi: {durationMin} menit</span>
                                {report.checkInValid === false && (
                                  <span className="text-[var(--status-flagged-text)] font-bold font-sans">
                                    GPS Di Luar Radius
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedReportId(report.id)}
                              className="w-full min-h-[44px] py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              Lihat Detail Laporan
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-[var(--border-subtle)]">
                      <span className="text-xs font-semibold text-[var(--text-muted)]">
                        Menampilkan halaman {page} dari {totalPages} (Total: {totalCount} Laporan)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:opacity-90 text-[var(--text-primary)] text-xs font-bold transition-opacity disabled:opacity-50 cursor-pointer"
                        >
                          Sebelumnya
                        </button>
                        <button
                          type="button"
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:opacity-90 text-[var(--text-primary)] text-xs font-bold transition-opacity disabled:opacity-50 cursor-pointer"
                        >
                          Selanjutnya
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(activeTab === 'projects' || activeTab === 'spk-cms') && (
                <div data-app-tour="spk-workspace" className="space-y-5">
                  {/* Unified Sub-Tab Bar: SPK | Lokasi & Daftar Proyek | Pengaturan Radius Geofence */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--bg-card)] p-2 rounded-2xl border border-[var(--border-subtle)]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {user?.role !== 'INVENTORY' && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('spk-cms')}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                            activeTab === 'spk-cms'
                              ? 'bg-[var(--accent)] text-white shadow-2xs'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                          }`}
                        >
                          Penugasan &amp; Jadwal SPK
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveTab('projects')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                          activeTab === 'projects'
                            ? 'bg-[var(--accent)] text-white shadow-2xs'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                      >
                        Lokasi &amp; Radius Proyek ({projectTotalCount || projects.length})
                      </button>
                    </div>
                  </div>

                  {activeTab === 'spk-cms' && user?.role !== 'INVENTORY' && <SPKPage />}

                  {(activeTab === 'projects' || user?.role === 'INVENTORY') && (
                    <div className="space-y-4">
                      {/* Kartu Pengaturan Radius Geofence Interaktif (Screenshot 7: beta.jarivis.com/task/setting) */}
                      {isAdmin && (
                        <div className="clean-card p-4 sm:p-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--accent-text)] block">
                              PENGATURAN RADIUS GEOFENCE TUGAS LAPANGAN
                            </span>
                            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                              Atur Besar Radius Check-In Teknisi (Sekarang: <span className="font-mono text-[var(--accent-text)]">{defaultGeofenceRadius} Meter</span>)
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)]">
                              Menentukan batas toleransi jarak GPS saat teknisi mengambil foto Check-In &amp; Check-Out di lokasi proyek
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {[50, 100, 200, 250, 500].map(rad => (
                              <button
                                key={rad}
                                type="button"
                                onClick={() => {
                                  setDefaultGeofenceRadius(rad);
                                  setGeofenceRadiusSaved(true);
                                  setTimeout(() => setGeofenceRadiusSaved(false), 2000);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors cursor-pointer ${
                                  defaultGeofenceRadius === rad
                                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                                }`}
                              >
                                {rad}m
                              </button>
                            ))}
                            {geofenceRadiusSaved && (
                              <span className="text-xs font-bold text-emerald-600 ml-1">✓ Tersimpan</span>
                            )}
                          </div>
                        </div>
                      )}
                  <div className="flex flex-col md:flex-row gap-3 p-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl">
                    <div className="flex-1 relative">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                        size={16}
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        aria-label="Cari proyek, klien, alamat, pelaksana"
                        placeholder="Cari proyek, klien, alamat, pelaksana..."
                        className="w-full pl-9 pr-4 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        value={projectSearch}
                        onChange={e => setProjectSearch(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Filter layanan proyek"
                      className="px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      value={projectServiceType}
                      onChange={e => setProjectServiceType(e.target.value)}
                    >
                      <option value="ALL">Semua Layanan</option>
                      {SERVICE_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter status proyek"
                      className="px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      value={projectStatus}
                      onChange={e => setProjectStatus(e.target.value)}
                    >
                      <option value="ALL">Semua Status</option>
                      <option value="OPEN">Terbuka</option>
                      <option value="LOCKED">Terkunci</option>
                    </select>
                  </div>

                  {projects.length === 0 ? (
                    <div className="text-center py-10 bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] border-dashed text-[var(--text-muted)] text-sm font-semibold">
                      Tidak ada proyek yang sesuai dengan pencarian Anda.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {projects.map(proj => {
                          const svcMeta = getServiceTypeMeta(proj.serviceType);
                          return (
                            <div
                              key={proj.id}
                              className="clean-card bg-[var(--bg-card)] p-5 rounded-xl border border-[var(--border-subtle)] space-y-3"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <span
                                    className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border mb-1 ${svcMeta.badgeClass}`}
                                  >
                                    {svcMeta.label}
                                  </span>
                                  <h3 className="font-bold text-base text-[var(--text-primary)]">
                                    {proj.projectName}
                                  </h3>
                                  <p className="text-xs text-[var(--text-muted)] font-medium">{proj.clientName}</p>
                                </div>
                                {proj.lockedAt ? (
                                  <span className="text-xs font-bold text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                                    Terkunci
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold text-[var(--status-completed-text)] bg-[var(--status-completed-bg)] px-2 py-0.5 rounded border border-[var(--status-completed-border)]">
                                    Terbuka
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                                <MapPin size={14} className="text-[var(--text-muted)] shrink-0 mt-0.5" aria-hidden="true" />
                                <span>{proj.address}</span>
                              </p>
                              {proj.targetFocus?.length > 0 && (
                                <p className="text-xs text-[var(--text-muted)]">
                                  Sasaran:{' '}
                                  <span className="font-semibold text-[var(--text-secondary)]">
                                    {proj.targetFocus.join(', ')}
                                  </span>
                                </p>
                              )}
                              {proj.focusTarget && (!proj.targetFocus || proj.targetFocus.length === 0) && (
                                <p className="text-xs text-[var(--text-muted)]">
                                  Sasaran:{' '}
                                  <span className="font-semibold text-[var(--text-secondary)]">{proj.focusTarget}</span>
                                </p>
                              )}
                              <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[var(--border-subtle)] text-xs grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-[var(--text-muted)] block text-[11px]">TANGGAL</span>
                                  <span className="font-semibold text-[var(--text-secondary)]">{proj.workDate}</span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block text-[11px]">RADIUS</span>
                                  <span className="font-semibold text-[var(--text-secondary)]">
                                    {proj.radius} meter
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block text-[11px]">LUAS AREA</span>
                                  <span className="font-semibold text-[var(--text-secondary)]">
                                    {proj.buildingAreaSqm ? `${proj.buildingAreaSqm} m²` : '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block text-[11px]">DIBUAT OLEH</span>
                                  <span className="font-semibold text-[var(--text-secondary)]">
                                    {proj.createdByName || '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block text-[11px]">KONTRAK</span>
                                  <span className="font-semibold text-[var(--text-secondary)]">
                                    {proj.contractType === 'RECURRING' ? 'Berkala' : 'Sekali Layanan'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block text-[11px]">GARANSI</span>
                                  <span className="font-semibold text-[var(--text-secondary)]">
                                    {proj.warrantyMonths > 0 ? `${proj.warrantyMonths} bulan` : '-'}
                                  </span>
                                </div>
                              </div>
                              {proj.contractType === 'RECURRING' && proj.nextServiceDate && (
                                <p className="text-xs text-[var(--status-working-text)] bg-[var(--status-working-bg)] px-2.5 py-1 rounded border border-[var(--status-working-border)]">
                                  Layanan berikutnya:{' '}
                                  {new Date(proj.nextServiceDate).toLocaleDateString('id-ID', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                  })}
                                </p>
                              )}
                              <div className="pt-2 border-t border-[var(--border-subtle)] mt-2 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => setSelectedProject(proj)}
                                  className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent-text)] hover:opacity-90 transition-opacity px-3 py-1.5 rounded-lg hover:bg-[var(--accent-muted)] cursor-pointer"
                                >
                                  Lihat Detail Proyek
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {projectTotalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-[var(--border-subtle)]">
                          <span className="text-xs font-semibold text-[var(--text-muted)]">
                            Menampilkan halaman {projectPage} dari {projectTotalPages} (Total: {projectTotalCount}{' '}
                            Proyek)
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setProjectPage(p => Math.max(1, p - 1))}
                              disabled={projectPage === 1}
                              className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              Sebelumnya
                            </button>
                            <button
                              type="button"
                              onClick={() => setProjectPage(p => Math.min(projectTotalPages, p + 1))}
                              disabled={projectPage === projectTotalPages}
                              className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              Selanjutnya
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

              {activeTab === 'tracking' && (
                <div className="space-y-4">
                  {/* Header Switcher: Posisi Saat Ini vs Riwayat Rute (Tanpa ikon dekoratif) */}
                  <div data-app-tour="tracking-mode-switcher" className="clean-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)]">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                        Pantau Posisi &amp; Rute Perjalanan Teknisi
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {trackingMode === 'live'
                          ? 'Menampilkan titik posisi GPS terakhir teknisi dan lokasi pelanggan saat ini.'
                          : 'Menampilkan garis jalur urutan kunjungan kerja teknisi dari lokasi ke lokasi hari ini.'}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1 bg-[var(--bg-tertiary)] p-1 rounded-lg border border-[var(--border-subtle)] self-start sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setTrackingMode('live')}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          trackingMode === 'live'
                            ? 'bg-[var(--accent)] text-white shadow-2xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        Posisi Saat Ini
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrackingMode('journey')}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          trackingMode === 'journey'
                            ? 'bg-[var(--accent)] text-white shadow-2xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        Riwayat Rute
                      </button>
                    </div>
                  </div>

                  {/* 3 Kartu Ringkasan Keaktifan Lokasi (Clean, tanpa ikon bulat dekoratif) */}
                  <div data-app-tour="tracking-activity-cards" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(() => {
                      const nowMs = Date.now();
                      const active10m = userLocations.filter(l => (nowMs - new Date(l.trackedAt).getTime()) <= 10 * 60_000).length;
                      const active60m = userLocations.filter(l => {
                        const diff = nowMs - new Date(l.trackedAt).getTime();
                        return diff > 10 * 60_000 && diff <= 60 * 60_000;
                      }).length;
                      const activeOver60m = Math.max(0, Math.max(userLocations.length, executors.length) - active10m - active60m);
                      return (
                        <>
                          <div className="clean-card p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Baru Saja Aktif
                              </span>
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            </div>
                            <span className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1.5 block">
                              {active10m}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] mt-0.5 block">
                              Update lokasi &lt; 10 menit lalu
                            </span>
                          </div>
                          <div className="clean-card p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Aktif Baru-Baru Ini
                              </span>
                              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            </div>
                            <span className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1.5 block">
                              {active60m}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] mt-0.5 block">
                              Update lokasi 10–60 menit lalu
                            </span>
                          </div>
                          <div className="clean-card p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Standby / Istirahat
                              </span>
                              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            </div>
                            <span className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1.5 block">
                              {activeOver60m}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] mt-0.5 block">
                              Update terakhir &gt; 1 jam lalu
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Split Layout: Daftar Teknisi di Kiri + Peta Interaktif di Kanan */}
                  {(() => {
                    // Gabungkan daftar teknisi dari executors dan userLocations agar daftar di kiri selalu lengkap
                    const memberMap = new Map<string, { id: string; name: string; loc?: UserLocation }>();
                    executors.forEach(ex => {
                      memberMap.set(ex.id, {
                        id: ex.id,
                        name: ex.name,
                        loc: userLocations.find(l => l.userId === ex.id),
                      });
                    });
                    userLocations.forEach(loc => {
                      if (!memberMap.has(loc.userId)) {
                        memberMap.set(loc.userId, {
                          id: loc.userId,
                          name: loc.userName.replace(/\s*\(Teknisi Lapangan\)\s*/i, ''),
                          loc,
                        });
                      }
                    });
                    const combinedMembers = Array.from(memberMap.values()).filter(
                      m => !trackingMemberSearch.trim() || m.name.toLowerCase().includes(trackingMemberSearch.toLowerCase())
                    );

                    // Susun titik urutan kunjungan kerja (Riwayat Rute) dari laporan kerja & proyek
                    const rawStops = reports
                      .map((rep, idx) => {
                        const matchedProj = projects.find(p => p.id === rep.project.id);
                        const lat = matchedProj?.latitude ?? -6.224515 + idx * 0.012;
                        const lng = matchedProj?.longitude ?? 106.797895 + idx * 0.014;
                        const statusMeta = getWorkReportStatusMeta(rep.status);
                        return {
                          id: rep.id,
                          order: idx + 1,
                          userId: rep.executor.id,
                          userName: rep.executor.name,
                          projectName: rep.project.name,
                          clientName: rep.project.clientName || rep.project.address,
                          latitude: lat,
                          longitude: lng,
                          timeLabel: new Date(rep.checkInAt || rep.createdAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                          statusLabel: statusMeta.label,
                        };
                      });

                    // Jika belum ada laporan di filter saat ini, buat titik rute dari proyek aktif & posisi teknisi agar rute tetap informatif
                    const journeyStops =
                      rawStops.length > 0
                        ? rawStops
                        : projects.slice(0, 4).map((proj, idx) => {
                            const fallbackMember = combinedMembers[idx % Math.max(1, combinedMembers.length)];
                            return {
                              id: proj.id,
                              order: idx + 1,
                              userId: fallbackMember?.id || 'default-tech',
                              userName: fallbackMember?.name || 'Budi Santoso',
                              projectName: proj.projectName,
                              clientName: proj.clientName,
                              latitude: proj.latitude,
                              longitude: proj.longitude,
                              timeLabel: proj.scheduledStartTime || '09:00',
                              statusLabel: 'Terjadwal Hari Ini',
                            };
                          });

                    const visibleJourneyStops = selectedTrackingUserId
                      ? journeyStops.filter(s => s.userId === selectedTrackingUserId)
                      : journeyStops;

                    const visibleLocations = selectedTrackingUserId
                      ? userLocations.filter(l => l.userId === selectedTrackingUserId)
                      : userLocations;

                    return (
                      <div data-app-tour="tracking-map-panel" className="clean-card bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden p-4 space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                          <div className="lg:col-span-4 flex flex-col gap-2.5 max-h-[420px]">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[var(--text-primary)]">
                                Pilih Teknisi ({combinedMembers.length})
                              </span>
                              {selectedTrackingUserId && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedTrackingUserId(null)}
                                  className="text-[11px] font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
                                >
                                  Tampilkan Semua
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              value={trackingMemberSearch}
                              onChange={e => setTrackingMemberSearch(e.target.value)}
                              placeholder="Cari nama teknisi..."
                              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            />
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                              {combinedMembers.length === 0 ? (
                                <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                                  Teknisi tidak ditemukan.
                                </div>
                              ) : (
                                combinedMembers.map(member => {
                                  const loc = member.loc;
                                  const isSel = selectedTrackingUserId === member.id;
                                  const stopCount = journeyStops.filter(s => s.userId === member.id).length;
                                  return (
                                    <button
                                      key={member.id}
                                      type="button"
                                      onClick={() => setSelectedTrackingUserId(isSel ? null : member.id)}
                                      className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                        isSel
                                          ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--accent-glow)]/20'
                                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)]'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <span className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold flex items-center justify-center shrink-0">
                                            {member.name.slice(0, 2).toUpperCase()}
                                          </span>
                                          <div className="min-w-0">
                                            <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                                              {member.name}
                                            </p>
                                            <p className="text-[11px] text-[var(--text-secondary)]">
                                              {trackingMode === 'journey'
                                                ? `${stopCount} titik kunjungan tercatat`
                                                : loc
                                                ? `Aktif • ±${Math.round(loc.accuracy || 10)}m`
                                                : 'Belum ada sinyal GPS'}
                                            </p>
                                          </div>
                                        </div>
                                        <span className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[10px] font-mono font-semibold shrink-0">
                                          {loc
                                            ? new Date(loc.trackedAt).toLocaleTimeString('id-ID', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })
                                            : 'Standby'}
                                        </span>
                                      </div>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          <div className="lg:col-span-8">
                            <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-2xs">
                              <AllProjectsMap
                                projects={projects.filter(p => !p.lockedAt)}
                                userLocations={userLocations}
                                height="400px"
                                mode={trackingMode}
                                selectedUserId={selectedTrackingUserId}
                                journeyStops={journeyStops}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Tabel Bawah: Menyesuaikan Mode Posisi Saat Ini vs Riwayat Rute */}
                        {trackingMode === 'journey' ? (
                          <div className="pt-2">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                                  Urutan Riwayat Kunjungan &amp; Rute Teknisi
                                </h3>
                                <p className="text-xs text-[var(--text-muted)]">
                                  Daftar urutan titik lokasi pelanggan yang dikunjungi teknisi beserta jam kunjungannya
                                </p>
                              </div>
                            </div>
                            {visibleJourneyStops.length === 0 ? (
                              <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                                Belum ada riwayat titik kunjungan untuk teknisi yang dipilih.
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                                  <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-bold uppercase tracking-wider text-[11px]">
                                    <tr>
                                      <th className="px-4 py-3">Urutan</th>
                                      <th className="px-4 py-3">Teknisi</th>
                                      <th className="px-4 py-3">Lokasi Kunjungan</th>
                                      <th className="px-4 py-3">Jam</th>
                                      <th className="px-4 py-3">Status</th>
                                      <th className="px-4 py-3 text-right">Peta</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border-subtle)]">
                                    {visibleJourneyStops.map((stop, idx) => (
                                      <tr key={stop.id} className="hover:bg-[var(--bg-tertiary)]/50">
                                        <td className="px-4 py-3 font-mono font-bold text-[var(--text-primary)]">
                                          Titik #{idx + 1}
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                                          {stop.userName}
                                        </td>
                                        <td className="px-4 py-3">
                                          <span className="font-semibold text-[var(--text-primary)] block">
                                            {stop.projectName}
                                          </span>
                                          <span className="text-[11px] text-[var(--text-muted)]">{stop.clientName}</span>
                                        </td>
                                        <td className="px-4 py-3 font-mono">{stop.timeLabel} WIB</td>
                                        <td className="px-4 py-3">
                                          <span className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-primary)]">
                                            {stop.statusLabel}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] transition-colors inline-block"
                                          >
                                            Buka di Maps
                                          </a>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="pt-2">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                                  Daftar Posisi Saat Ini
                                </h3>
                                <p className="text-xs text-[var(--text-muted)]">
                                  Koordinat GPS terakhir yang dikirim dari perangkat masing-masing teknisi
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => fetchLatestLocations().then(setUserLocations)}
                                className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold cursor-pointer"
                              >
                                <RefreshCw size={13} aria-hidden="true" /> Perbarui Posisi
                              </button>
                            </div>
                            {visibleLocations.length === 0 ? (
                              <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                                Belum ada data lokasi teknisi yang tercatat.
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                                  <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-bold uppercase tracking-wider text-[11px]">
                                    <tr>
                                      <th className="px-4 py-3">Nama Teknisi</th>
                                      <th className="px-4 py-3">Waktu Update</th>
                                      <th className="px-4 py-3">Koordinat (Lat, Lng)</th>
                                      <th className="px-4 py-3">Akurasi GPS</th>
                                      <th className="px-4 py-3 text-right">Peta</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border-subtle)]">
                                    {visibleLocations.map(loc => (
                                      <tr key={loc.userId} className="row-fade-in hover:bg-[var(--bg-tertiary)]/50">
                                        <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{loc.userName}</td>
                                        <td className="px-4 py-3">{new Date(loc.trackedAt).toLocaleString('id-ID')}</td>
                                        <td className="px-4 py-3 font-mono">
                                          {loc.latitude}, {loc.longitude}
                                        </td>
                                        <td className="px-4 py-3 font-mono">
                                          {loc.accuracy != null ? `±${Math.round(loc.accuracy)} meter` : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] transition-colors inline-block"
                                          >
                                            Buka di Maps
                                          </a>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {activeTab === 'approval' && (
                <div className="clean-card p-5 sm:p-6 lg:p-7 space-y-6">
                  {/* Header Halaman (Clean tanpa ikon dekoratif) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
                    <div>
                      <h3 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                        Kelola Akun Tim &amp; Staf
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Tambahkan akun teknisi atau admin baru, atau bagikan tautan pendaftaran mandiri.
                      </p>
                    </div>
                    <div className="self-start sm:self-center">
                      {isDirector ? (
                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs">
                          Akses Penuh Direktur
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold text-xs">
                          Akses Admin Operasional
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 1. Form Tambah Pengguna Langsung */}
                  <form
                    data-app-tour="approval-create-form"
                    onSubmit={handleCreateUser}
                    className="clean-card p-5 sm:p-6 bg-[#faf9f7] border border-[#e8e5e0] space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-extrabold text-sm text-[var(--text-primary)]">
                          Tambah Akun Staf Baru
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          Akun langsung aktif dan dapat digunakan masuk ke aplikasi.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-[var(--text-secondary)]">Nama Lengkap *</label>
                        <input
                          required
                          placeholder="Contoh: Budi Santoso"
                          value={newUser.name}
                          onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                          className="w-full px-3.5 py-2.5 min-h-[44px] text-xs sm:text-sm rounded-xl border border-[var(--border)] bg-white text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-[var(--text-secondary)]">Email Perusahaan *</label>
                        <input
                          required
                          type="email"
                          placeholder="nama@perusahaan.com"
                          value={newUser.email}
                          onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                          className="w-full px-3.5 py-2.5 min-h-[44px] text-xs sm:text-sm rounded-xl border border-[var(--border)] bg-white text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-[var(--text-secondary)]">Password Awal *</label>
                        <input
                          required
                          type="password"
                          minLength={8}
                          placeholder="Min. 8 karakter"
                          value={newUser.password}
                          onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                          className="w-full px-3.5 py-2.5 min-h-[44px] text-xs sm:text-sm rounded-xl border border-[var(--border)] bg-white text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-[var(--text-secondary)]">No. WhatsApp / HP</label>
                        <input
                          placeholder="Contoh: 0812-3456-7890"
                          value={newUser.phone}
                          onChange={e => setNewUser({ ...newUser, phone: e.target.value })}
                          className="w-full px-3.5 py-2.5 min-h-[44px] text-xs sm:text-sm rounded-xl border border-[var(--border)] bg-white text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-[var(--text-secondary)]">Pilih Peran / Role *</label>
                        <select
                          value={newUser.role}
                          onChange={e => setNewUser({ ...newUser, role: e.target.value as AdminUser['role'] })}
                          className="w-full px-3.5 py-2.5 min-h-[44px] text-xs sm:text-sm rounded-xl border border-[var(--border)] bg-white text-[var(--text-primary)] font-semibold focus:outline-none focus:border-[var(--accent)]"
                        >
                          <option value="TEKNISI_LAPANGAN">Teknisi Lapangan (PWA Mobile)</option>
                          <option value="MARKETING">Marketing / Surveyor</option>
                          <option value="INVENTORY">Inventory / Staf Gudang</option>
                          <option value="ADMIN">Admin Operasional</option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={creatingUser}
                          className="w-full min-h-[44px] px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-bold rounded-xl disabled:opacity-50 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Plus size={15} />
                          {creatingUser ? 'Membuat...' : 'Buat Akun Sekarang'}
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* 2. Form Buat Link Undangan */}
                  <div data-app-tour="approval-invite-card" className="clean-card p-5 sm:p-6 bg-[var(--bg-tertiary)]/50 border border-[var(--border-subtle)] space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-sm text-[var(--text-primary)]">
                          Buat Tautan Undangan Mandiri (Berlaku 7 Hari)
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          Calon staf dapat mengisi data diri dan kata sandi secara mandiri melalui tautan ini.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2.5 items-center">
                      <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as AdminUser['role'])}
                        className="px-3.5 py-2 min-h-[44px] text-xs sm:text-sm font-semibold rounded-xl border border-emerald-300 bg-white text-[var(--text-primary)]"
                      >
                        <option value="TEKNISI_LAPANGAN">Undangan: Teknisi Lapangan</option>
                        <option value="MARKETING">Undangan: Marketing</option>
                        <option value="INVENTORY">Undangan: Inventory / Gudang</option>
                        <option value="ADMIN">Undangan: Admin Perusahaan</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleGenerateInvite(inviteRole)}
                        disabled={isGeneratingInvite}
                        className="min-h-[44px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <Plus size={14} />
                        {isGeneratingInvite ? 'Membuat...' : 'Buat Tautan Undangan'}
                      </button>
                    </div>

                    {inviteLink && (
                      <div className="p-3.5 bg-white rounded-xl border border-emerald-200 shadow-2xs space-y-2">
                        <p className="text-xs font-bold text-slate-700 flex items-center justify-between">
                          <span>Tautan Pendaftaran Resmi</span>
                          <span className="font-normal text-slate-500 font-mono text-[11px]">Kedaluwarsa: {inviteLink.expiresAt}</span>
                        </p>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={inviteLink.url}
                            className="flex-1 text-xs px-3 py-2.5 min-h-[42px] bg-[#faf9f7] border border-slate-200 rounded-xl font-mono text-[var(--text-primary)] select-all"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(inviteLink.url);
                              setActionBanner({
                                tone: 'success',
                                message: 'Link undangan berhasil disalin ke clipboard.',
                              });
                            }}
                            className="min-h-[42px] px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs shrink-0"
                          >
                            <Copy size={13} /> Salin Link
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Daftar Akun Pengguna Terdaftar */}
                  <div data-app-tour="approval-user-list" className="space-y-4 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-extrabold text-[var(--text-primary)]">
                          Daftar Akun Karyawan Terdaftar
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Total {adminUsers.filter(u => u.email.toLowerCase() !== 'lieziragroup@gmail.com' && (u.role as string) !== 'MASTER_SUPER_ADMIN').length} akun terdata di perusahaan ini.
                        </p>
                      </div>

                      {/* Tab Aktif / Tidak Aktif & Search Bar Pengguna (Screenshot 10: beta.jarivis.com/member) */}
                      <div className="flex flex-wrap items-center gap-2">
                        {([
                          { id: 'ALL', label: `Semua (${adminUsers.filter(u => (u.role as string) !== 'MASTER_SUPER_ADMIN' && (u.role as string) !== 'SUPERADMIN').length})` },
                          { id: 'ACTIVE', label: `Aktif (${adminUsers.filter(u => u.is_active && (u.role as string) !== 'MASTER_SUPER_ADMIN' && (u.role as string) !== 'SUPERADMIN').length})` },
                          { id: 'INACTIVE', label: `Tidak Aktif (${adminUsers.filter(u => !u.is_active && (u.role as string) !== 'MASTER_SUPER_ADMIN' && (u.role as string) !== 'SUPERADMIN').length})` },
                        ] as const).map(st => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setMemberStatusFilter(st.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              memberStatusFilter === st.id
                                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>

                      <div className="relative w-full sm:w-64">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={userSearchQ}
                          onChange={e => setUserSearchQ(e.target.value)}
                          placeholder="Cari nama, email, NIP..."
                          className="w-full pl-8 pr-3 py-2 min-h-[40px] text-xs rounded-xl border border-[var(--border)] bg-white text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>

                    {adminUsers.length === 0 ? (
                      <div className="py-12 text-center text-xs text-[var(--text-muted)] clean-card p-6">
                        Tidak ada data pengguna terdaftar.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {adminUsers
                          .filter(
                            u =>
                              (u.role as string) !== 'MASTER_SUPER_ADMIN' &&
                              (u.role as string) !== 'SUPERADMIN' &&
                              u.email.toLowerCase() !== 'lieziragroup@gmail.com'
                          )
                          .filter(u => {
                            if (memberStatusFilter === 'ACTIVE' && !u.is_active) return false;
                            if (memberStatusFilter === 'INACTIVE' && u.is_active) return false;
                            if (!userSearchQ.trim()) return true;
                            const q = userSearchQ.toLowerCase();
                            return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.nip || '').toLowerCase().includes(q);
                          })
                          .map(u => {
                            const isSelf = u.id === user?.uid || u.id === (user as any)?.id;
                            const isTargetAdmin = u.role === 'ADMIN';
                            const cannotManage = !isDirector && isTargetAdmin;

                            return (
                              <div
                                key={u.id}
                                className={`clean-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                                  u.is_active ? 'hover:border-emerald-300' : 'bg-rose-50/20 border-rose-200'
                                }`}
                              >
                                <div className="space-y-1.5 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-extrabold text-[var(--text-primary)] text-sm sm:text-base">{u.name}</span>
                                    <span
                                      className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full border ${
                                        u.is_active
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                          : 'bg-rose-50 text-rose-800 border-rose-200'
                                      }`}
                                    >
                                      {u.is_active ? 'AKTIF' : 'DITANGGUHKAN'}
                                    </span>
                                    <span
                                      className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full border ${
                                        u.role === 'ADMIN'
                                          ? 'bg-purple-50 text-purple-800 border-purple-200'
                                          : u.role === 'MARKETING'
                                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                                          : u.role === 'INVENTORY'
                                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                                          : 'bg-teal-50 text-teal-800 border-teal-200'
                                      }`}
                                    >
                                      {u.role === 'ADMIN'
                                        ? 'ADMIN'
                                        : u.role === 'MARKETING'
                                        ? 'MARKETING'
                                        : u.role === 'INVENTORY'
                                        ? 'GUDANG'
                                        : 'TEKNISI'}
                                    </span>
                                    {isSelf && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                        Akun Anda
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-xs text-[var(--text-secondary)] font-mono flex items-center gap-2 flex-wrap">
                                    <span>{u.email}</span>
                                    {u.nip && <span>• NIP: {u.nip}</span>}
                                    {u.phone && <span>• WA: {u.phone}</span>}
                                  </div>

                                  {/* Indikator Status Perangkat & Pengaturan Lokasi (Tanpa ikon emoji) */}
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10.5px]">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                                      Aplikasi: {u.is_active ? 'Aktif' : 'Nonaktif'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setMemberGeofenceMap(prev => ({
                                          ...prev,
                                          [u.id]: !(prev[u.id] ?? true),
                                        }))
                                      }
                                      className={`px-2 py-0.5 rounded-md border font-bold cursor-pointer ${
                                        (memberGeofenceMap[u.id] ?? true)
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : 'bg-amber-50 text-amber-700 border-amber-200'
                                      }`}
                                      title="Klik untuk mengubah aturan batas jarak lokasi pada anggota ini"
                                    >
                                      Batas Jarak GPS: {(memberGeofenceMap[u.id] ?? true) ? 'Wajib Sesuai Lokasi' : 'Fleksibel'}
                                    </button>
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                                      Pantau Lokasi: {liveTrackingEnabled ? 'Aktif' : 'Nonaktif'}
                                    </span>
                                  </div>

                                  <div className="text-[11px] text-[var(--text-muted)]">
                                    Terdaftar: {new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </div>
                                </div>

                                {/* Aksi Manajemen Akun */}
                                <div className="flex items-center gap-2 shrink-0 self-start md:self-center flex-wrap">
                                  {isSelf ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setShowChangePassword(true)}
                                        className="min-h-[42px] px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition-colors cursor-pointer"
                                      >
                                        Ubah Kata Sandi
                                      </button>
                                      <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 font-semibold text-xs border border-slate-200">
                                        Sesi Aktif
                                      </span>
                                    </>
                                  ) : cannotManage ? (
                                    <div
                                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold"
                                      title="Admin tidak memiliki wewenang menonaktifkan akun Admin lainnya. Tindakan ini hanya dapat dilakukan oleh Direktur."
                                    >
                                      <Lock size={13} className="text-amber-600" />
                                      <span>Khusus Wewenang Direktur</span>
                                    </div>
                                  ) : (
                                    <>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <button
                                            type="button"
                                            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                                          >
                                            Reset Sandi ({DEFAULT_ACCOUNT_PASSWORD})
                                          </button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Reset Kata Sandi {u.name}?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Kata sandi untuk akun <strong>{u.email}</strong> akan dikembalikan menjadi default <strong>{DEFAULT_ACCOUNT_PASSWORD}</strong>. Pengguna dapat mengubahnya kembali setelah masuk.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel className="font-medium">Batalkan</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => void handleResetPasswordToDefault(u)}
                                              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
                                            >
                                              Ya, Reset ke {DEFAULT_ACCOUNT_PASSWORD}
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>

                                      {u.is_active ? (
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <button
                                              type="button"
                                              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-colors cursor-pointer"
                                            >
                                              Nonaktifkan Akun
                                            </button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Nonaktifkan Akun {u.name}?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Pengguna tidak akan dapat masuk ke sistem selama akun dinonaktifkan. Anda dapat mengaktifkan kembali akun ini kapan saja.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel className="font-medium">Batalkan</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => void handleSuspend(u)}
                                                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                                              >
                                                Ya, Nonaktifkan
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => void handleActivate(u)}
                                          className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
                                        >
                                          Aktifkan Akun
                                        </button>
                                      )}

                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <button
                                            type="button"
                                            aria-label={`Hapus akun ${u.name} secara permanen`}
                                            className="min-h-[42px] min-w-[42px] flex items-center justify-center p-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors cursor-pointer"
                                            title="Hapus Akun Permanen"
                                          >
                                            <Trash2 size={16} aria-hidden="true" />
                                          </button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Hapus Akun Pengguna Secara Permanen?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Tindakan ini tidak dapat dibatalkan. Menghapus akun <strong>{u.name}</strong> akan mencabut kredensial loginnya secara permanen, sementara riwayat laporan kerja tetap tersimpan untuk audit.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel className="font-medium">Batalkan</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => void handleDeleteUser(u.id)}
                                              className="bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs"
                                            >
                                              Ya, Hapus Permanen
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'quotation' && (
                <div data-app-tour="quotation-workspace">
                  <QuotationPage />
                </div>
              )}
              {(activeTab === 'customers' || activeTab === 'kontrol-rayap') && (
                <div data-app-tour="customers-workspace">
                  <CustomersPage initialSubTab={activeTab === 'kontrol-rayap' ? 'garansi' : 'master'} />
                </div>
              )}
              {(activeTab === 'order-tracking' || activeTab === 'cashflow' || activeTab === 'performa') && (
                <div data-app-tour="order-tracking-workspace" className="space-y-5">
                  <div className="flex flex-wrap items-center gap-1.5 bg-[var(--bg-card)] p-2 rounded-2xl border border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setActiveTab('order-tracking')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeTab === 'order-tracking'
                          ? 'bg-[var(--accent)] text-white shadow-2xs'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      💳 Tagihan &amp; Cicilan Klien
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('cashflow')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                          activeTab === 'cashflow'
                            ? 'bg-[var(--accent)] text-white shadow-2xs'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                      >
                        💰 Laporan Pemasukan &amp; Cashflow
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveTab('performa')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeTab === 'performa'
                          ? 'bg-[var(--accent)] text-white shadow-2xs'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      📈 Performa MoM &amp; Capaian Target
                    </button>
                  </div>
                  {activeTab === 'order-tracking' && <TrackingPage />}
                  {activeTab === 'cashflow' && <CashflowPage />}
                  {activeTab === 'performa' && <PerformaPage />}
                </div>
              )}
              {activeTab === 'inventory' && (
                <div data-app-tour="inventory-workspace">
                  <InventoryPage />
                </div>
              )}
              {activeTab === 'saas-companies' && isMasterSuper && (
                <div data-app-tour="saas-workspace">
                  <CompaniesPage />
                </div>
              )}

              {(activeTab === 'templates' || activeTab === 'risk-config' || (activeTab === 'profile' && isAdmin)) && (
                <div data-app-tour="settings-subtabs" className="flex flex-wrap items-center gap-1.5 bg-[var(--bg-card)] p-1.5 rounded-xl border border-[var(--border-subtle)] mb-4">
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveTab('templates')}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          activeTab === 'templates'
                            ? 'bg-[var(--accent)] text-white shadow-2xs'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                      >
                        Kop Surat &amp; TTD
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('risk-config')}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          activeTab === 'risk-config'
                            ? 'bg-[var(--accent)] text-white shadow-2xs'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                      >
                        Aturan Jarak &amp; Foto
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveTab('profile')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'profile'
                        ? 'bg-[var(--accent)] text-white shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    Profil &amp; Tema
                  </button>
                </div>
              )}

              {activeTab === 'templates' && isAdmin && (
                <div data-app-tour="settings-content">
                  <TemplateSettingsPanel />
                </div>
              )}

              {activeTab === 'risk-config' && (
                <div data-app-tour="settings-content" className="space-y-4">
                  <RiskConfigPanel
                    config={riskConfig}
                    onSave={handleSaveRiskConfig}
                    onReset={handleResetRiskConfigWithUndo}
                  />
                </div>
              )}

              {activeTab === 'profile' && user && (
                <div className="clean-card bg-[var(--bg-card)] max-w-2xl mx-auto p-6 space-y-6">
                  <h2 className="text-lg font-bold border-b border-[var(--border-subtle)] pb-3 text-[var(--text-primary)]">
                    Profil &amp; Preferensi Anda
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="block text-xs font-semibold text-[var(--text-muted)]">Nama Lengkap</span>
                      <span className="font-semibold text-sm text-[var(--text-primary)]">{user.name}</span>
                    </div>
                    <div className="overflow-hidden">
                      <span className="block text-xs font-semibold text-[var(--text-muted)]">Email</span>
                      <span className="font-semibold text-sm text-[var(--text-primary)] truncate block" title={user.email}>
                        {user.email}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-[var(--text-muted)]">NIP</span>
                      <span className="font-semibold text-sm text-[var(--text-primary)]">{user.nip || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-[var(--text-muted)]">Peran</span>
                      <span className="inline-block font-semibold bg-[var(--status-working-bg)] text-[var(--status-working-text)] px-2.5 py-0.5 rounded text-xs border border-[var(--status-working-border)] mt-0.5">
                        {user.role}
                      </span>
                    </div>
                  </div>

                  {/* Pengaturan Tema Tampilan (Light / Dark / System) */}
                  <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Tema Tampilan</h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Pilih tampilan terang, gelap, atau ikuti pengaturan sistem perangkat Anda (saat ini aktif:{' '}
                          <strong>{resolvedTheme === 'dark' ? 'Gelap' : 'Terang'}</strong>).
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" role="radiogroup" aria-label="Tema tampilan">
                      {themeOptions.map(opt => {
                        const selected = theme === opt.value;
                        const icon =
                          opt.value === 'light' ? (
                            <Sun size={15} aria-hidden="true" />
                          ) : opt.value === 'dark' ? (
                            <Moon size={15} aria-hidden="true" />
                          ) : (
                            <Monitor size={15} aria-hidden="true" />
                          );
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setTheme(opt.value)}
                            className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                              selected
                                ? 'bg-[var(--accent-glow)] border-[var(--accent)] text-[var(--text-primary)]'
                                : 'bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-semibold text-xs text-[var(--text-primary)]">
                              {icon}
                              <span>{opt.label}</span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mt-1 leading-snug">{opt.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setShowChangePassword(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      <Lock size={15} aria-hidden="true" />
                      <span>Ubah Kata Sandi</span>
                    </button>

                    <button
                      type="button"
                      onClick={logout}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      <LogOut size={15} aria-hidden="true" />
                      <span>Keluar Akun (Logout)</span>
                    </button>
                  </div>
                </div>
              )}
            </MotionDiv>
          </AnimatePresence>
        )}
      </div>

      {/* Report Detail Modal */}
      <AnimatePresence>
        {selectedReportId && (
          <motion.div
            key="admin-report-detail-modal"
            variants={MODAL_BACKDROP_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
            onClick={() => setSelectedReportId(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Detail Laporan Pekerjaan"
          >
            <motion.div
              variants={MODAL_PANEL_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="relative w-full max-w-3xl clean-card bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden text-[var(--text-primary)]"
              onClick={e => e.stopPropagation()}
            >
            {detailLoading && (
              <div className="p-8 space-y-4" aria-busy="true">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-48 w-full rounded-xl" />
              </div>
            )}
            {!detailLoading && selectedReport && (
              <>
                <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)] shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <RiskBadge level={selectedReport.riskLevel} score={selectedReport.riskScore} size="lg" />
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-[var(--text-primary)] truncate">
                        {selectedReport.projectName}
                      </h2>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        Pelaksana:{' '}
                        <span className="font-semibold text-[var(--text-secondary)]">
                          {selectedReport.executorName}
                        </span>{' '}
                        • {new Date(selectedReport.createdAt).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {selectedReport.photos.some(p => !p.purgedAt && Boolean(p.url)) && (
                      <button
                        type="button"
                        onClick={() => handleOpenArchiveForSingleReport(selectedReport)}
                        title="Unduh Foto Raw (.ZIP kompatibel WinRAR) & hapus foto raw dari database (foto di PDF tetap aman)"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 transition-colors cursor-pointer"
                      >
                        <Download size={14} aria-hidden="true" /> Foto Raw (RAR/ZIP)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDownloadVisitReport}
                      disabled={pdfBusy}
                      title="Unduh Laporan Kunjungan (PDF)"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-card)] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <Download size={14} aria-hidden="true" /> {pdfBusy ? 'Membuat PDF...' : selectedReport.serviceType === 'TERMITE_CONTROL' ? 'PDF Anti Rayap' : 'PDF Pest Control'}
                    </button>
                    <button
                      type="button"
                      aria-label="Tutup detail laporan"
                      onClick={() => setSelectedReportId(null)}
                      className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
                    >
                      <X size={20} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-subtle)] text-xs">
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">KLIEN</span>
                      <span className="font-bold text-[var(--text-primary)]">{selectedReport.clientName}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">LAYANAN</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {getServiceTypeMeta(selectedReport.serviceType).label}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">STATUS</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {getWorkReportStatusMeta(selectedReport.status).label}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">TOTAL DURASI</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {selectedReport.durationSeconds
                          ? `${Math.round(selectedReport.durationSeconds / 60)} menit`
                          : '-'}
                      </span>
                    </div>
                    {selectedReport.targetFocus?.length > 0 ? (
                      <div className="col-span-2">
                        <span className="text-[var(--text-muted)] block text-[11px]">FOKUS TARGET</span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {selectedReport.targetFocus.join(', ')}
                        </span>
                      </div>
                    ) : selectedReport.focusTarget ? (
                      <div className="col-span-2">
                        <span className="text-[var(--text-muted)] block text-[11px]">FOKUS TARGET</span>
                        <span className="font-bold text-[var(--text-primary)]">{selectedReport.focusTarget}</span>
                      </div>
                    ) : null}
                    {selectedReport.warrantyMonths > 0 && (
                      <div>
                        <span className="text-[var(--text-muted)] block text-[11px]">GARANSI</span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {selectedReport.warrantyMonths} bulan
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">JADWAL</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {selectedReport.scheduledStartTime} WIB
                      </span>
                    </div>
                    {selectedReport.teamMembers && selectedReport.teamMembers.length > 0 && (
                      <div className="col-span-2 sm:col-span-4 pt-2 border-t border-[var(--border-subtle)]">
                        <span className="text-[var(--text-muted)] block text-[11px] mb-1">
                          TIM TEKNISI YANG BERTUGAS (1 TIM)
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedReport.teamMembers.map((tm, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border border-[var(--status-completed-border)] text-xs font-bold"
                            >
                              {tm.name} {tm.isManual ? '(Input Manual)' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                      Validasi Geografis
                    </h4>
                    <LocationMap
                      projectName={selectedReport.projectName}
                      projectLat={selectedReport.projectLatitude}
                      projectLng={selectedReport.projectLongitude}
                      projectRadius={selectedReport.projectRadius}
                      executorLat={selectedReport.checkInLatitude ?? null}
                      executorLng={selectedReport.checkInLongitude ?? null}
                      executorAccuracy={selectedReport.checkInAccuracy}
                      distanceMeters={selectedReport.checkInDistance}
                      isWithinRadius={selectedReport.checkInValid}
                      checkOutLat={selectedReport.checkOutLatitude}
                      checkOutLng={selectedReport.checkOutLongitude}
                      height="280px"
                    />
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                      Kronologi Waktu
                    </h4>
                    <div className="relative pl-6 border-l-2 border-[var(--border-subtle)] space-y-4 text-xs">
                      <div className="relative">
                        <div className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-[var(--bg-card)]" />
                        <span className="font-bold text-[var(--text-secondary)] font-mono">
                          {selectedReport.scheduledStartTime} WIB
                        </span>
                        <p className="text-[var(--text-muted)]">Jadwal target dimulainya pekerjaan</p>
                      </div>
                      {selectedReport.checkInAt && (
                        <div className="relative">
                          <div
                            className={`absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--bg-card)] ${
                              selectedReport.checkInValid ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          <span className="font-bold text-[var(--text-primary)] font-mono">
                            {new Date(selectedReport.checkInAt).toLocaleTimeString('id-ID')} WIB — CHECK-IN
                          </span>
                          <p className="text-[var(--text-secondary)] mt-0.5">
                            {selectedReport.checkInValid ? 'Valid di dalam radius' : 'Di luar radius proyek'} (Jarak:{' '}
                            {selectedReport.checkInDistance}m, Akurasi: ±{selectedReport.checkInAccuracy}m)
                          </p>
                        </div>
                      )}
                      {selectedReport.photos
                        .filter(p => p.photoType === 'PROGRESS')
                        .map((photo, idx) => (
                          <div key={photo.id} className="relative">
                            <div className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-[var(--bg-card)]" />
                            <span className="font-bold text-[var(--text-primary)] font-mono">
                              {new Date(photo.capturedAt).toLocaleTimeString('id-ID')} WIB — DOKUMENTASI PROGRES #
                              {idx + 1}
                            </span>
                          </div>
                        ))}
                      {selectedReport.checkOutAt && (
                        <div className="relative">
                          <div
                            className={`absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--bg-card)] ${
                              selectedReport.checkOutValid ? 'bg-blue-500' : 'bg-red-500'
                            }`}
                          />
                          <span className="font-bold text-[var(--text-primary)] font-mono">
                            {new Date(selectedReport.checkOutAt).toLocaleTimeString('id-ID')} WIB — CHECK-OUT
                          </span>
                          <p className="text-[var(--text-secondary)] mt-0.5">
                            Total durasi: {Math.round((selectedReport.durationSeconds || 0) / 60)} menit.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
                      Data Perlakuan (Treatment)
                    </h4>
                    {!selectedReport.treatmentRecord ? (
                      <div className="bg-[var(--status-draft-bg)] border border-[var(--status-draft-border)] p-3.5 rounded-xl text-[var(--status-draft-text)] text-xs">
                        Belum ada data bahan, dosis, atau metode aplikasi yang tercatat untuk pekerjaan ini.
                      </div>
                    ) : (
                      <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl p-4 text-xs space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <span className="text-[var(--text-muted)] block text-[11px]">METODE</span>
                            <span className="font-bold text-[var(--text-primary)]">
                              {APPLICATION_METHOD_LABELS[selectedReport.treatmentRecord.applicationMethod]}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)] block text-[11px]">BAHAN/PRODUK</span>
                            <span className="font-bold text-[var(--text-primary)]">
                              {selectedReport.treatmentRecord.chemicalName}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)] block text-[11px]">BAHAN AKTIF</span>
                            <span className="font-bold text-[var(--text-primary)]">
                              {selectedReport.treatmentRecord.activeIngredient || '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)] block text-[11px]">DOSIS</span>
                            <span className="font-bold text-[var(--text-primary)]">
                              {selectedReport.treatmentRecord.dosage}
                            </span>
                          </div>
                          {selectedReport.treatmentRecord.treatmentAreaSqm != null && (
                            <div>
                              <span className="text-[var(--text-muted)] block text-[11px]">LUAS DIRAWAT</span>
                              <span className="font-bold text-[var(--text-primary)]">
                                {selectedReport.treatmentRecord.treatmentAreaSqm} m²
                              </span>
                            </div>
                          )}
                          {selectedReport.treatmentRecord.drillingPointsCount != null && (
                            <div>
                              <span className="text-[var(--text-muted)] block text-[11px]">TITIK BOR/INJEKSI</span>
                              <span className="font-bold text-[var(--text-primary)]">
                                {selectedReport.treatmentRecord.drillingPointsCount} titik
                              </span>
                            </div>
                          )}
                        </div>

                        {selectedReport.serviceType === 'FUMIGATION' && (
                          <div
                            className={`rounded-lg p-3 border ${
                              selectedReport.treatmentRecord.aerationCompletedAt
                                ? 'bg-[var(--status-completed-bg)] border-[var(--status-completed-border)]'
                                : 'bg-[var(--status-flagged-bg)] border-[var(--status-flagged-border)]'
                            }`}
                          >
                            <span
                              className={`text-xs font-bold uppercase block mb-2 ${
                                selectedReport.treatmentRecord.aerationCompletedAt
                                  ? 'text-[var(--status-completed-text)]'
                                  : 'text-[var(--status-flagged-text)]'
                              }`}
                            >
                              Data Keselamatan Fumigasi
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[var(--text-muted)] block text-[11px]">FUMIGANT</span>
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {selectedReport.treatmentRecord.fumigantType || '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[var(--text-muted)] block text-[11px]">KONSENTRASI</span>
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {selectedReport.treatmentRecord.gasConcentrationPpm != null
                                    ? `${selectedReport.treatmentRecord.gasConcentrationPpm} ppm`
                                    : '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[var(--text-muted)] block text-[11px]">MULAI SEALING</span>
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {selectedReport.treatmentRecord.sealingStartedAt
                                    ? new Date(selectedReport.treatmentRecord.sealingStartedAt).toLocaleString('id-ID')
                                    : '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[var(--text-muted)] block text-[11px]">SELESAI AERASI</span>
                                {selectedReport.treatmentRecord.aerationCompletedAt ? (
                                  <span className="font-semibold text-[var(--status-completed-text)]">
                                    {new Date(selectedReport.treatmentRecord.aerationCompletedAt).toLocaleString(
                                      'id-ID'
                                    )}
                                  </span>
                                ) : (
                                  <span className="font-bold text-[var(--status-flagged-text)]">Belum tercatat</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {selectedReport.treatmentRecord.technicianNotes && (
                          <p className="text-[var(--text-secondary)] italic">
                            &quot;{selectedReport.treatmentRecord.technicianNotes}&quot;
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedReport.customerName && (
                    <div className="mt-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl p-4">
                      <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                        Serah Terima &amp; Ulasan Pelanggan
                      </h4>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div>
                            <span className="text-[var(--text-muted)] block text-[11px] font-bold">
                              NAMA PENANGGUNG JAWAB/PELANGGAN
                            </span>
                            <span className="font-bold text-[var(--text-primary)] text-sm">
                              {selectedReport.customerName}
                            </span>
                          </div>
                          {selectedReport.customerPhone && (
                            <div>
                              <span className="text-[var(--text-muted)] block text-[11px] font-bold">
                                NOMOR TELEPON
                              </span>
                              <span className="font-semibold text-[var(--text-secondary)] text-sm">
                                {selectedReport.customerPhone}
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="text-[var(--text-muted)] block text-[11px] font-bold">
                              KRITIK &amp; SARAN
                            </span>
                            <p className="font-medium text-[var(--text-primary)] text-sm mt-0.5 whitespace-pre-wrap clean-card bg-[var(--bg-card)] border border-[var(--border-subtle)] p-2.5 rounded-lg italic">
                              {selectedReport.customerFeedback || (
                                <span className="text-[var(--text-muted)] not-italic">Tidak ada ulasan.</span>
                              )}
                            </p>
                          </div>
                        </div>
                        {selectedReport.customerSignature && (
                          <div>
                            <span className="text-[var(--text-muted)] block text-[11px] font-bold mb-1.5">
                              TANDA TANGAN
                            </span>
                            <div className="border border-[var(--border-subtle)] rounded-xl clean-card bg-white p-2 h-32 flex items-center justify-center relative">
                              <img
                                src={selectedReport.customerSignature}
                                alt="Tanda Tangan Pelanggan"
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        Bukti Foto Pekerjaan ({selectedReport.photos.length} / Maks 4 Foto)
                      </h4>
                      {selectedReport.photos.some(p => !p.purgedAt && Boolean(p.url)) ? (
                        <button
                          type="button"
                          onClick={() => handleOpenArchiveForSingleReport(selectedReport)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          <Download size={12} />
                          <span>Unduh Foto Raw (RAR/ZIP) &amp; Hapus dari DB</span>
                        </button>
                      ) : selectedReport.photos.length > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                          ✓ Foto Raw Diarsipkan • Foto di PDF Tetap Tersimpan
                        </span>
                      ) : null}
                    </div>
                    {selectedReport.photos.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">Belum ada foto dokumentasi.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {selectedReport.photos.map(photo => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => setViewingPhoto(photo)}
                            className="group relative rounded-xl overflow-hidden border border-[var(--border-subtle)] cursor-pointer hover:border-[var(--accent)] transition-all aspect-video bg-black text-left"
                          >
                            <AuthedImage
                              path={photo.url}
                              alt="Bukti foto pekerjaan"
                              purged={!!photo.purgedAt}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white pointer-events-none">
                              <span className="text-xs font-bold block uppercase tracking-wide">
                                {photo.photoTag
                                  ? photo.photoTag === 'BEFORE'
                                    ? 'Kondisi Awal'
                                    : 'Hasil Perlakuan'
                                  : photo.photoType.replace('_', ' ')}
                              </span>
                              <span className="text-[11px] text-slate-300 font-mono block">
                                {new Date(photo.capturedAt).toLocaleTimeString('id-ID')} WIB
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
                      Catatan Evaluasi &amp; Anomali
                    </h4>
                    {selectedReport.riskEvents.length === 0 ? (
                      <div className="bg-[var(--status-completed-bg)] border border-[var(--status-completed-border)] p-3.5 rounded-xl text-[var(--status-completed-text)] text-xs">
                        Tidak ada anomali terdeteksi pada laporan ini.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedReport.riskEvents.map(evt => (
                          <div
                            key={evt.id}
                            className="p-3.5 rounded-xl border border-[var(--status-flagged-border)] bg-[var(--status-flagged-bg)] flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-[var(--status-flagged-text)]">{evt.title}</span>
                                <span className="text-[11px] font-bold px-1.5 py-0.2 rounded bg-black/10 text-[var(--status-flagged-text)]">
                                  {evt.severity}
                                </span>
                              </div>
                              <p className="text-[var(--text-secondary)]">{evt.description}</p>
                              {evt.expectedValue && evt.actualValue && (
                                <div className="text-xs text-[var(--text-muted)] font-mono mt-1">
                                  Standar:{' '}
                                  <span className="text-[var(--text-primary)] font-semibold">{evt.expectedValue}</span>{' '}
                                  | Aktual:{' '}
                                  <span className="text-[var(--status-flagged-text)] font-bold">{evt.actualValue}</span>
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-base font-black text-[var(--status-flagged-text)] font-mono tabular-nums">
                                +{evt.points}
                              </span>
                              <span className="block text-[11px] text-[var(--text-muted)] font-semibold uppercase">
                                Poin
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedReport.status === 'REVIEWED' && (
                    <div className="bg-[var(--status-reviewed-bg)] border border-[var(--status-reviewed-border)] p-4 rounded-xl text-xs space-y-1">
                      <span className="font-bold text-[var(--status-reviewed-text)] block">
                        Laporan Telah Ditinjau
                      </span>
                      <p className="text-[var(--text-secondary)]">Catatan: &quot;{selectedReport.reviewNotes}&quot;</p>
                    </div>
                  )}

                  {selectedReport.status !== 'REVIEWED' && (
                    <div className="pt-4 border-t border-[var(--border-subtle)]">
                      {!isReviewing ? (
                        <button
                          type="button"
                          onClick={() => setIsReviewing(true)}
                          className="px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-all cursor-pointer"
                        >
                          Verifikasi / Tinjau Laporan Ini
                        </button>
                      ) : (
                        <div className="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-3">
                          <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">
                            Catatan Verifikasi Admin *
                          </label>
                          <textarea
                            rows={2}
                            placeholder="Contoh: Telah dikonfirmasi via telepon, GPS bergeser karena berada di ruang bawah tanah..."
                            value={adminReviewNotes}
                            onChange={e => setAdminReviewNotes(e.target.value)}
                            className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none bg-[var(--bg-card)] text-[var(--text-primary)]"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setIsReviewing(false)}
                              disabled={isSubmittingReview}
                              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-semibold hover:bg-[var(--bg-card)] cursor-pointer"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={handleAdminReview}
                              disabled={!adminReviewNotes.trim() || isSubmittingReview}
                              className="px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                            >
                              {isSubmittingReview ? (
                                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <Check size={14} aria-hidden="true" />
                              )}
                              <span>{isSubmittingReview ? 'Menyimpan...' : 'Simpan & Tandai Selesai Ditinjau'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Project Detail Modal */}
      <AnimatePresence>
        {selectedProject && (
          <motion.div
            key="admin-project-detail-modal"
            variants={MODAL_BACKDROP_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
            onClick={() => setSelectedProject(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Detail Proyek"
          >
            <motion.div
              variants={MODAL_PANEL_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="relative w-full max-w-3xl clean-card bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden text-[var(--text-primary)]"
              onClick={e => e.stopPropagation()}
            >
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border shrink-0 ${
                    getServiceTypeMeta(selectedProject.serviceType).badgeClass
                  }`}
                >
                  {getServiceTypeMeta(selectedProject.serviceType).label}
                </span>
                <h2 className="text-lg font-bold text-[var(--text-primary)] truncate">{selectedProject.projectName}</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup detail proyek"
                onClick={() => setSelectedProject(null)}
                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-3 text-xs">
                  <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                    Informasi Proyek
                  </h4>
                  <div>
                    <span className="text-[var(--text-muted)] block text-[11px]">KLIEN</span>
                    <span className="font-bold text-[var(--text-primary)]">{selectedProject.clientName}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block text-[11px]">ALAMAT</span>
                    <span className="font-bold text-[var(--text-primary)]">{selectedProject.address}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block text-[11px]">FOKUS TARGET</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {selectedProject.targetFocus?.length
                        ? selectedProject.targetFocus.join(', ')
                        : selectedProject.focusTarget || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">KONTRAK</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {selectedProject.contractType === 'RECURRING' ? 'Berkala' : 'Sekali Layanan'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">TANGGAL / JADWAL</span>
                      <span className="font-bold text-[var(--text-primary)]">{selectedProject.workDate}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">GARANSI</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {selectedProject.warrantyMonths > 0 ? `${selectedProject.warrantyMonths} bln` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">LUAS AREA</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {selectedProject.buildingAreaSqm ? `${selectedProject.buildingAreaSqm} m²` : '-'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] h-48 sm:h-auto">
                  <LocationMap
                    projectName={selectedProject.projectName}
                    projectLat={selectedProject.latitude}
                    projectLng={selectedProject.longitude}
                    projectRadius={selectedProject.radius}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Histori Laporan Pekerjaan
                </h4>
                <div className="space-y-2">
                  {reports.filter(r => r.project.id === selectedProject.id).length === 0 ? (
                    <div className="text-sm text-[var(--text-muted)] text-center py-6 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-subtle)]">
                      Belum ada laporan untuk proyek ini.
                    </div>
                  ) : (
                    reports
                      .filter(r => r.project.id === selectedProject.id)
                      .map(r => {
                        const statusMeta = getWorkReportStatusMeta(r.status as WorkReportStatus);
                        return (
                          <div
                            key={r.id}
                            className="clean-card bg-[var(--bg-card)] p-3 sm:p-4 rounded-xl border border-[var(--border-subtle)] flex flex-col sm:flex-row gap-3 sm:items-center justify-between transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border ${statusMeta.badgeClass}`}
                                >
                                  {statusMeta.label}
                                </span>
                                <span className="text-xs font-bold text-[var(--text-secondary)]">
                                  {new Date(r.createdAt).toLocaleDateString('id-ID', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </div>
                              <div className="text-sm font-semibold text-[var(--text-primary)]">{r.executor.name}</div>
                              <div className="text-xs text-[var(--text-muted)]">
                                Check-in:{' '}
                                {r.checkInAt
                                  ? new Date(r.checkInAt).toLocaleTimeString('id-ID', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '-'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProject(null);
                                setSelectedReportId(r.id);
                              }}
                              className="text-xs font-bold text-[var(--accent-text)] whitespace-nowrap bg-[var(--accent-muted)] px-3 py-1.5 rounded-lg shrink-0 text-center cursor-pointer"
                            >
                              Buka Detail
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {showMonthlyRecapModal && (
        <MonthlyRecapBuilderModal
          isOpen={showMonthlyRecapModal}
          initialCategoryMode={recapModalMode}
          onClose={() => setShowMonthlyRecapModal(false)}
          userRole={user?.role}
          companyId={activeCompanyId}
          defaultCompilerName={user?.name || 'Admin Operasional'}
          availableCustomers={Array.from(
            new Set([
              ...projects.map(p => p.clientName).filter(Boolean),
              ...quotationsList.map(q => q.kepadaNama).filter(Boolean),
            ])
          )}
          reports={selectedReport ? [selectedReport] : []}
        />
      )}
      <AnimatePresence>
        {viewingPhoto && (
          <PhotoViewerModal
            key="admin-photo-viewer"
            photo={viewingPhoto}
            onClose={() => setViewingPhoto(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showChangePassword && (
          <motion.div
            key="admin-change-password"
            variants={MODAL_BACKDROP_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {archiveModalOpen && (
          <motion.div
            key="admin-archive-modal"
            variants={MODAL_BACKDROP_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
            onClick={() => !archiveDownloading && setArchiveModalOpen(false)}
          >
            <motion.div
              variants={MODAL_PANEL_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full max-w-xl rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
              onClick={e => e.stopPropagation()}
            >
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                  Unduh Arsip Foto Raw (RAR / ZIP) &amp; Optimasi Database
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Cakupan: <span className="font-semibold text-[var(--text-primary)]">{archiveScopeTitle}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={archiveDownloading}
                onClick={() => setArchiveModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3.5 space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                  Format Penamaan File Otomatis di Dalam Arsip
                </span>
                <code className="block text-xs font-mono font-bold text-[var(--text-primary)] bg-[var(--bg-card)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] break-all">
                  {'{YYYY-MM-DD}_{Nama-Laporan-Pelanggan}_{Nama-Teknisi}_{Tahap-Foto}_{No}.jpg'}
                </code>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  File diunduh dalam format arsip standar (<strong>.zip</strong>) yang dapat langsung dibuka menggunakan{' '}
                  <strong>WinRAR</strong>, 7-Zip, maupun File Explorer tanpa aplikasi tambahan.
                </p>
              </div>

              {archivePreparing ? (
                <div className="py-10 text-center space-y-2">
                  <Loader2 size={22} className="animate-spin mx-auto text-[var(--accent)]" />
                  <p className="text-xs text-[var(--text-secondary)]">
                    Memeriksa foto raw aktif pada laporan kerja...
                  </p>
                </div>
              ) : archivePreviewEntries.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-6 text-center space-y-1.5">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    Tidak Ada Foto Raw Baru untuk Diarsipkan
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Seluruh foto raw pada laporan ini sudah pernah diunduh &amp; dibersihkan dari database, atau laporan belum memiliki foto dokumentasi. Salinan foto pada dokumen PDF Laporan Kunjungan tetap tersimpan aman.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-[var(--text-primary)]">
                        Daftar File Foto Siap Diunduh ({archivePreviewEntries.length} Foto)
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] font-mono">
                        Estimasi ukuran: ±{Math.max(40, archivePreviewEntries.length * 50)} KB
                      </span>
                    </div>
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] divide-y divide-[var(--border-subtle)]">
                      {archivePreviewEntries.map((item, idx) => (
                        <div key={`${item.photo.id}-${idx}`} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] font-semibold text-[var(--text-primary)] truncate" title={item.filename}>
                              {item.filename}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)] truncate">
                              Laporan: {item.clientName} • Teknisi: {item.executorName} • Tanggal: {item.dateStr}
                            </p>
                          </div>
                          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                            {item.photo.photoType.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-start gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={archiveOffloadDb}
                      onChange={e => setArchiveOffloadDb(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--border-subtle)] accent-emerald-600 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <span className="font-bold text-[var(--text-primary)] block">
                        Hapus foto raw dari database setelah diunduh (Hemat Kuota Database)
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)] block leading-relaxed">
                        Saat dicentang, file foto raw berukuran besar akan dihapus dari database setelah arsip terunduh.{' '}
                        <strong className="text-emerald-700 dark:text-emerald-300">
                          Foto di dalam PDF Laporan Kunjungan sudah di-setup otomatis dan TIDAK ikut terhapus
                        </strong>{' '}
                        sehingga Anda tetap dapat mencetak atau mengunduh PDF kapan saja lengkap dengan fotonya.
                      </span>
                    </div>
                  </label>
                </>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-tertiary)] flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={archiveDownloading}
                onClick={() => setArchiveModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)] transition-colors cursor-pointer"
              >
                Tutup
              </button>
              {archivePreviewEntries.length > 0 && (
                <button
                  type="button"
                  disabled={archiveDownloading || archivePreparing}
                  onClick={() => void handleExecuteArchiveDownload()}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold shadow-2xs transition-colors disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
                >
                  {archiveDownloading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Mengunduh &amp; Mengoptimasi DB...</span>
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      <span>
                        {archiveOffloadDb
                          ? `Unduh Arsip (${archivePreviewEntries.length} Foto) & Hapus Raw di DB`
                          : `Unduh Arsip (${archivePreviewEntries.length} Foto)`}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Komponen Panduan Aplikasi — Tur Interaktif Lintas Modul */}
      <AppGuideTour
        mode={appGuideMode}
        userRole={user?.role}
        activeTab={activeTab}
        availableModuleIds={sidebarItems.map(item => item.id)}
        onNavigateTab={tabId => {
          setCameFromDashboard(false);
          setActiveTab(tabId as Tab);
        }}
        onStartTour={() => {
          setMobileMenuOpen(false);
          setAppGuideMode('tour');
        }}
        onOpenRoleGuidebook={() => setShowRoleGuidebook(true)}
        onClose={() => setAppGuideMode('idle')}
        onComplete={() => setAppGuideMode('idle')}
      />

      <RoleGuidebookModal
        isOpen={showRoleGuidebook}
        onClose={() => setShowRoleGuidebook(false)}
      />
    </AppLayout>
  );
};

const RiskConfigPanel: React.FC<{
  config: RiskConfig | null;
  onSave: (partial: Partial<RiskConfig>) => Promise<void>;
  onReset?: () => Promise<void>;
}> = ({ config, onSave, onReset }) => {
  const [draft, setDraft] = useState<RiskConfig | null>(config);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(config), [config]);

  if (!draft) return <div className="py-16 text-center text-sm text-[var(--text-muted)]">Memuat konfigurasi...</div>;

  const field = (key: keyof RiskConfig, label: string, unit: string) => (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          value={draft[key] as number}
          onChange={e => setDraft(d => (d ? { ...d, [key]: Number(e.target.value) } : d))}
          className="w-20 px-2 py-1 text-xs text-right rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono tabular-nums"
        />
        <span className="text-xs text-[var(--text-muted)] w-10">{unit}</span>
      </div>
    </div>
  );

  const handleSave = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="clean-card bg-[var(--bg-card)] p-5 rounded-xl border border-[var(--border-subtle)]">
        <h3 className="font-bold text-sm text-[var(--text-primary)] mb-1">Ambang Batas Poin Risiko</h3>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Nilai ini menentukan bobot poin evaluasi presensi dan durasi kerja lapangan.
        </p>
        {field('lateCheckinThresholdMinutes', 'Batas keterlambatan check-in', 'menit')}
        {field('lateCheckinPoints', 'Poin check-in terlambat', 'poin')}
        {field('outsideRadiusPoints', 'Poin GPS di luar radius', 'poin')}
        {field('shortDurationCriticalMinutes', 'Durasi sangat singkat (batas)', 'menit')}
        {field('shortDurationCriticalPoints', 'Poin durasi sangat singkat', 'poin')}
        {field('shortDurationWarningMinutes', 'Durasi singkat (batas)', 'menit')}
        {field('shortDurationWarningPoints', 'Poin durasi singkat', 'poin')}
      </div>
      <div className="clean-card bg-[var(--bg-card)] p-5 rounded-xl border border-[var(--border-subtle)]">
        <h3 className="font-bold text-sm text-[var(--text-primary)] mb-1">Dokumentasi &amp; Level Risiko</h3>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Batas skor yang menentukan kategori status risiko pada dashboard.
        </p>
        {field('minTotalPhotos', 'Minimum total foto', 'foto')}
        {field('minTotalPhotosPoints', 'Poin foto kurang', 'poin')}
        {field('noProgressPhotoPoints', 'Poin tanpa foto progres', 'poin')}
        {field('locationDriftThresholdMeters', 'Batas pergeseran lokasi', 'meter')}
        {field('locationDriftPoints', 'Poin pergeseran lokasi', 'poin')}
        {field('missingTreatmentRecordPoints', 'Poin data treatment kosong', 'poin')}
        {field('fumigationMissingAerationPoints', 'Poin fumigasi tanpa data aerasi', 'poin')}
        {field('lowRiskThreshold', 'Ambang Risiko Rendah', 'skor')}
        {field('reviewThreshold', 'Ambang Perlu Ditinjau', 'skor')}
        {field('highRiskThreshold', 'Ambang Risiko Tinggi', 'skor')}
        {field('criticalThreshold', 'Ambang Kritis', 'skor')}
      </div>
      <div className="lg:col-span-2 flex flex-wrap items-center justify-end gap-3">
        {saved && <span className="text-xs font-semibold text-[var(--status-completed-text)]">Konfigurasi tersimpan.</span>}
        {onReset && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)] transition-colors cursor-pointer"
              >
                Kembalikan ke Standar Bawaan
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Kembalikan Konfigurasi Poin ke Nilai Bawaan?</AlertDialogTitle>
                <AlertDialogDescription>
                  Seluruh batas poin kehadiran dan risiko akan dikembalikan ke nilai standar sistem. Anda masih dapat mengurungkan tindakan ini sesaat setelah direset.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="font-medium">Batalkan</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void onReset()}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold"
                >
                  Ya, Reset ke Bawaan
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold shadow-sm transition-all disabled:opacity-60 flex items-center gap-2 cursor-pointer"
        >
          {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Simpan Konfigurasi
        </button>
      </div>
    </div>
  );
};
