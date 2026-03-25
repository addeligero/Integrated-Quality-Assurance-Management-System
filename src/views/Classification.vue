<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { FileText, CheckCircle, AlertCircle, Download, Eye, XCircle, Trash2 } from 'lucide-vue-next'
import { useClassificationStore, type DocumentWithUser } from '@/stores/classification'

const store = useClassificationStore()
const {
  docs,
  loading,
  snackbar,
  snackbarMessage,
  snackbarColor,
  viewDialog,
  viewingDocument,
  viewerUrl,
  viewerLoading,
  categories,
  stats,
  selectedStatus,
} = storeToRefs(store)

onMounted(async () => {
  await store.initialize()
  store.subscribe()
})

onUnmounted(() => {
  store.unsubscribe()
})

const iframeViewerSrc = computed(() => {
  if (!viewerUrl.value || !viewingDocument.value) return undefined
  if (/\.(docx?|pptx?|xlsx?)$/i.test(viewingDocument.value.file_name)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewerUrl.value)}`
  }
  return viewerUrl.value
})

const validateConfirmDialog = ref(false)
const validateConfirmLoading = ref(false)
const validateConfirmTarget = ref<{ id: string; fileName: string; approve: boolean } | null>(null)

const requestValidationAction = (id: string, fileName: string, approve: boolean) => {
  validateConfirmTarget.value = { id, fileName, approve }
  validateConfirmDialog.value = true
}

const handleConfirmValidationAction = async () => {
  if (!validateConfirmTarget.value) return

  validateConfirmLoading.value = true
  try {
    await store.handleValidate(validateConfirmTarget.value.id, validateConfirmTarget.value.approve)
    validateConfirmDialog.value = false
    validateConfirmTarget.value = null
  } finally {
    validateConfirmLoading.value = false
  }
}

const statusTitle = computed(() => {
  if (selectedStatus.value === 'approved') return 'Validated Documents'
  if (selectedStatus.value === 'rejected') return 'Rejected Documents'
  return 'Documents Pending Validation'
})

const deleteConfirmDialog = ref(false)
const deleteConfirmLoading = ref(false)
const deleteConfirmTarget = ref<DocumentWithUser | null>(null)

const requestDeleteDocument = (doc: DocumentWithUser) => {
  deleteConfirmTarget.value = doc
  deleteConfirmDialog.value = true
}

const handleConfirmDeleteDocument = async () => {
  if (!deleteConfirmTarget.value) return

  deleteConfirmLoading.value = true
  try {
    await store.deleteDocument(deleteConfirmTarget.value)
    deleteConfirmDialog.value = false
    deleteConfirmTarget.value = null
  } finally {
    deleteConfirmLoading.value = false
  }
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
    <v-alert type="warning" variant="tonal" class="mb-6">
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
        <v-card
          class="status-card"
          :class="{ 'status-card-active': selectedStatus === 'pending' }"
          @click="store.setSelectedStatus('pending')"
        >
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
        <v-card
          class="status-card"
          :class="{ 'status-card-active': selectedStatus === 'approved' }"
          @click="store.setSelectedStatus('approved')"
        >
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
        <v-card
          class="status-card"
          :class="{ 'status-card-active': selectedStatus === 'rejected' }"
          @click="store.setSelectedStatus('rejected')"
        >
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
      <v-card-title class="pa-6">{{ statusTitle }}</v-card-title>
      <v-divider />

      <div v-if="docs.length === 0 && !loading" class="pa-12 text-center">
        <v-avatar color="green-lighten-4" size="64" class="mb-4">
          <CheckCircle :size="32" class="text-green-darken-2" />
        </v-avatar>
        <div class="text-h6 text-grey-darken-3 mb-2">No documents in this status</div>
        <div class="text-body-2 text-grey-darken-1">Try switching to another status card</div>
      </div>

      <div
        v-for="doc in docs"
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
                <v-btn icon variant="text" size="small" @click="store.openViewer(doc)">
                  <Eye :size="20" />
                </v-btn>
                <v-btn icon variant="text" size="small" @click="store.downloadDocument(doc)">
                  <Download :size="20" />
                </v-btn>
                <v-btn
                  icon
                  variant="text"
                  size="small"
                  color="red-darken-1"
                  @click="requestDeleteDocument(doc)"
                >
                  <Trash2 :size="20" />
                </v-btn>
              </div>
            </div>

            <div class="d-flex ga-4 text-body-2 text-grey-darken-1 mb-4">
              <span>Uploaded by {{ doc.uploaded_by }}</span>
              <span>{{ store.formatDate(doc.created_at) }}</span>
            </div>

            <p class="text-body-2 text-grey-darken-2 mb-4">
              {{ store.getPreview(doc.extracted_text) }}
            </p>

            <!-- Classification Results -->
            <v-card color="grey-lighten-4" flat class="mb-4">
              <v-card-text class="pa-4">
                <div class="text-body-2 text-grey-darken-2 mb-3 font-weight-medium">
                  AI Classification Results:
                </div>

                <div class="d-flex flex-wrap ga-2">
                  <v-chip color="orange-darken-2" variant="flat" size="default">
                    {{ store.formatType(doc.primary_category) }}
                  </v-chip>
                  <v-chip
                    v-if="doc.secondary_category"
                    color="grey"
                    variant="outlined"
                    size="default"
                  >
                    {{ store.formatType(doc.secondary_category) }}
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
                v-if="selectedStatus === 'pending'"
                color="green-darken-1"
                prepend-icon="mdi-check-circle"
                class="text-none"
                @click="requestValidationAction(doc.id, doc.file_name, true)"
              >
                <CheckCircle :size="18" class="mr-2" />
                Approve Classification
              </v-btn>

              <v-btn
                v-if="selectedStatus === 'pending'"
                color="white"
                variant="outlined"
                class="text-none bg-red"
                @click="requestValidationAction(doc.id, doc.file_name, false)"
              >
                <XCircle :size="18" class="mr-2" />
                Reject
              </v-btn>

              <v-select
                v-if="selectedStatus === 'pending'"
                label="Reclassify as..."
                :items="categories"
                variant="outlined"
                density="comfortable"
                hide-details
                style="max-width: 200px"
                @update:model-value="(val) => val && store.handleReclassify(doc.id, val)"
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

    <!-- Approve/Reject Confirmation Dialog -->
    <v-dialog v-model="validateConfirmDialog" max-width="420" rounded="xl">
      <v-card v-if="validateConfirmTarget" rounded="xl" class="pa-6">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-2">
          {{ validateConfirmTarget.approve ? 'Approve Document' : 'Reject Document' }}
        </v-card-title>
        <p class="text-body-2 text-grey-darken-2 mb-5">
          Are you sure you want to
          {{ validateConfirmTarget.approve ? 'approve' : 'reject' }}
          <strong>{{ validateConfirmTarget.fileName }}</strong
          >?
        </p>
        <v-card-actions class="pa-0 ga-3">
          <v-spacer />
          <v-btn
            variant="text"
            rounded="lg"
            class="text-none"
            :disabled="validateConfirmLoading"
            @click="validateConfirmDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            :color="validateConfirmTarget.approve ? 'success' : 'error'"
            rounded="lg"
            class="text-none"
            elevation="1"
            :loading="validateConfirmLoading"
            @click="handleConfirmValidationAction"
          >
            {{ validateConfirmTarget.approve ? 'Approve' : 'Reject' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Document Viewer Dialog -->
    <v-dialog v-model="viewDialog" max-width="900px" scrollable>
      <v-card v-if="viewingDocument">
        <v-card-title class="pa-6 d-flex align-center justify-space-between">
          <span class="text-truncate" style="max-width: 700px">{{
            viewingDocument.file_name
          }}</span>
          <v-btn icon variant="text" @click="viewDialog = false">
            <XCircle :size="20" />
          </v-btn>
        </v-card-title>
        <v-divider />

        <v-card-text class="pa-0" style="height: 70vh">
          <!-- Loading state -->
          <div v-if="viewerLoading" class="d-flex align-center justify-center fill-height">
            <v-progress-circular indeterminate color="orange-darken-2" size="48" />
          </div>

          <!-- Failed state -->
          <div v-else-if="!viewerUrl" class="d-flex align-center justify-center fill-height">
            <div class="text-center text-grey-darken-1">
              <AlertCircle :size="40" class="mb-3" />
              <div>Could not load document preview.</div>
            </div>
          </div>

          <!-- Image viewer -->
          <v-img
            v-else-if="/\.(png|jpe?g|gif|webp)$/i.test(viewingDocument.file_name)"
            :src="viewerUrl"
            contain
            height="100%"
          />

          <!-- PDF / Office / other viewer -->
          <iframe
            v-else
            :src="iframeViewerSrc"
            width="100%"
            height="100%"
            style="border: none"
            title="Document preview"
          />
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="store.downloadDocument(viewingDocument)">Download</v-btn>
          <v-btn color="error" variant="text" @click="requestDeleteDocument(viewingDocument)">
            Delete
          </v-btn>
          <v-btn variant="text" @click="viewDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteConfirmDialog" max-width="420" rounded="xl">
      <v-card v-if="deleteConfirmTarget" rounded="xl" class="pa-6">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-2">
          Delete Document
        </v-card-title>
        <p class="text-body-2 text-grey-darken-2 mb-5">
          Are you sure you want to delete
          <strong>{{ deleteConfirmTarget.file_name }}</strong
          >? This action cannot be undone.
        </p>
        <v-card-actions class="pa-0 ga-3">
          <v-spacer />
          <v-btn
            variant="text"
            rounded="lg"
            class="text-none"
            :disabled="deleteConfirmLoading"
            @click="deleteConfirmDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="error"
            rounded="lg"
            class="text-none"
            elevation="1"
            :loading="deleteConfirmLoading"
            @click="handleConfirmDeleteDocument"
          >
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.border-b:last-child {
  border-bottom: none !important;
}

.status-card {
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.status-card:hover {
  transform: translateY(-2px);
}

.status-card-active {
  box-shadow: 0 0 0 2px rgb(255, 183, 77) inset;
}

.extracted-text-display :deep(textarea) {
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
}
</style>
