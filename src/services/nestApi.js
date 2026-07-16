const NEST_URL = import.meta.env.VITE_NEST_API_URL || 'http://localhost:3001';
const REQUEST_TIMEOUT = 120000; // 2 min for large Excel uploads

function getAuthHeaders() {
  const raw = localStorage.getItem('barventis_session');
  if (!raw) return {};
  try {
    const session = JSON.parse(raw);
    const token = session?.access_token;
    if (!token || typeof token !== 'string' || token.length < 10) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function request(method, path, body, isFormData = false) {
  const headers = { ...getAuthHeaders() };
  if (!headers.Authorization) {
    throw new Error('No valid authentication token. Please log in again.');
  }
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${NEST_URL}${path}`, {
      method,
      headers,
      body: isFormData ? body : JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => null);

    if (res.status === 401) {
      // Token expired or invalid - clear session
      localStorage.removeItem('barventis_session');
      throw new Error('Sesi berakhir. Silakan login kembali.');
    }
    if (!res.ok) {
      throw new Error(data?.message || `Request failed (${res.status})`);
    }
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timeout. File terlalu besar atau server lambat.', { cause: err });
    }
    throw err;
  }
}

export const nestApi = {
  async syncPos(file, filename) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('filename', filename);
    return request('POST', '/api/pos/sync', fd, true);
  },

  async importMaterials(file) {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/import/materials', fd, true);
  },

  async importRecipes(file) {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/import/recipes', fd, true);
  },

  async importInvoices(file) {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/import/invoices', fd, true);
  },
};
