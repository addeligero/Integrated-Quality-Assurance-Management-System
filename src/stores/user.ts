import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/user'
import supabase from '@/lib/supabase'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const initialized = ref(false)
  const forcedLogoutReason = ref<string | null>(null)
  let profileChannel: ReturnType<typeof supabase.channel> | null = null

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
        // If the user has enrolled MFA but hasn't verified this session, force a fresh login.
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
          await supabase.auth.signOut()
        } else {
          await fetchProfile(session.user.id, session.user.email)
        }
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
      department: profile.department,
      status: profile.status,
      avatar: profile.avatar,
    }

    subscribeToProfileChanges(profile.id)
    return true
  }

  /**
   * Set user data directly (e.g. after login).
   */
  function setUser(userData: User) {
    user.value = userData
    initialized.value = true
    subscribeToProfileChanges(userData.id)
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
  async function logout() {
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
            forcedLogoutReason.value = 'deactivated'
            await logout()
          }
        },
      )
      .subscribe()
  }

  // Listen for Supabase auth state changes (e.g. token refresh, sign out from another tab)
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      user.value = null
      initialized.value = false
    }
  })

  return {
    user,
    loading,
    initialized,
    forcedLogoutReason,
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
