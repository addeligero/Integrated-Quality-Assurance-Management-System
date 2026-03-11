import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import supabase, { supabaseAdmin } from '@/lib/supabase'

export interface AdminUser {
  id: string
  f_name: string
  l_name: string
  extension: string | null
  username: string | null
  role: string
  department: string | null
  status: boolean
  last_sign_in_at: string | null
  created_at?: string
}

export const NAME_EXTENSIONS = [
  'Dr.',
  'Prof.',
  'Engr.',
  'Atty.',
  'Mr.',
  'Mrs.',
  'Ms.',
  'Rev.',
  'Hon.',
]

export const ROLES: { value: string; label: string }[] = [
  { value: 'dean', label: 'Dean' },
  { value: 'quams_coordinator', label: 'QuAMS Coordinator' },
  { value: 'associate_dean', label: 'Associate Dean' },
  { value: 'department', label: 'Department Head' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'staff', label: 'Staff' },
  { value: 'user', label: 'User' },
]

/**
 * Generate a username from a full name.
 * Algorithm: first letter of each name part (except last) + full last name, lowercase.
 * e.g. "Mary Rose Raz" → "mrraz"
 */
export function generateUsername(fullName: string): string {
  const parts = fullName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 0)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0] ?? ''
  const lastName = parts[parts.length - 1]
  const initials = parts
    .slice(0, -1)
    .map((p) => p[0])
    .join('')
  return initials + lastName
}

export const useAdminStore = defineStore('admin', () => {
  const users = ref<AdminUser[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const initialized = ref(false)
  const error = ref<string | null>(null)
  const twoFactorEnabled = ref(false)
  const settingsLoaded = ref(false)

  // ── Derived stats ──────────────────────────────────────────────────────────

  const totalUsers = computed(() => users.value.length)
  const activeUsers = computed(() => users.value.filter((u) => u.status).length)
  const departmentCount = computed(
    () => new Set(users.value.map((u) => u.department).filter(Boolean)).size,
  )
  const adminCount = computed(
    () => users.value.filter((u) => ['admin', 'dean', 'quams_coordinator'].includes(u.role)).length,
  )

  // ── Actions ────────────────────────────────────────────────────────────────

  async function fetchUsers() {
    if (initialized.value) return
    loading.value = true
    error.value = null
    try {
      // supabaseAdmin bypasses RLS — needed kay  ang  profiles RLS policy maka causae ug cause
      // infinite recursion
      const { data: profilesData, error: profilesErr } = await supabaseAdmin
        .from('profiles')
        .select('id, f_name, l_name, extension, username, role, department, status, created_at')
        .order('created_at', { ascending: false })

      if (profilesErr) throw profilesErr

      // Fetch auth users to get last_sign_in_at
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      const signInMap = new Map<string, string | null>(
        (authData?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]),
      )

      users.value = (profilesData || []).map((p) => ({
        ...p,
        last_sign_in_at: signInMap.get(p.id) ?? null,
      }))
      initialized.value = true
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch users'
    } finally {
      loading.value = false
    }
  }

  /**
   * Create a new user.
   * Using supabase.auth.signUp with an internal email (username@quams.internal).
   */
  async function addUser(payload: {
    fullName: string
    extension: string
    username: string
    role: string
    department: string
    password: string
  }) {
    saving.value = true
    error.value = null
    try {
      // Derive first/last name from full name
      const parts = payload.fullName.trim().split(/\s+/)
      const l_name = parts.pop() || ''
      const f_name = parts.join(' ')

      // Internal email — never shown to users
      const internalEmail = `${payload.username}@quams-system.com`

      // Use admin API to create auth user — no confirmation email sent, no rate limit
      const { data: authData, error: signUpErr } = await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password: payload.password,
        email_confirm: true, // mark as confirmed immediately, no email sent
      })

      if (signUpErr) throw signUpErr
      if (!authData.user) throw new Error('Failed to create auth user')

      // Upsert profile via supabaseAdmin — same reason as fetchUsers (recursion-safe)
      const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
        id: authData.user.id,
        f_name,
        l_name,
        extension: payload.extension || null,
        username: payload.username,
        email: internalEmail, // stored for username→email lookup during login
        role: payload.role,
        department: payload.department || null,
        status: true,
      })

      if (profileErr) throw profileErr

      // Re-fetch the full list so the new user appears with server-generated data
      initialized.value = false
      await fetchUsers()

      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create user'
      error.value = msg
      return { success: false, error: msg }
    } finally {
      saving.value = false
    }
  }

  async function updateUserRole(id: string, role: string) {
    const { error: err } = await supabaseAdmin.from('profiles').update({ role }).eq('id', id)
    if (err) throw err
    const u = users.value.find((u) => u.id === id)
    if (u) u.role = role
  }

  async function deactivateUser(id: string) {
    const { error: err } = await supabaseAdmin
      .from('profiles')
      .update({ status: false })
      .eq('id', id)
    if (err) throw err
    // Revoke all Supabase auth sessions for this user immediately
    await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876600h' }).catch(() => {})
    const u = users.value.find((u) => u.id === id)
    if (u) u.status = false
  }

  async function reactivateUser(id: string) {
    const { error: err } = await supabaseAdmin
      .from('profiles')
      .update({ status: true })
      .eq('id', id)
    if (err) throw err
    // Remove the auth ban so the user can log in again
    await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: 'none' }).catch(() => {})
    const u = users.value.find((u) => u.id === id)
    if (u) u.status = true
  }

  async function fetchSettings() {
    if (settingsLoaded.value) return
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'two_factor_required')
      .maybeSingle()
    twoFactorEnabled.value = data?.value === 'true'
    settingsLoaded.value = true
  }

  async function saveTwoFactorSetting(enabled: boolean) {
    twoFactorEnabled.value = enabled
    await supabaseAdmin.from('app_settings').upsert({
      key: 'two_factor_required',
      value: String(enabled),
      updated_at: new Date().toISOString(),
    })
    settingsLoaded.value = true
  }

  function roleLabel(role: string) {
    return ROLES.find((r) => r.value === role)?.label ?? role
  }

  return {
    users,
    loading,
    saving,
    initialized,
    error,
    twoFactorEnabled,
    totalUsers,
    activeUsers,
    departmentCount,
    adminCount,
    fetchUsers,
    addUser,
    updateUserRole,
    deactivateUser,
    reactivateUser,
    fetchSettings,
    saveTwoFactorSetting,
    roleLabel,
  }
})
