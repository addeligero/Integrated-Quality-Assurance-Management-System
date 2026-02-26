<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { FileText, CheckCircle, AlertCircle, Download, Eye, XCircle } from 'lucide-vue-next'
import { useClassificationStore, CATEGORIES } from '@/stores/classification'

const store = useClassificationStore()
const {
  pendingDocs,
  loading,
  initialized,
  snackbar,
  snackbarMessage,
  snackbarColor,
  viewDialog,
  viewingDocument,
  stats,
} = storeToRefs(store)

onMounted(() => {
  if (!initialized.value) {
    store.initialize()
  }
})
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
                <v-btn icon variant="text" size="small" @click="store.openViewer(doc)">
                  <Eye :size="20" />
                </v-btn>
                <v-btn icon variant="text" size="small" @click="store.downloadDocument(doc)">
                  <Download :size="20" />
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
                color="green-darken-1"
                prepend-icon="mdi-check-circle"
                class="text-none"
                @click="store.handleValidate(doc.id, true)"
              >
                <CheckCircle :size="18" class="mr-2" />
                Approve Classification
              </v-btn>

              <v-btn
                color="white"
                variant="outlined"
                class="text-none bg-red"
                @click="store.handleValidate(doc.id, false)"
              >
                <XCircle :size="18" class="mr-2" />
                Reject
              </v-btn>

              <v-select
                label="Reclassify as..."
                :items="CATEGORIES"
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
