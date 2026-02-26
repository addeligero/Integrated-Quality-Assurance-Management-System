import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import supabase from '@/lib/supabase'
import type { Document } from '@/types/document'

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

export const CATEGORIES = [
  'VMGO',
  'PEO',
  'PO',
  'Faculty',
  'Curriculum',
  'Instruction',
  'Students',
  'Research',
  'Extension',
  'Library',
  'Facilities',
  'Laboratories',
  'Administration',
  'Institutional Support',
  'Strategic Planning',
  'Special Orders',
  'DPCR',
  'IPCR',
  'Budget',
  'Activity Report',
  'Memorandum',
  'Minutes of Meeting',
  'Transmittal Letter',
  'Documentation',
  'Best Practice',
  'Audit',
  'Client Satisfactory',
  'Quality Objectives',
  'Risk Registers',
  'Trainings',
  'PES',
  'Faculty Advising',
  'Faculty Consultation',
  'Class Interventions',
  'Student Internship',
  'Approved Leave',
  'Daily Time Records (DTR)',
  'Faculty Fellowship Contracts',
  'Notarized Contracts',
  'Terms of Reference (TOR)',
  'Institutional Records',
  'Quality Assurance',
]

export const useClassificationStore = defineStore('classification', () => {
  const pendingDocs = ref<DocumentWithUser[]>([])
  const loading = ref(false)
  const initialized = ref(false)
  const validatedCount = ref(0)
  const rejectedCount = ref(0)

  const snackbar = ref(false)
  const snackbarMessage = ref('')
  const snackbarColor = ref<'success' | 'error' | 'info'>('info')

  const viewDialog = ref(false)
  const viewingDocument = ref<DocumentWithUser | null>(null)

  const stats = computed(() => ({
    pending: pendingDocs.value.length,
    validated: validatedCount.value,
    rejected: rejectedCount.value,
  }))

  const showSnackbar = (message: string, color: 'success' | 'error' | 'info') => {
    snackbarMessage.value = message
    snackbarColor.value = color
    snackbar.value = true
  }

  const fetchStats = async () => {
    try {
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

  const fetchPendingDocuments = async () => {
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
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error

      pendingDocs.value = ((data || []) as DocumentWithProfile[]).map((doc) => {
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

  const initialize = async () => {
    await Promise.all([fetchPendingDocuments(), fetchStats()])
  }

  const handleValidate = async (docId: string, approved: boolean) => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ status: approved ? 'approved' : 'rejected' })
        .eq('id', docId)

      if (error) throw error

      pendingDocs.value = pendingDocs.value.filter((doc) => doc.id !== docId)

      if (approved) validatedCount.value++
      else rejectedCount.value++

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

      const doc = pendingDocs.value.find((d) => d.id === docId)
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

  const openViewer = (doc: DocumentWithUser) => {
    viewingDocument.value = doc
    viewDialog.value = true
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
    pendingDocs,
    loading,
    initialized,
    validatedCount,
    rejectedCount,
    snackbar,
    snackbarMessage,
    snackbarColor,
    viewDialog,
    viewingDocument,
    stats,
    initialize,
    handleValidate,
    handleReclassify,
    downloadDocument,
    openViewer,
    showSnackbar,
    formatDate,
    formatType,
    getPreview,
  }
})
