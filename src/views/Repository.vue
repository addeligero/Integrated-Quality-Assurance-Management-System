<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  Search,
  Filter,
  FileText,
  Download,
  Eye,
  Calendar,
  Tag,
  TrendingUp,
  AlertCircle,
  XCircle,
} from 'lucide-vue-next'
import { useRepositoryStore } from '@/stores/repository'

const store = useRepositoryStore()
const {
  loading,
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
} = storeToRefs(store)

onMounted(async () => {
  await store.fetchDocuments()
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

const itemsPerPage = 5
const currentPage = ref(1)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredDocuments.value.length / itemsPerPage)),
)

const paginatedDocuments = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return filteredDocuments.value.slice(start, start + itemsPerPage)
})

const firstVisibleIndex = computed(() => {
  if (!filteredDocuments.value.length) return 0
  return (currentPage.value - 1) * itemsPerPage + 1
})

const lastVisibleIndex = computed(() =>
  Math.min(currentPage.value * itemsPerPage, filteredDocuments.value.length),
)

watch(
  () => filteredDocuments.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
  },
)
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
          <div class="d-flex ga-3 search-controls">
            <v-select
              v-model="searchType"
              :items="[
                { value: 'semantic', title: 'Semantic Search' },
                { value: 'filename', title: 'Filename Search' },
              ]"
              variant="outlined"
              density="comfortable"
              hide-details
              class="search-type-select"
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
        <div class="d-flex align-center justify-space-between mb-4 result-header">
          <h3 class="text-h6 text-grey-darken-3">
            {{ filteredDocuments.length }} Document{{ filteredDocuments.length !== 1 ? 's' : '' }}
            Found
          </h3>
          <span v-if="filteredDocuments.length" class="text-body-2 text-grey-darken-1">
            Showing {{ firstVisibleIndex }}-{{ lastVisibleIndex }} of {{ filteredDocuments.length }}
          </span>
          <div class="d-flex align-center ga-2 sort-controls">
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
              class="sort-select"
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
            v-for="doc in paginatedDocuments"
            :key="doc.id"
            variant="outlined"
            class="pa-4"
            hover
          >
            <div class="d-flex ga-4 document-row">
              <!-- File Icon -->
              <div class="bg-orange-lighten-4 pa-3 rounded" style="height: fit-content">
                <FileText :size="24" class="text-orange-darken-1" />
              </div>

              <!-- Document Info -->
              <div class="flex-grow-1">
                <div class="d-flex align-start justify-space-between mb-2 doc-header-row">
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
                  <div class="d-flex ga-2 doc-actions">
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

        <div v-if="filteredDocuments.length > itemsPerPage" class="d-flex justify-center mt-6">
          <v-pagination
            v-model="currentPage"
            :length="totalPages"
            :total-visible="5"
            color="orange-darken-1"
            density="comfortable"
            show-first-last-page
          />
        </div>
      </v-card-text>
    </v-card>

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
            <v-progress-circular indeterminate color="orange-darken-1" size="48" />
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
          <v-btn variant="text" @click="viewDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
      {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>

<style scoped>
.search-controls {
  flex-wrap: wrap;
}

.search-type-select {
  min-width: 180px;
}

.sort-select {
  min-width: 150px;
}

@media (max-width: 959px) {
  .result-header {
    flex-direction: column;
    align-items: flex-start !important;
    gap: 12px;
  }
}

@media (max-width: 599px) {
  .search-controls,
  .sort-controls,
  .doc-header-row,
  .document-row {
    flex-direction: column;
    align-items: stretch !important;
  }

  .search-type-select,
  .sort-select {
    min-width: 0;
    width: 100%;
  }

  .doc-actions {
    justify-content: flex-end;
  }
}
</style>
