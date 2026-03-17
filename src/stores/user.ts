import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/user'
import supabase from '@/lib/supabase'

const DEFAULT_SESSION_TIMEOUT_MINUTES = 30
const SESSION_TIMEOUT_SETTING_KEY = 'session_timeout_minutes'
const LAST_ACTIVITY_STORAGE_KEY = 'quams:last-activity'
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'focus'] as const
const MFA_REQUIRED_ROLES = ['admin', 'dean', 'quams_coordinator'] as const

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const initialized = ref(false)
  const forcedLogoutReason = ref<string | null>(null)
  const sessionTimeoutMinutes = ref(DEFAULT_SESSION_TIMEOUT_MINUTES)
  let profileChannel: ReturnType<typeof supabase.channel> | null = null
  let settingsChannel: ReturnType<typeof supabase.channel> | null = null
  let sessionTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  let activityListenersAttached = false
  let timeoutLogoutInProgress = false

  const isAuthenticated = computed(() => !!user.value)

  const fullName = computed(() => {
    if (!user.value) return 'User'
    return `${user.value.f_name} ${user.value.l_name}`.trim() || 'User'
  })

  const isQuamsCoordinator = computed(() => user.value?.role === 'quams_coordinator')
  const isDean = computed(() => user.value?.role === 'dean')
  const isAdmin = computed(() => user.value?.role === 'admin')
  const hasAdminAccess = computed(() => isDean.value || isQuamsCoordinator.value || isAdmin.value)
  const hasValidationAccess = computed(
    () =>
      hasAdminAccess.value ||
      user.value?.role === 'associate_dean' ||
      user.value?.role === 'department',
  )

  function parseSessionTimeout(value?: string | null) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TIMEOUT_MINUTES
  }

  function getLastActivityTimestamp() {
    if (typeof window === 'undefined') return Date.now()

    const rawValue = window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY)
    const parsed = Number(rawValue)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now()
  }

  function setLastActivityTimestamp(timestamp = Date.now()) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(timestamp))
  }

  function clearSessionTimeoutTimer() {
    if (sessionTimeoutTimer) {
      clearTimeout(sessionTimeoutTimer)
      sessionTimeoutTimer = null
    }
  }

  async function refreshSessionTimeoutSetting() {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SESSION_TIMEOUT_SETTING_KEY)
        .maybeSingle()

      sessionTimeoutMinutes.value = parseSessionTimeout(data?.value)
    } catch {
      sessionTimeoutMinutes.value = DEFAULT_SESSION_TIMEOUT_MINUTES
    }
  }

  async function expireSessionForInactivity() {
    if (!user.value || timeoutLogoutInProgress) return

    timeoutLogoutInProgress = true
    try {
      await logout('session-timeout')
    } finally {
      timeoutLogoutInProgress = false
    }
  }

  function scheduleSessionTimeoutCheck() {
    clearSessionTimeoutTimer()

    if (!user.value) return

    const elapsed = Date.now() - getLastActivityTimestamp()
    const remaining = sessionTimeoutMinutes.value * 60 * 1000 - elapsed

    if (remaining <= 0) {
      void expireSessionForInactivity()
      return
    }

    sessionTimeoutTimer = setTimeout(() => {
      void expireSessionForInactivity()
    }, remaining)
  }

  function recordActivity() {
    if (!user.value) return
    setLastActivityTimestamp()
    scheduleSessionTimeoutCheck()
  }

  function handleStorageEvent(event: StorageEvent) {
    if (event.key === LAST_ACTIVITY_STORAGE_KEY && user.value) {
      scheduleSessionTimeoutCheck()
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && user.value) {
      scheduleSessionTimeoutCheck()
    }
  }

  function attachActivityListeners() {
    if (typeof window === 'undefined' || activityListenersAttached) return

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, recordActivity, { passive: true })
    }

    window.addEventListener('storage', handleStorageEvent)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    activityListenersAttached = true
  }

  function detachActivityListeners() {
    if (typeof window === 'undefined' || !activityListenersAttached) return

    for (const eventName of ACTIVITY_EVENTS) {
      window.removeEventListener(eventName, recordActivity)
    }

    window.removeEventListener('storage', handleStorageEvent)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    activityListenersAttached = false
  }

  function subscribeToSessionTimeoutSetting() {
    if (settingsChannel) return

    settingsChannel = supabase
      .channel('app-settings:session-timeout')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
          filter: `key=eq.${SESSION_TIMEOUT_SETTING_KEY}`,
        },
        async () => {
          await refreshSessionTimeoutSetting()
          scheduleSessionTimeoutCheck()
        },
      )
      .subscribe()
  }

  function unsubscribeFromSessionTimeoutSetting() {
    if (settingsChannel) {
      supabase.removeChannel(settingsChannel)
      settingsChannel = null
    }
  }

  async function startSessionTimeoutMonitoring(resetActivity = false) {
    if (!user.value) return

    attachActivityListeners()
    subscribeToSessionTimeoutSetting()

    if (resetActivity || typeof window !== 'undefined') {
      const hasStoredActivity =
        typeof window !== 'undefined' && window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY)

      if (resetActivity || !hasStoredActivity) {
        setLastActivityTimestamp()
      }
    }

    await refreshSessionTimeoutSetting()
    scheduleSessionTimeoutCheck()
  }

  function stopSessionTimeoutMonitoring() {
    clearSessionTimeoutTimer()
    detachActivityListeners()
    unsubscribeFromSessionTimeoutSetting()
  }

  /**
   * Initialize the store by checking the current Supabase session.
   * Only fetches from the API if the store hasn't been initialized yet.
   */
  async function initialize() {
    if (initialized.value) return
    loading.value = true

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        const { data: basicProfile } = await supabase
          .from('profiles')
          .select('role, status')
          .eq('id', session.user.id)
          .maybeSingle()

        const role = basicProfile?.role
        const isPrivileged =
          typeof role === 'string' &&
          MFA_REQUIRED_ROLES.includes(role as (typeof MFA_REQUIRED_ROLES)[number])

        let twoFactorRequired = false
        if (isPrivileged) {
          try {
            const { data: settingData } = await supabase
              .from('app_settings')
              .select('value')
              .eq('key', 'two_factor_required')
              .maybeSingle()
            twoFactorRequired = settingData?.value === 'true'
          } catch {
            twoFactorRequired = false
          }
        }

        if (twoFactorRequired) {
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
            await supabase.auth.signOut()
            return
          }
        }

        await fetchProfile(session.user.id, session.user.email)
      }
    } catch (error) {
      console.error('Error initializing user store:', error)
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  /**
   * Fetch user profile from Supabase and set it in the store.
   */
  async function fetchProfile(userId: string, email?: string | null) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      console.error('Error loading profile:', error)
      user.value = null
      return false
    }

    // Block deactivated users from being restored into an active session
    if (!profile.status) {
      await supabase.auth.signOut()
      user.value = null
      return false
    }

    user.value = {
      id: profile.id,
      f_name: profile.f_name,
      l_name: profile.l_name,
      email: email || '',
      role: profile.role,
      is_taskforce: profile.is_taskforce ?? false,
      department: profile.department,
      status: profile.status,
      avatar: profile.avatar,
    }

    subscribeToProfileChanges(profile.id)
    await startSessionTimeoutMonitoring()
    return true
  }

  /**
   * Set user data directly (e.g. after login).
   */
  function setUser(userData: User) {
    user.value = userData
    initialized.value = true
    subscribeToProfileChanges(userData.id)
    void startSessionTimeoutMonitoring(true)
  }

  /**
   * Update user data locally and persist to Supabase.
   */
  async function updateUser(updatedUser: User) {
    if (!user.value) return false

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          avatar: updatedUser.avatar,
          f_name: updatedUser.f_name,
          l_name: updatedUser.l_name,
        })
        .eq('id', updatedUser.id)

      if (!error) {
        user.value = updatedUser
        return true
      }
      return false
    } catch (error) {
      console.error('Error updating user:', error)
      return false
    }
  }

  async function uploadAvatar(file: File): Promise<string | null> {
    if (!user.value) return null

    const userId = user.value.id
    const ext = file.name.split('.').pop() ?? 'jpg'
    const filePath = `${userId}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      console.error('Error uploading avatar:', uploadError)
      return null
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
    const cleanUrl = data.publicUrl
    const avatarUrl = `${cleanUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar: cleanUrl })
      .eq('id', userId)

    if (updateError) {
      console.error('Error saving avatar URL to profile:', updateError)
      return null
    }

    user.value = { ...user.value, avatar: avatarUrl }
    return avatarUrl
  }

  /**
   * Sign out and clear all cached state.
   */
  async function logout(reason: string | null = null) {
    forcedLogoutReason.value = reason
    stopSessionTimeoutMonitoring()

    if (profileChannel) {
      supabase.removeChannel(profileChannel)
      profileChannel = null
    }

    await supabase.auth.signOut()
    user.value = null
    initialized.value = false
  }

  function subscribeToProfileChanges(userId: string) {
    if (profileChannel) {
      supabase.removeChannel(profileChannel)
    }
    profileChannel = supabase
      .channel(`profile-status:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        async (payload) => {
          if (payload.new.status === false) {
            await logout('deactivated')
          }
        },
      )
      .subscribe()
  }

  // Listen for Supabase auth state changes (e.g. token refresh, sign out from another tab)
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      stopSessionTimeoutMonitoring()
      user.value = null
      initialized.value = false
    }
  })

  return {
    user,
    loading,
    initialized,
    forcedLogoutReason,
    sessionTimeoutMinutes,
    isAuthenticated,
    fullName,
    isQuamsCoordinator,
    isDean,
    isAdmin,
    hasAdminAccess,
    hasValidationAccess,
    initialize,
    fetchProfile,
    setUser,
    updateUser,
    uploadAvatar,
    logout,
  }
})
