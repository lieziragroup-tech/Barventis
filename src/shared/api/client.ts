import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/app/store/authStore';

const API_URL = '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const st = useAuthStore.getState();
  if ((st.user?.role === 'MASTER_SUPER_ADMIN' || st.user?.role === 'SUPERADMIN') && st.activeCompanyId) headers['X-Company-Id'] = st.activeCompanyId;
  return headers;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | undefined>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = await authHeaders();

  let url = `${API_URL}${path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') params.set(k, v);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let response: Response;
  try {
    response = await fetch(url, { method: opts.method || 'GET', headers, body });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
  }

  if (response.status === 401) {
    void supabase.auth.signOut();
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(response.status, data.error || 'Terjadi kesalahan. Coba lagi.');
    }
    throw new ApiError(response.status, 'Terjadi kesalahan. Coba lagi.');
  }

  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.blob()) as unknown as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | undefined>) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  postForm: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData }),
};

export async function fetchAuthedBlobUrl(path: string): Promise<string> {
  if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http')) {
    const res = await fetch(path);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  const match = path.match(/\/photos\/([0-9a-fA-F-]+)\/file/);
  if (match) {
    const photoId = match[1];
    const { data } = await supabase
      .from('documentation_photos')
      .select('storage_path')
      .eq('id', photoId)
      .maybeSingle();
    if (data?.storage_path) {
      if (data.storage_path.startsWith('data:') || data.storage_path.startsWith('http')) {
        const r = await fetch(data.storage_path);
        return URL.createObjectURL(await r.blob());
      }
      const { data: fileBlob } = await supabase.storage.from('evidence-photos').download(data.storage_path);
      if (fileBlob) return URL.createObjectURL(fileBlob);
    }
  }

  const normalized = path.startsWith('/api/') ? path : `${API_URL}${path}`;
  const response = await fetch(normalized, { headers: await authHeaders() });
  if (!response.ok) throw new ApiError(response.status, 'Foto tidak dapat dimuat.');
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
