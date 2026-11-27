import React, { useState, useEffect, useMemo } from 'react';
import { AppUser } from '@/entities/types';
import {
  Menu,
  X,
  BookOpen,
  RefreshCw,
  KeyRound,
  LogOut,
  Search,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  HelpCircle,
} from 'lucide-react';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';
import { RoleGuidebookModal } from './RoleGuidebookModal';
import { useTheme } from '@/shared/hooks/useTheme';

export interface QuickJumpModuleItem {
  id: string;
  label: string;
  shortLabel?: string;
  group?: string;
  icon?: React.ReactNode;
}

interface HeaderProps {
  hideMobileMenu?: boolean;
  currentUser: AppUser;
  onLogout: () => void;
  pageTitle?: string;
  pageGroup?: string;
  pageSubtitle?: string;
  pendingCount?: number;
  onSync?: () => void;
  onRefresh?: () => void;
  isSyncing?: boolean;
  onMenuToggle?: () => void;
  mobileMenuOpen?: boolean;
  modules?: QuickJumpModuleItem[];
  activeModuleId?: string;
  onSelectModule?: (id: string) => void;
  onOpenAppGuide?: () => void;
}

const ROLE_BADGE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Direktur',
  ADMIN: 'Admin',
  TEKNISI_LAPANGAN: 'Teknisi',
  MARKETING: 'Marketing',
  INVENTORY: 'Gudang',
};

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onLogout,
  pageTitle = 'Dashboard Operasional',
  pageGroup,
  pageSubtitle,
  pendingCount = 0,
  onSync,
  onRefresh,
  isSyncing,
  onMenuToggle,
  mobileMenuOpen,
  hideMobileMenu,
  modules = [],
  activeModuleId,
  onSelectModule,
  onOpenAppGuide,
}) => {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showGuidebook, setShowGuidebook] = useState(false);
  const [showQuickJump, setShowQuickJump] = useState(false);
  const [jumpQuery, setJumpQuery] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [refreshSpin, setRefreshSpin] = useState(false);

  const { theme, resolvedTheme, setTheme, cycleTheme, options: themeOptions } = useTheme();
  const isMasterSuper = currentUser.role === 'MASTER_SUPER_ADMIN';

  // Global keyboard shortcut Ctrl+K / Cmd+K for Quick Jump
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickJump(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowQuickJump(false);
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredModules = useMemo(() => {
    const q = jumpQuery.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter(
      m =>
        m.label.toLowerCase().includes(q) ||
        (m.shortLabel ?? '').toLowerCase().includes(q) ||
        (m.group ?? '').toLowerCase().includes(q)
    );
  }, [modules, jumpQuery]);

  const handleRefreshClick = () => {
    setRefreshSpin(true);
    setTimeout(() => setRefreshSpin(false), 600);
    if (onRefresh) {
      onRefresh();
    } else if (onSync) {
      onSync();
    } else {
      window.location.reload();
    }
  };

  const userInitials = (currentUser.name || 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <header className="min-h-[60px] bg-[var(--bg-card)] border-b border-[var(--border-subtle)] text-[var(--text-primary)] sticky top-0 z-40 px-4 sm:px-7 flex items-center">
        <div className="w-full max-w-[1510px] mx-auto flex items-center justify-between gap-4">
          {/* Left: Hamburger + Clean Page Title */}
          <div className="flex items-center gap-3 min-w-0">
            {!hideMobileMenu && (
              <button
                type="button"
                onClick={onMenuToggle}
                aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
                aria-expanded={Boolean(mobileMenuOpen)}
                className="xl:hidden w-9 h-9 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] flex items-center justify-center shrink-0 cursor-pointer"
              >
                {mobileMenuOpen ? <X size={18} /> : <Menu size={19} />}
              </button>
            )}

            <strong className="font-bold text-[15px] sm:text-base tracking-[-0.015em] text-[var(--text-primary)] truncate">
              {pageTitle}
            </strong>
          </div>

          {/* Right: Help Guide + Refresh + Profile Menu */}
          <div
            data-app-tour="header-actions"
            className="flex items-center gap-2 shrink-0 text-[var(--text-secondary)]"
          >
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={onSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 text-xs font-semibold bg-[#fff4df] border border-[#edd5a5] text-[#895b13] px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                title="Sinkronkan data offline"
              >
                {isSyncing ? 'Menyinkronkan...' : `${pendingCount} Belum Sinkron`}
              </button>
            )}

            {/* Accessible Help Icon: Panduan Aplikasi */}
            <button
              type="button"
              data-testid="app-guide-trigger"
              onClick={() => {
                if (onOpenAppGuide) {
                  onOpenAppGuide();
                } else {
                  setShowGuidebook(true);
                }
              }}
              aria-label="Buka Panduan Aplikasi"
              title="Panduan Aplikasi — Tur Interaktif"
              className="h-9 px-2.5 sm:px-3 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
            >
              <HelpCircle size={16} className="text-[var(--accent-text)] shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Panduan</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleRefreshClick}
              aria-label="Muat ulang data"
              title="Muat ulang data halaman ini"
              className="w-9 h-9 rounded-[9px] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <RefreshCw
                size={16}
                className={refreshSpin ? 'animate-spin text-[var(--accent)]' : ''}
                aria-hidden="true"
              />
            </button>

            {/* Profile Dropdown Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen(v => !v)}
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                aria-label="Menu Akun dan Pengaturan"
                className="flex items-center gap-2.5 px-2 py-1 rounded-[10px] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] text-[13px] font-medium transition-colors cursor-pointer"
              >
                <div className="avatar green">
                  {userInitials}
                </div>
                <span className="max-w-[110px] sm:max-w-[150px] truncate hidden sm:inline-block text-[var(--text-secondary)] font-medium">
                  {currentUser.name}
                </span>
                <ChevronDown size={15} className="text-[var(--text-muted)]" aria-hidden="true" />
              </button>

              {profileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setProfileMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    role="menu"
                    aria-label="Menu Akun"
                    className="absolute right-0 mt-2 w-72 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl z-50 p-3 space-y-2 text-[var(--text-primary)]"
                  >
                    <div className="p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-[var(--text-primary)] truncate">
                          {currentUser.name}
                        </span>
                        {!isMasterSuper && (
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border border-[var(--status-completed-border)] shrink-0">
                            {ROLE_BADGE_LABELS[currentUser.role] ?? currentUser.role}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {currentUser.email}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2">
                      <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                        Mode Tampilan
                      </span>
                      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Pilih mode tampilan">
                        {themeOptions.map(opt => {
                          const isSelected = theme === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              role="menuitemradio"
                              aria-checked={isSelected}
                              onClick={() => setTheme(opt.value)}
                              className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {opt.value === 'light' && <Sun size={13} aria-hidden="true" />}
                              {opt.value === 'dark' && <Moon size={13} aria-hidden="true" />}
                              {opt.value === 'system' && <Monitor size={13} aria-hidden="true" />}
                              <span>{opt.shortLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {onOpenAppGuide ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          onOpenAppGuide();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                      >
                        <HelpCircle size={16} className="text-[var(--accent-text)]" aria-hidden="true" />
                        <span>Panduan Aplikasi</span>
                      </button>
                    ) : !isMasterSuper ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          setShowGuidebook(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                      >
                        <BookOpen size={16} className="text-[var(--text-muted)]" aria-hidden="true" />
                        <span>Panduan Penggunaan</span>
                      </button>
                    ) : null}

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setShowChangePassword(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                    >
                      <KeyRound size={16} className="text-[var(--text-muted)]" aria-hidden="true" />
                      <span>Ubah Kata Sandi</span>
                    </button>

                    <div className="pt-1 border-t border-[var(--border-subtle)]">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--status-flagged-text)] hover:bg-[var(--status-flagged-bg)] transition-colors cursor-pointer"
                      >
                        <LogOut size={16} aria-hidden="true" />
                        <span>Keluar</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {showQuickJump && onSelectModule && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-[2px] flex items-start justify-center pt-14 sm:pt-20 p-4 modal-overlay-in"
          onClick={() => setShowQuickJump(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Pencarian cepat menu"
        >
          <div
            className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] max-w-lg w-full shadow-2xl overflow-hidden modal-card-in text-[var(--text-primary)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-[var(--border-subtle)] flex items-center gap-2.5 bg-[var(--bg-primary)]">
              <Search size={16} className="text-[var(--text-muted)] shrink-0 ml-1" aria-hidden="true" />
              <input
                autoFocus
                value={jumpQuery}
                onChange={e => setJumpQuery(e.target.value)}
                aria-label="Ketik nama menu"
                placeholder="Cari menu (contoh: Dashboard, Penawaran, Gudang, SPK)..."
                className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowQuickJump(false)}
                className="px-2 py-1 rounded text-xs font-semibold text-[var(--text-muted)] bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
              {filteredModules.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  Menu &ldquo;{jumpQuery}&rdquo; tidak ditemukan.
                </div>
              ) : (
                filteredModules.map(m => {
                  const isCurrent = m.id === activeModuleId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onSelectModule(m.id);
                        setShowQuickJump(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-[var(--accent-glow)] text-[var(--accent-text)] font-bold'
                          : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{m.label}</div>
                        {m.group && (
                          <div className="text-xs text-[var(--text-muted)] truncate">
                            {m.group.replace(/^\d+\.\s*/, '')}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-[var(--text-muted)] flex items-center gap-1 shrink-0">
                        {isCurrent ? 'Aktif' : 'Buka'}
                        <ChevronRight size={14} aria-hidden="true" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <RoleGuidebookModal isOpen={showGuidebook} onClose={() => setShowGuidebook(false)} />

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
};
