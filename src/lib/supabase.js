import { createClient } from '@supabase/supabase-js';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Sanitize Supabase URL to remove accidental trailing "/rest/v1/" suffix or slashes
if (supabaseUrl && typeof supabaseUrl === 'string') {
  supabaseUrl = supabaseUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

// Fail-fast validation: Cegah inisialisasi jika file .env belum disetup
if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-supabase-project')) {
  console.warn(
    '⚠️ [UMATIS] Supabase URL atau Anon Key belum dikonfigurasi di .env.\n' +
    'Silakan buat file .env di root project Anda dengan kredensial yang valid:\n' +
    'VITE_SUPABASE_URL=https://xxxxx.supabase.co\n' +
    'VITE_SUPABASE_ANON_KEY=eyJ...'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder',
  {
    auth: {
      // Custom no-op lock to completely bypass browser navigator.locks deadlocks (stuck loading screen)
      lock: async (name, acquireTimeout, fn) => fn(),
    }
  }
);
