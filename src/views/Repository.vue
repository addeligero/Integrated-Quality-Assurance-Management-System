<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { Search, Filter, FileText, Download, Eye, Calendar, Tag, TrendingUp } from 'lucide-vue-next'
import { useRepositoryStore } from '@/stores/repository'

const store = useRepositoryStore()
const {
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
  categories,
  filteredDocuments,
} = storeToRefs(store)

onMounted(() => {
  // Only fetch on first visit; keep data on subsequent navigation
  if (!initialized.value) {
    store.fetchDocuments()
  }
})
</script>

<template>
  <div>
    <div class="mb-6">
      <h2 class="text-h5 text-grey-darken-3 mb-2 font-weight-medium">Document Repository</h2>
      <p class="text-body-2 text-grey-darken-1">
        Search and retrieve documents with semantic intelligence
      </p>
    </div>

    <!-- Search and Filter Card -->
    <v-card class="mb-6" elevation="1">
      <v-card-text class="pa-6">
        <div class="d-flex flex-column flex-lg-row ga-4">
          <!-- Search Input -->
          <div class="flex-grow-1">
            <v-text-field
              v-model="searchQuery"
              variant="outlined"
              placeholder="Search by filename, topic, or semantic content..."
              density="comfortable"
              hide-details
            >
              <template #prepend-inner>
                <Search :size="20" class="text-grey" />
              </template>
            </v-text-field>
          </div>

          <!-- Search Type and Filter -->
          <div class="d-flex ga-3">
            <v-select
              v-model="searchType"
              :items="[
                { value: 'semantic', title: 'Semantic Search' },
                { value: 'filename', title: 'Filename Search' },
              ]"
              variant="outlined"
              density="comfortable"
              hide-details
              style="min-width: 180px"
            />

            <v-btn variant="outlined" color="grey-darken-1" size="large">
              <template #prepend>
                <Filter :size="20" />
              </template>
              Filters
            </v-btn>
          </div>
        </div>

        <!-- Category Tabs -->
        <div class="d-flex ga-2 mt-4" style="overflow-x: auto">
          <v-btn
            v-for="cat in categories"
            :key="cat.value"
            :color="selectedCategory === cat.value ? 'orange-darken-1' : 'grey-lighten-2'"
            :variant="selectedCategory === cat.value ? 'flat' : 'flat'"
            size="small"
            @click="selectedCategory = cat.value"
            class="text-none"
          >
            {{ cat.label }} ({{ cat.count }})
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Search Type Info -->
    <v-alert type="info" variant="tonal" color="orange-darken-1" class="mb-6" density="comfortable">
      <template #prepend>
        <TrendingUp :size="20" />
      </template>
      <div>
        <div class="font-weight-medium mb-1">
          {{ searchType === 'semantic' ? 'Semantic Search Active' : 'Filename Search Active' }}
        </div>
        <div class="text-body-2">
          {{
            searchType === 'semantic'
              ? 'Search uses intelligent topic modeling to find relevant documents based on meaning and context, not just keywords.'
              : 'Search matches exact filenames and basic metadata fields.'
          }}
        </div>
      </div>
    </v-alert>

    <!-- Document List Card -->
    <v-card elevation="1">
      <v-card-text class="pa-6">
        <div class="d-flex align-center justify-space-between mb-4">
          <h3 class="text-h6 text-grey-darken-3">
            {{ filteredDocuments.length }} Document{{ filteredDocuments.length !== 1 ? 's' : '' }}
            Found
          </h3>
          <div class="d-flex align-center ga-2">
            <span class="text-grey-darken-1">Sort by:</span>
            <v-select
              v-model="sortBy"
              :items="[
                { value: 'recent', title: 'Most Recent' },
                { value: 'title', title: 'Title A-Z' },
                { value: 'category', title: 'Category' },
              ]"
              variant="outlined"
              density="compact"
              hide-details
              style="min-width: 150px"
            />
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <v-progress-circular indeterminate color="orange-darken-1" />
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredDocuments.length === 0" class="text-center py-8">
          <FileText :size="48" class="text-grey mb-4" />
          <p class="text-grey-darken-1">No documents found</p>
        </div>

        <!-- Document List -->
        <div v-else class="d-flex flex-column ga-4">
          <v-card
            v-for="doc in filteredDocuments"
            :key="doc.id"
            variant="outlined"
            class="pa-4"
            hover
          >
            <div class="d-flex ga-4">
              <!-- File Icon -->
              <div class="bg-orange-lighten-4 pa-3 rounded" style="height: fit-content">
                <FileText :size="24" class="text-orange-darken-1" />
              </div>

              <!-- Document Info -->
              <div class="flex-grow-1">
                <div class="d-flex align-start justify-space-between mb-2">
                  <div>
                    <h4 class="text-subtitle-1 text-grey-darken-3 mb-1">{{ doc.file_name }}</h4>
                    <div class="d-flex align-center ga-4 text-body-2 text-grey-darken-1">
                      <span class="d-flex align-center ga-1">
                        <Calendar :size="16" />
                        {{ store.formatDate(doc.created_at) }}
                      </span>
                      <span>by {{ doc.uploaded_by }}</span>
                    </div>
                  </div>

                  <!-- Action Buttons -->
                  <div class="d-flex ga-2">
                    <v-btn
                      icon
                      variant="text"
                      color="grey-darken-1"
                      size="small"
                      @click="store.openViewer(doc)"
                    >
                      <Eye :size="20" />
                    </v-btn>
                    <v-btn
                      icon
                      variant="text"
                      color="grey-darken-1"
                      size="small"
                      @click="store.downloadDocument(doc)"
                    >
                      <Download :size="20" />
                    </v-btn>
                  </div>
                </div>

                <!-- Categories and Tags -->
                <div class="d-flex align-center ga-3 mb-3 flex-wrap">
                  <v-chip
                    variant="flat"
                    v-if="doc.primary_category"
                    color="orange-lighten-4"
                    text-color="orange-darken-2"
                    size="small"
                  >
                    {{ doc.primary_category }}
                  </v-chip>
                  <v-chip
                    variant="flat"
                    v-if="doc.secondary_category"
                    color="grey-lighten-3"
                    text-color="grey-darken-2"
                    size="small"
                  >
                    {{ doc.secondary_category }}
                  </v-chip>
                </div>

                <!-- Tags -->
                <div
                  v-if="doc.tags && doc.tags.length > 0"
                  class="d-flex align-center ga-2 flex-wrap"
                >
                  <Tag :size="16" class="text-grey" />
                  <v-chip
                    variant="flat"
                    v-for="(tag, index) in doc.tags"
                    :key="index"
                    size="x-small"
                    color="grey-lighten-3"
                    text-color="grey-darken-2"
                  >
                    {{ tag }}
                  </v-chip>
                </div>
              </div>
            </div>
          </v-card>
        </div>
      </v-card-text>
    </v-card>

    <!-- View Extracted Text Dialog -->
    <v-dialog v-model="viewDialog" max-width="800">
      <v-card v-if="viewingDocument">
        <v-card-title class="d-flex align-center justify-space-between bg-grey-lighten-4">
          <span>Extracted Text</span>
          <v-btn icon variant="text" @click="viewDialog = false">
            <span class="text-h6">×</span>
          </v-btn>
        </v-card-title>
        <v-card-text class="pa-6">
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
            <div class="text-body-2">
              Note: OCR accuracy may vary. Please verify critical information with the original
              document.
            </div>
          </v-alert>
          <div
            class="text-body-2 pa-4 bg-grey-lighten-5 rounded"
            style="white-space: pre-wrap; max-height: 400px; overflow-y: auto"
          >
            {{ viewingDocument.extracted_text || 'No text extracted' }}
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
      {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>
