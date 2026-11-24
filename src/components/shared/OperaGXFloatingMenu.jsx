import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, X, Check, SlidersHorizontal } from 'lucide-react';

/**
 * Minimalist, interactive floating sub-header menu.
 * Clean, lightweight, and modern without unnecessary gimmicks.
 */
export default function OperaGXFloatingMenu({
  tabs = [],
  activeTab,
  onSelectTab,
  title = 'Sub Menu',
  subModes = null,
  activeSubMode = null,
  onSelectSubMode = null,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const currentTabObj = tabs.find(t => t.key === activeTab) || tabs[0];

  const handleClose = useCallback(() => setIsOpen(false), []);
  const handleToggle = useCallback(() => setIsOpen(prev => !prev), []);

  const handleSelect = useCallback((key) => {
    if (onSelectTab) {
      onSelectTab(key);
    }
    setIsOpen(false);
  }, [onSelectTab]);

  const handleSelectSubMode = (key) => {
    if (onSelectSubMode) {
      onSelectSubMode(key);
    }
  };

  // Keyboard accessibility: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClose]);

  if (!tabs || tabs.length <= 1) {
    return null;
  }

  return (
    <div 
      ref={menuRef}
      className={`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 no-print select-none ${className}`}
    >
      {/* Floating Menu Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-14 right-0 w-64 sm:w-72 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-xl p-2 overflow-hidden"
            style={{
              backdropFilter: 'blur(16px)',
              background: 'var(--bg-card)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)]/60 mb-1">
              <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                {title}
              </span>
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {tabs.length} Menu
              </span>
            </div>

            {/* Optional Sub-mode Switcher (e.g. Rekap vs EOD) */}
            {subModes && subModes.length > 0 && (
              <div className="p-1 mb-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]/60 flex items-center gap-1">
                <SlidersHorizontal size={13} className="text-[var(--text-muted)] ml-1.5 shrink-0" />
                <div className="grid grid-cols-2 gap-1 flex-1">
                  {subModes.map((sm) => {
                    const isModeActive = activeSubMode === sm.key;
                    return (
                      <button
                        key={sm.key}
                        type="button"
                        onClick={() => handleSelectSubMode(sm.key)}
                        className={`py-1 px-2 rounded-lg text-xs font-semibold transition-all text-center ${
                          isModeActive
                            ? 'bg-[var(--accent)] text-white shadow-xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
                        }`}
                      >
                        {sm.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-Header Tabs List */}
            <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                const Icon = tab.icon || Layers;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleSelect(tab.key)}
                    className={`w-full text-left rounded-xl px-2.5 py-2 transition-all flex items-center justify-between gap-2.5 ${
                      isActive
                        ? 'bg-[var(--accent-glow)] text-[var(--accent)] font-bold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon size={16} className={`shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                      <span className="text-xs truncate">{tab.label}</span>
                    </div>

                    {isActive && (
                      <Check size={14} className="text-[var(--accent)] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button */}
      <motion.button
        type="button"
        onClick={handleToggle}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`flex items-center justify-center gap-2 h-11 px-3.5 rounded-full border shadow-md transition-all cursor-pointer ${
          isOpen
            ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-lg'
            : 'bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border)] hover:border-[var(--accent)]'
        }`}
        style={{
          backdropFilter: 'blur(12px)',
        }}
        title={isOpen ? 'Tutup Menu' : 'Pilihan Sub Menu'}
        aria-label="Pilihan Sub Menu"
      >
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center shrink-0"
        >
          {isOpen ? <X size={17} /> : <Layers size={17} className={isOpen ? 'text-white' : 'text-[var(--accent)]'} />}
        </motion.div>
        <span className="text-xs font-semibold max-w-[120px] sm:max-w-[150px] truncate hidden xs:inline">
          {isOpen ? 'Tutup' : currentTabObj?.label || 'Sub Menu'}
        </span>
      </motion.button>
    </div>
  );
}
