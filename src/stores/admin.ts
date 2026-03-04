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
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, f_name, l_name, extension, username, role, department, status, created_at')
        .order('created_at', { ascending: false })

      if (err) throw err
      users.value = data || []
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
   * IMPORTANT: Disable "Confirm email" in your Supabase project's Auth settings,
   * OR the user must be manually confirmed from the Supabase Dashboard.
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

      // Upsert profile (the DB trigger creates a bare-bones row; we fill all fields)
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
    const { error: err } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (err) throw err
    const u = users.value.find((u) => u.id === id)
    if (u) u.role = role
  }

  async function deactivateUser(id: string) {
    const { error: err } = await supabase.from('profiles').update({ status: false }).eq('id', id)
    if (err) throw err
    const u = users.value.find((u) => u.id === id)
    if (u) u.status = false
  }

  async function reactivateUser(id: string) {
    const { error: err } = await supabase.from('profiles').update({ status: true }).eq('id', id)
    if (err) throw err
    const u = users.value.find((u) => u.id === id)
    if (u) u.status = true
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
    totalUsers,
    activeUsers,
    departmentCount,
    adminCount,
    fetchUsers,
    addUser,
    updateUserRole,
    deactivateUser,
    reactivateUser,
    roleLabel,
  }
})
