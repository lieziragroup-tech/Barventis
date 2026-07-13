import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'barventis_activity_logs';
const MAX_ENTRIES = 500;
const FLUSH_BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let flushTimer = null;

// --- Local Storage Helpers ---

function getStoredLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredLogs(logs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.warn('[ActivityLog] localStorage write failed:', e);
  }
}

// --- Public API ---

export function storeLog({ action, description }) {
  const logs = getStoredLogs();
  const entry = {
    id: crypto.randomUUID(),
    tenant_id: null, // filled at flush time from session
    user_id: null,
    action,
    description,
    created_at: new Date().toISOString(),
  };
  logs.push(entry);

  // Cap: if over limit, flush oldest synchronously (best-effort)
  if (logs.length > MAX_ENTRIES) {
    const excess = logs.splice(0, logs.length - MAX_ENTRIES);
    setStoredLogs(logs);
    flushToServer(excess).catch(() => {});
  } else {
    setStoredLogs(logs);
  }
}

export function getPendingLogs() {
  return getStoredLogs();
}

export function getPendingCount() {
  return getStoredLogs().length;
}

// --- Sync to Supabase ---

async function flushToServer(entries) {
  if (!entries || entries.length === 0) return 0;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return 0;

  const { data: userProfile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', session.user.id)
    .maybeSingle();

  const tenantId = userProfile?.tenant_id;
  const userId = session.user.id;

  const payload = entries.map(e => ({
    tenant_id: tenantId,
    user_id: userId,
    action: e.action,
    description: e.description,
    created_at: e.created_at,
  }));

  // Batch insert in chunks of FLUSH_BATCH_SIZE
  let synced = 0;
  for (let i = 0; i < payload.length; i += FLUSH_BATCH_SIZE) {
    const batch = payload.slice(i, i + FLUSH_BATCH_SIZE);
    const { error } = await supabase.from('audit_logs').insert(batch);
    if (error) {
      console.warn('[ActivityLog] Flush batch failed:', error.message);
      break; // stop — retry next cycle
    }
    synced += batch.length;
  }
  return synced;
}

export async function flushLogs() {
  const logs = getStoredLogs();
  if (logs.length === 0) return;

  const synced = await flushToServer(logs);
  if (synced > 0) {
    // Remove only the synced entries
    const remaining = logs.slice(synced);
    setStoredLogs(remaining);
  }
}

// --- Auto-flush lifecycle ---

export function initAutoFlush() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushLogs().catch(() => {});
  }, FLUSH_INTERVAL_MS);

  // Flush on tab close / navigation
  window.addEventListener('beforeunload', () => {
    const logs = getStoredLogs();
    if (logs.length === 0) return;
    // Use sendBeacon for reliable delivery on page unload
    const blob = new Blob([JSON.stringify(logs)], { type: 'application/json' });
    navigator.sendBeacon?.('/api/flush-logs', blob);
    // Also attempt async flush (best-effort)
    flushLogs().catch(() => {});
  });
}

export function stopAutoFlush() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export async function flushOnLogout() {
  stopAutoFlush();
  await flushLogs();
}
