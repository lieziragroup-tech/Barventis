import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'barventis_activity_logs';

function clearLegacyStoredLogs() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function storeLog({ action, description }) {
  clearLegacyStoredLogs();
  flushSingleToServer({ action, description }).catch(() => {});
}

export function getPendingLogs() {
  clearLegacyStoredLogs();
  return [];
}

export function getPendingCount() {
  clearLegacyStoredLogs();
  return 0;
}

async function flushSingleToServer({ action, description }) {
  if (!action) return 0;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return 0;

  const { data: userProfile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', session.user.id)
    .maybeSingle();

  const tenantId = userProfile?.tenant_id;
  if (!tenantId) return 0;

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: session.user.id,
    action,
    description,
    is_system: false,
    created_at: new Date().toISOString()
  });
  return 1;
}

export async function flushLogs() {
  clearLegacyStoredLogs();
}

export function initAutoFlush() {
  clearLegacyStoredLogs();
}

export function stopAutoFlush() {}

export async function flushOnLogout() {
  clearLegacyStoredLogs();
}
