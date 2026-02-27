import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import supabase from '@/lib/supabase'
import { useUserStore } from '@/stores/user'

export interface Notification {
  id: string
  created_at: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  link?: string
  metadata?: Record<string, unknown>
}

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([])
  const loading = ref(false)

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)

  const fetchNotifications = async () => {
    const userStore = useUserStore()
    if (!userStore.user) return

    loading.value = true
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userStore.user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      notifications.value = (data || []) as Notification[]
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      loading.value = false
    }
  }

  const markAsRead = async (id: string) => {
    const n = notifications.value.find((n) => n.id === id)
    if (!n || n.read) return

    n.read = true // optimistic update
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }

  const markAllAsRead = async () => {
    const userStore = useUserStore()
    if (!userStore.user) return

    notifications.value.forEach((n) => (n.read = true))
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userStore.user.id)
      .eq('read', false)
  }

  const deleteNotification = async (id: string) => {
    notifications.value = notifications.value.filter((n) => n.id !== id)
    await supabase.from('notifications').delete().eq('id', id)
  }

  // Realtime subscription
  const subscribeToNotifications = () => {
    const userStore = useUserStore()
    if (!userStore.user) return

    return supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userStore.user.id}`,
        },
        (payload) => {
          notifications.value.unshift(payload.new as Notification)
        },
      )
      .subscribe()
  }

  return {
    notifications,
    loading,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    subscribeToNotifications,
  }
})
