import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import supabase from '@/lib/supabase'
import type { Document } from '@/types/document'

// Module-level singleton — survives store re-instantiation and navigation
let channel: RealtimeChannel | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

interface ProfileData {
  f_name: string
  l_name: string
}

interface DocumentWithProfile extends Document {
  profiles: ProfileData
}

export interface RecentActivity {
  id: string
  action: string
  file: string
  user: string
  time: string
  status: 'processing' | 'completed' | 'validated' | 'rejected'
}

export interface CategoryStat {
  name: string
  count: number
  percentage: number
  color: string
}

const CATEGORY_COLORS = [
  'bg-orange-600',
  'bg-green-600',
  'bg-amber-600',
  'bg-blue-600',
  'bg-purple-600',
  'bg-red-600',
  'bg-teal-600',
  'bg-indigo-600',
]

const VUETIFY_COLORS = [
  'orange-darken-2',
  'green-darken-2',
  'amber-darken-2',
  'blue-darken-2',
  'purple-darken-2',
  'red-darken-2',
  'teal-darken-2',
  'indigo-darken-2',
]

export const useDashboardStore = defineStore('dashboard', () => {
  const totalDocs = ref(0)
  const classifiedDocs = ref(0)
  const approvedDocs = ref(0)
  const rejectedDocs = ref(0)
  const pendingDocs = ref(0)
  const thisMonthDocs = ref(0)
  const categoryDistribution = ref<CategoryStat[]>([])
  const recentActivity = ref<RecentActivity[]>([])
  const loading = ref(false)
  const initialized = ref(false)

  const stats = computed(() => [
    {
      label: 'Total Documents',
      value: totalDocs.value.toLocaleString(),
      icon: 'FileText',
      color: 'orange-darken-2',
    },
    {
      label: 'Classified',
      value: classifiedDocs.value.toLocaleString(),
      icon: 'CheckCircle',
      color: 'green-darken-2',
    },
    {
      label: 'Pending Review',
      value: pendingDocs.value.toLocaleString(),
      icon: 'Clock',
      color: 'yellow-darken-2',
    },
    {
      label: 'This Month (Total)',
      value: thisMonthDocs.value.toLocaleString(),
      icon: 'TrendingUp',
      color: 'amber-darken-2',
    },
  ])

  const approvalRate = computed(() =>
    classifiedDocs.value > 0 ? Math.round((approvedDocs.value / classifiedDocs.value) * 100) : 0,
  )

  const rejectionRate = computed(() =>
    classifiedDocs.value > 0 ? Math.round((rejectedDocs.value / classifiedDocs.value) * 100) : 0,
  )

  const timeAgo = (dateString: string): string => {
    const diff = Date.now() - new Date(dateString).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
    const days = Math.floor(hrs / 24)
    return `${days} day${days > 1 ? 's' : ''} ago`
  }

  const fetchStats = async () => {
    const now = new Date()
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

    const [totalRes, classifiedRes, approvedRes, rejectedRes, pendingRes, monthRes] =
      await Promise.all([
        supabase.from('documents').select('*', { count: 'exact', head: true }),
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .in('status', ['approved', 'rejected']),
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'approved'),
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'rejected'),
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startOfMonth.toISOString())
          .lt('created_at', startOfNextMonth.toISOString()),
      ])

    totalDocs.value = totalRes.count || 0
    classifiedDocs.value = classifiedRes.count || 0
    approvedDocs.value = approvedRes.count || 0
    rejectedDocs.value = rejectedRes.count || 0
    pendingDocs.value = pendingRes.count || 0
    thisMonthDocs.value = monthRes.count || 0
  }

  const fetchCategoryDistribution = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('primary_category')
      .in('status', ['approved', 'rejected'])
      .not('primary_category', 'is', null)

    if (error || !data) return

    const countMap = new Map<string, number>()
    data.forEach(({ primary_category }) => {
      if (primary_category) {
        countMap.set(primary_category, (countMap.get(primary_category) || 0) + 1)
      }
    })

    const total = data.length || 1
    const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

    categoryDistribution.value = sorted.map(([name, count], i) => ({
      name,
      count,
      percentage: Math.round((count / total) * 100),
      color: VUETIFY_COLORS[i % VUETIFY_COLORS.length] ?? 'grey-darken-2',
    }))
  }

  const fetchRecentActivity = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select(
        `
        id, file_name, status, created_at, updated_at,
        profiles!documents_user_id_fkey(f_name, l_name)
      `,
      )
      .order('updated_at', { ascending: false })
      .limit(6)

    if (error || !data) return

    recentActivity.value = (data as unknown as DocumentWithProfile[]).map((doc) => {
      const userName = doc.profiles
        ? `${doc.profiles.f_name} ${doc.profiles.l_name}`
        : 'Unknown User'

      let action = 'Document uploaded'
      let status: RecentActivity['status'] = 'processing'

      if (doc.status === 'approved') {
        action = 'Document approved'
        status = 'validated'
      } else if (doc.status === 'rejected') {
        action = 'Document rejected'
        status = 'rejected'
      } else if (doc.status === 'pending') {
        action = 'Pending classification'
        status = 'processing'
      }

      return {
        id: doc.id,
        action,
        file: doc.file_name,
        user: userName,
        time: timeAgo(doc.updated_at ?? doc.created_at),
        status,
      }
    })
  }

  const initialize = async () => {
    loading.value = true
    try {
      await Promise.all([fetchStats(), fetchCategoryDistribution(), fetchRecentActivity()])
      initialized.value = true
    } catch (e) {
      console.error('Dashboard init error:', e)
    } finally {
      loading.value = false
    }
  }

  const refresh = async () => {
    await Promise.all([fetchStats(), fetchCategoryDistribution(), fetchRecentActivity()])
  }

  // Debounced refresh — collapses rapid realtime events into a single fetch
  const debouncedRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refresh()
      refreshTimer = null
    }, 500)
  }

  const subscribe = () => {
    if (channel) return
    channel = supabase
      .channel('dashboard-documents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        debouncedRefresh()
      })
      .subscribe()
  }

  const unsubscribe = async () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    if (channel) {
      try {
        await channel.unsubscribe()
        await supabase.removeChannel(channel)
      } catch {
        // ignore teardown errors — channel may already be closed
      } finally {
        channel = null
      }
    }
  }

  return {
    totalDocs,
    classifiedDocs,
    approvedDocs,
    rejectedDocs,
    pendingDocs,
    thisMonthDocs,
    categoryDistribution,
    recentActivity,
    loading,
    initialized,
    stats,
    approvalRate,
    rejectionRate,
    initialize,
    subscribe,
    unsubscribe,
  }
})
