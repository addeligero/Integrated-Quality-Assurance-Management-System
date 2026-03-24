import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import supabase from '@/lib/supabase'
import type { Document } from '@/types/document'

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

export const useRepositoryStore = defineStore('repository', () => {
  const docs = ref<DocumentWithUser[]>([])
  const loading = ref(false)
  const initialized = ref(false)

  const searchQuery = ref('')
  const selectedCategory = ref('all')
  const searchType = ref<'filename' | 'semantic'>('semantic')
  const sortBy = ref('recent')

  const snackbar = ref(false)
  const snackbarMessage = ref('')
  const snackbarColor = ref<'success' | 'error' | 'info'>('info')

  const viewDialog = ref(false)
  const viewingDocument = ref<DocumentWithUser | null>(null)
  const viewerUrl = ref<string | null>(null)
  const viewerLoading = ref(false)

  const categories = computed(() => {
    const allCategories = [{ value: 'all', label: 'All Categories', count: docs.value.length }]

    const categoryCountMap = new Map<string, number>()
    docs.value.forEach((doc) => {
      if (doc.primary_category) {
        const current = categoryCountMap.get(doc.primary_category) || 0
        categoryCountMap.set(doc.primary_category, current + 1)
      }
    })

    categoryCountMap.forEach((count, category) => {
      allCategories.push({ value: category.toLowerCase(), label: category, count })
    })

    return allCategories
  })

  const filteredDocuments = computed(() => {
    let result = docs.value

    if (selectedCategory.value !== 'all') {
      result = result.filter(
        (doc) => doc.primary_category?.toLowerCase() === selectedCategory.value,
      )
    }

    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter((doc) => {
        if (searchType.value === 'filename') {
          return doc.file_name.toLowerCase().includes(query)
        }
        const tagsMatch = doc.tags?.some((tag) => tag.toLowerCase().includes(query))
        const categoryMatch =
          doc.primary_category?.toLowerCase().includes(query) ||
          doc.secondary_category?.toLowerCase().includes(query)
        const textMatch = doc.extracted_text?.toLowerCase().includes(query)
        return (
          tagsMatch || categoryMatch || textMatch || doc.file_name.toLowerCase().includes(query)
        )
      })
    }

    const sorted = [...result]
    switch (sortBy.value) {
      case 'recent':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case 'title':
        sorted.sort((a, b) => a.file_name.localeCompare(b.file_name))
        break
      case 'category':
        sorted.sort((a, b) => (a.primary_category || '').localeCompare(b.primary_category || ''))
        break
    }

    return sorted
  })

  const showSnackbar = (message: string, color: 'success' | 'error' | 'info') => {
    snackbarMessage.value = message
    snackbarColor.value = color
    snackbar.value = true
  }

  const fetchDocuments = async () => {
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
        .eq('status', 'approved')
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

  const refresh = async () => {
    await fetchDocuments()
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
      .channel('repository-documents')
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
        .createSignedUrl(doc.path, 120)

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

  return {
    docs,
    loading,
    initialized,
    searchQuery,
    selectedCategory,
    searchType,
    sortBy,
    snackbar,
    snackbarMessage,
    snackbarColor,
    viewDialog,
    viewingDocument,
    viewerUrl,
    viewerLoading,
    categories,
    filteredDocuments,
    fetchDocuments,
    refresh,
    subscribe,
    unsubscribe,
    downloadDocument,
    deleteDocument,
    openViewer,
    showSnackbar,
    formatDate,
  }
})
