import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { offlineInventoryCache } from '../../services/offlineInventoryCache';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Offline status banner informing the user when connection is lost
 * and confirming that cached inventory data is being displayed.
 */
export default function OfflineStatusIndicator() {
  const { activeUser } = useAuth();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState(false);
  const [lastSyncText, setLastSyncText] = useState('');

  useEffect(() => {
    const updateSyncMeta = async () => {
      if (activeUser?.tenant_id) {
        const meta = await offlineInventoryCache.getStockListMeta(activeUser.tenant_id);
        if (meta?.lastSynced) {
          const date = new Date(meta.lastSynced);
          setLastSyncText(
            date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          );
        }
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      const timer = setTimeout(() => {
        setJustReconnected(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      updateSyncMeta();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (!navigator.onLine) {
      updateSyncMeta();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [activeUser]);

  // Don't render anything if online and not just reconnected
  if (isOnline && !justReconnected) {
    return null;
  }

  if (justReconnected) {
    return (
      <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between no-print animate-fade-in">
        <div className="flex items-center gap-2">
          <Wifi size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span className="font-semibold">Koneksi Internet Pulih</span>
          <span className="text-[11px] opacity-80">— Data inventaris sedang disinkronkan kembali secara otomatis.</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-mono opacity-80">
          <RefreshCw size={11} className="animate-spin text-emerald-700 dark:text-emerald-400" />
          <span>Syncing</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-300 flex items-center justify-between no-print">
      <div className="flex items-center gap-2 min-w-0">
        <WifiOff size={14} className="text-amber-800 dark:text-amber-400 shrink-0" />
        <span className="font-bold">Mode Offline Aktif:</span>
        <span className="truncate">
          Koneksi terputus. Anda tetap dapat melihat dan meninjau daftar stok & inventaris dari cache lokal.
        </span>
      </div>
      {lastSyncText && (
        <span className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30">
          Sinkron Terakhir: {lastSyncText}
        </span>
      )}
    </div>
  );
}
