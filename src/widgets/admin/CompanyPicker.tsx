import { useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/app/store/authStore';

/**
 * Khusus SUPERADMIN: memilih perusahaan (tenant) yang sedang dikelola di FieldWork.
 * Otomatis memilih perusahaan pertama (PT Guci Emas Pratama) bila belum ada yang dipilih.
 */
export function CompanyPicker() {
  const activeCompanyId = useAuthStore(s => s.activeCompanyId);
  const setActiveCompanyId = useAuthStore(s => s.setActiveCompanyId);
  const [companies, setCompanies] = useState<{ id: string; company_name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('companies').select('id, company_name').order('company_name').then(({ data, error: err }) => {
      if (err) { setError(err.message); return; }
      const list = data ?? [];
      setCompanies(list);
      if (list.length > 0 && (!activeCompanyId || !list.some(c => c.id === activeCompanyId))) {
        setActiveCompanyId(list[0].id);
      }
    });
  }, [activeCompanyId, setActiveCompanyId]);

  if (companies.length <= 1) return null;

  return (
    <div className="mt-2">
      <label
        htmlFor="fw-company-picker"
        className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1"
      >
        Tenant Perusahaan
      </label>
      <select
        id="fw-company-picker"
        aria-label="Pilih perusahaan aktif"
        value={activeCompanyId ?? ''}
        onChange={e => setActiveCompanyId(e.target.value || null)}
        className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
      >
        {companies.map(c => (
          <option key={c.id} value={c.id}>{c.company_name}</option>
        ))}
      </select>
      {error && <p className="text-xs text-[var(--danger)] mt-1" role="alert">{error}</p>}
    </div>
  );
}
