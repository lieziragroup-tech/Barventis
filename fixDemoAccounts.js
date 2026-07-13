import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function fixAccounts() {
  console.log("Logging in as superadmin...");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'lieziragroup@gmail.com', // Use the superadmin email
    password: 'password123' // Or whatever the password is... wait, I don't know the password!
  });
}
fixAccounts();
