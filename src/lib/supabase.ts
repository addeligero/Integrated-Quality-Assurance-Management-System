import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Admin client uses the service role key — bypasses RLS and email rate limits.
// Uses an isolated no-op storage so it NEVER touches the regular user's session in localStorage.
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
const noopStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
}
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    storage: noopStorage,
    storageKey: 'sb-admin-internal', // unique key prevents "multiple instances" warning
  },
})

export default supabase
