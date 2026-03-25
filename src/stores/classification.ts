import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import supabase from '@/lib/supabase'
import type { Document, DocumentStatus } from '@/types/document'

let channel: RealtimeChannel | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

interface ProfileData {
  f_name: string
  l_name: string
}

interface DocumentWithProfile extends Document {
  profiles: ProfileData
}

export interface DocumentWithUser extends Document {
  uploaded_by: string
}

export const useClassificationStore = defineStore('classification', () => {
  const docs = ref<DocumentWithUser[]>([])
  const categories = ref<string[]>([])
  const selectedStatus = ref<DocumentStatus>('pending')
  const loading = ref(false)
  const initialized = ref(false)
  const validatedCount = ref(0)
  const rejectedCount = ref(0)
  const pendingCount = ref(0)

  const snackbar = ref(false)
  const snackbarMessage = ref('')
  const snackbarColor = ref<'success' | 'error' | 'info'>('info')

  const viewDialog = ref(false)
  const viewingDocument = ref<DocumentWithUser | null>(null)
  const viewerUrl = ref<string | null>(null)
  const viewerLoading = ref(false)

  const stats = computed(() => ({
    pending: pendingCount.value,
    validated: validatedCount.value,
    rejected: rejectedCount.value,
  }))

  const showSnackbar = (message: string, color: 'success' | 'error' | 'info') => {
    snackbarMessage.value = message
    snackbarColor.value = color
    snackbar.value = true
  }

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('compliance_categories')
        .select('name')
        .order('id', { ascending: true })

      if (error) throw error

      categories.value = (data ?? [])
        .map((row) => String(row.name ?? '').trim())
        .filter((name) => name.length > 0)
    } catch (error) {
      console.error('Error fetching categories:', error)
      categories.value = []
      showSnackbar('Failed to load category list', 'error')
    }
  }

  const fetchStats = async () => {
    try {
      const { count: pendingDocCount, error: pendingError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')

      if (pendingError) throw pendingError
      pendingCount.value = pendingDocCount || 0

      const { count: approvedCount, error: approvedError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')

      if (approvedError) throw approvedError
      validatedCount.value = approvedCount || 0

      const { count: rejectedDocCount, error: rejectedError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'rejected')

      if (rejectedError) throw rejectedError
      rejectedCount.value = rejectedDocCount || 0
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const fetchDocumentsByStatus = async (status: DocumentStatus = selectedStatus.value) => {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('documents')
        .select(
          `
          *,
          profiles!documents_user_id_fkey(f_name, l_name)
        `,
        )
        .eq('status', status)
        .order('created_at', { ascending: false })

      if (error) throw error

      docs.value = ((data || []) as DocumentWithProfile[]).map((doc) => {
        const { profiles, ...docData } = doc
        return {
          ...docData,
          uploaded_by: profiles ? `${profiles.f_name} ${profiles.l_name}` : 'Unknown User',
        } as DocumentWithUser
      })

      initialized.value = true
    } catch (error) {
      console.error('Error fetching documents:', error)
      showSnackbar('Failed to load documents', 'error')
    } finally {
      loading.value = false
    }
  }

  const setSelectedStatus = async (status: DocumentStatus) => {
    if (selectedStatus.value === status) return
    selectedStatus.value = status
    await fetchDocumentsByStatus(status)
  }

  const initialize = async () => {
    await Promise.all([
      fetchDocumentsByStatus(selectedStatus.value),
      fetchStats(),
      fetchCategories(),
    ])
  }

  const refresh = async () => {
    await Promise.all([fetchDocumentsByStatus(selectedStatus.value), fetchStats()])
  }

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
      .channel('classification-documents')
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
        // no-op
      } finally {
        channel = null
      }
    }
  }

  const handleValidate = async (docId: string, approved: boolean) => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({ status: approved ? 'approved' : 'rejected' })
        .eq('id', docId)
        .select('id')
        .single()

      if (error) throw error
      if (!data) throw new Error('Update did not affect any rows — check RLS policies')

      docs.value = docs.value.filter((doc) => doc.id !== docId)
      await fetchStats()

      showSnackbar(`Document ${approved ? 'approved' : 'rejected'} successfully`, 'success')
    } catch (error) {
      console.error('Error validating document:', error)
      showSnackbar('Failed to update document status', 'error')
    }
  }

  const handleReclassify = async (docId: string, newCategory: string) => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ primary_category: newCategory })
        .eq('id', docId)

      if (error) throw error

      const doc = docs.value.find((d) => d.id === docId)
      if (doc) doc.primary_category = newCategory

      showSnackbar('Category updated successfully', 'success')
    } catch (error) {
      console.error('Error reclassifying:', error)
      showSnackbar('Failed to update category', 'error')
    }
  }

  const downloadDocument = async (doc: DocumentWithUser) => {
    try {
      const { data, error } = await supabase.storage.from('documents').download(doc.path)
      if (error) throw error

      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = doc.file_name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      showSnackbar('File downloaded successfully', 'success')
    } catch (error) {
      console.error('Error downloading file:', error)
      showSnackbar('Failed to download file', 'error')
    }
  }

  const deleteDocument = async (doc: DocumentWithUser) => {
    try {
      const { error: storageError } = await supabase.storage.from('documents').remove([doc.path])
      if (storageError) throw storageError

      const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id)
      if (deleteError) throw deleteError

      docs.value = docs.value.filter((d) => d.id !== doc.id)

      if (viewingDocument.value?.id === doc.id) {
        viewDialog.value = false
        viewingDocument.value = null
        viewerUrl.value = null
      }

      await fetchStats()
      showSnackbar('Document deleted successfully', 'success')
    } catch (error) {
      console.error('Error deleting document:', error)
      showSnackbar('Failed to delete document', 'error')
    }
  }

  const openViewer = async (doc: DocumentWithUser) => {
    viewingDocument.value = doc
    viewerUrl.value = null
    viewerLoading.value = true
    viewDialog.value = true

    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.path, 120) // 2-minute expiry

      if (error) throw error
      viewerUrl.value = data.signedUrl
    } catch (error) {
      console.error('Error generating signed URL:', error)
      showSnackbar('Failed to load document preview', 'error')
    } finally {
      viewerLoading.value = false
    }
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString()

  const formatType = (type: string | null) => {
    if (!type) return 'N/A'
    return type
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const getPreview = (text: string | null) => {
    if (!text) return 'No text extracted'
    return text.slice(0, 150) + (text.length > 150 ? '...' : '')
  }

  return {
    docs,
    categories,
    selectedStatus,
    loading,
    initialized,
    validatedCount,
    rejectedCount,
    snackbar,
    snackbarMessage,
    snackbarColor,
    viewDialog,
    viewingDocument,
    viewerUrl,
    viewerLoading,
    stats,
    initialize,
    refresh,
    setSelectedStatus,
    subscribe,
    unsubscribe,
    handleValidate,
    handleReclassify,
    downloadDocument,
    deleteDocument,
    openViewer,
    showSnackbar,
    formatDate,
    formatType,
    getPreview,
  }
})
