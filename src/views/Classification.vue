<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  FileText,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Download,
  Eye,
  XCircle,
} from 'lucide-vue-next'
import supabase from '@/lib/supabase'
import { useUserStore } from '@/stores/user'
import type { Document } from '@/types/document'

interface ProfileData {
  f_name: string
  l_name: string
}

interface DocumentWithProfile extends Document {
  profiles: ProfileData
}

interface DocumentWithUser extends Document {
  uploaded_by: string
}

const userStore = useUserStore()
const pendingDocs = ref<DocumentWithUser[]>([])
const loading = ref(false)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error' | 'info'>('info')

const viewDialog = ref(false)
const viewingDocument = ref<DocumentWithUser | null>(null)

const categories = [
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

const stats = computed(() => ({
  pending: pendingDocs.value.length,
  validated: validatedCount.value,
  rejected: rejectedCount.value,
}))

const validatedCount = ref(0)
const rejectedCount = ref(0)

onMounted(async () => {
  await fetchPendingDocuments()
  await fetchStats()
})

const fetchStats = async () => {
  try {
    // Get validated count
    const { count: approvedCount, error: approvedError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')

    if (approvedError) throw approvedError
    validatedCount.value = approvedCount || 0

    // Get rejected count
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
  } catch (error) {
    console.error('Error fetching documents:', error)
    showSnackbar('Failed to load documents', 'error')
  } finally {
    loading.value = false
  }
}

const handleValidate = async (docId: string, approved: boolean) => {
  try {
    const { error } = await supabase
      .from('documents')
      .update({ status: approved ? 'approved' : 'rejected' })
      .eq('id', docId)

    if (error) throw error

    pendingDocs.value = pendingDocs.value.filter((doc) => doc.id !== docId)
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

    // Update local state
    const doc = pendingDocs.value.find((d) => d.id === docId)
    if (doc) doc.primary_category = newCategory

    showSnackbar('Category updated successfully', 'success')
  } catch (error) {
    console.error('Error reclassifying:', error)
    showSnackbar('Failed to update category', 'error')
  }
}

const showSnackbar = (message: string, color: 'success' | 'error' | 'info') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

const viewExtractedText = (doc: DocumentWithUser) => {
  viewingDocument.value = doc
  viewDialog.value = true
}

const downloadDocument = async (doc: DocumentWithUser) => {
  try {
    const { data, error } = await supabase.storage.from('documents').download(doc.path)

    if (error) throw error

    // Create download link
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

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString()
}

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
</script>

<template>
  <div>
    <div class="mb-6">
      <h2 class="text-h5 text-grey-darken-3 mb-2 font-weight-medium">Classification Validation</h2>
      <p class="text-body-2 text-grey-darken-1">
        Review and validate AI-generated document classifications
      </p>
    </div>

    <!-- Access Restriction Alert -->
    <v-alert v-if="!canValidate" type="warning" variant="tonal" class="mb-6">
      <template #prepend>
        <AlertCircle :size="20" />
      </template>
      <div>
        <div class="text-subtitle-2 mb-1">Access Restricted</div>
        <div class="text-body-2">
          Only Dean, QuAMS Coordinator, Associate Dean, and Department Heads have validation
          authority.
        </div>
      </div>
    </v-alert>

    <!-- Stats -->
    <v-row class="mb-6">
      <v-col cols="12" md="4">
        <v-card>
          <v-card-text class="pa-6">
            <v-avatar color="yellow-lighten-4" size="48" class="mb-3">
              <FileText :size="24" class="text-yellow-darken-2" />
            </v-avatar>
            <div class="text-body-2 text-grey-darken-1 mb-1">Pending Validation</div>
            <div class="text-h5 text-yellow-darken-2 font-weight-bold">
              {{ stats.pending }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card>
          <v-card-text class="pa-6">
            <v-avatar color="green-lighten-4" size="48" class="mb-3">
              <CheckCircle :size="24" class="text-green-darken-2" />
            </v-avatar>
            <div class="text-body-2 text-grey-darken-1 mb-1">Validated</div>
            <div class="text-h5 text-green-darken-2 font-weight-bold">
              {{ stats.validated }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card>
          <v-card-text class="pa-6">
            <v-avatar color="red-lighten-4" size="48" class="mb-3">
              <XCircle :size="24" class="text-red-darken-2" />
            </v-avatar>
            <div class="text-body-2 text-grey-darken-1 mb-1">Rejected</div>
            <div class="text-h5 text-red-darken-2 font-weight-bold">
              {{ stats.rejected }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Pending Documents -->
    <v-card :loading="loading">
      <v-card-title class="pa-6">Documents Pending Validation</v-card-title>
      <v-divider />

      <div v-if="pendingDocs.length === 0 && !loading" class="pa-12 text-center">
        <v-avatar color="green-lighten-4" size="64" class="mb-4">
          <CheckCircle :size="32" class="text-green-darken-2" />
        </v-avatar>
        <div class="text-h6 text-grey-darken-3 mb-2">All documents checked</div>
        <div class="text-body-2 text-grey-darken-1">No pending classifications at this time</div>
      </div>

      <div
        v-for="doc in pendingDocs"
        :key="doc.id"
        class="pa-6 border-b"
        style="border-bottom: 1px solid rgb(224, 224, 224)"
      >
        <div class="d-flex align-start ga-4">
          <v-avatar color="yellow-lighten-4" size="56" rounded="lg">
            <FileText :size="28" class="text-yellow-darken-2" />
          </v-avatar>

          <div style="flex: 1">
            <div class="d-flex align-center justify-space-between mb-3">
              <h3 class="text-h6 text-grey-darken-3">{{ doc.file_name }}</h3>
              <div class="d-flex ga-2">
                <v-btn icon variant="text" size="small" @click="viewExtractedText(doc)">
                  <Eye :size="20" />
                </v-btn>
                <v-btn icon variant="text" size="small" @click="downloadDocument(doc)">
                  <Download :size="20" />
                </v-btn>
              </div>
            </div>

            <div class="d-flex ga-4 text-body-2 text-grey-darken-1 mb-4">
              <span>Uploaded by {{ doc.uploaded_by }}</span>
              <span>{{ formatDate(doc.created_at) }}</span>
            </div>

            <p class="text-body-2 text-grey-darken-2 mb-4">
              {{ getPreview(doc.extracted_text) }}
            </p>

            <!-- Classification Results -->
            <v-card color="grey-lighten-4" flat class="mb-4">
              <v-card-text class="pa-4">
                <div class="text-body-2 text-grey-darken-2 mb-3 font-weight-medium">
                  AI Classification Results:
                </div>

                <div class="d-flex flex-wrap ga-2">
                  <v-chip color="orange-darken-2" variant="flat" size="default">
                    {{ formatType(doc.primary_category) }}
                  </v-chip>
                  <v-chip
                    v-if="doc.secondary_category"
                    color="grey"
                    variant="outlined"
                    size="default"
                  >
                    {{ formatType(doc.secondary_category) }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>

            <!-- Tags -->
            <div v-if="doc.tags && doc.tags.length > 0" class="mb-4">
              <div class="text-caption text-grey-darken-2 mb-2">Suggested Tags:</div>
              <div class="d-flex flex-wrap ga-2">
                <v-chip v-for="tag in doc.tags" :key="tag" size="small" variant="outlined">
                  {{ tag }}
                </v-chip>
              </div>
            </div>

            <!-- Actions -->
            <div class="d-flex flex-wrap ga-3">
              <v-btn
                color="green-darken-1"
                prepend-icon="mdi-check-circle"
                class="text-none"
                @click="handleValidate(doc.id, true)"
              >
                <CheckCircle :size="18" class="mr-2" />
                Approve Classification
              </v-btn>

              <v-btn
                color="white"
                variant="outlined"
                class="text-none bg-red"
                @click="handleValidate(doc.id, false)"
              >
                <XCircle :size="18" class="mr-2" />
                Reject
              </v-btn>

              <v-select
                label="Reclassify as..."
                :items="categories"
                variant="outlined"
                density="comfortable"
                hide-details
                style="max-width: 200px"
                @update:model-value="(val) => val && handleReclassify(doc.id, val)"
              />
            </div>
          </div>
        </div>
      </div>
    </v-card>

    <!-- Snackbar -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" location="bottom right" :timeout="4000">
      {{ snackbarMessage }}
      <template #actions>
        <v-btn variant="text" @click="snackbar = false">Close</v-btn>
      </template>
    </v-snackbar>

    <!-- Extracted Text Dialog -->
    <v-dialog v-model="viewDialog" max-width="800px" scrollable>
      <v-card v-if="viewingDocument">
        <v-card-title class="pa-6 d-flex align-center justify-space-between">
          <span>{{ viewingDocument.file_name }}</span>
          <v-btn icon variant="text" @click="viewDialog = false">
            <XCircle :size="20" />
          </v-btn>
        </v-card-title>
        <v-divider />

        <v-alert type="warning" variant="tonal" class="ma-4">
          <div class="text-body-2">
            <strong>Notice:</strong> This text was extracted using OCR (Optical Character
            Recognition). The extraction may not be fully complete or entirely accurate due to image
            quality, formatting, or recognition limitations.
          </div>
        </v-alert>

        <v-card-text class="pa-6" style="max-height: 500px">
          <v-textarea
            :model-value="viewingDocument.extracted_text || 'No text extracted'"
            readonly
            variant="outlined"
            auto-grow
            rows="15"
            hide-details
            class="extracted-text-display"
          />
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="viewDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.border-b:last-child {
  border-bottom: none !important;
}

.extracted-text-display :deep(textarea) {
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
}
</style>
