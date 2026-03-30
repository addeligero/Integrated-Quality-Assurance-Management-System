<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Upload, FileText, Image, Scan, Brain } from 'lucide-vue-next'
import supabase from '@/lib/supabase'
import { useUserStore } from '@/stores/user'
import { useUploadStore } from '@/stores/upload'

const uploadStore = useUploadStore()
const { files } = storeToRefs(uploadStore)

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'info' | 'success' | 'error'>('info')

const showSnackbar = (message: string, color: 'info' | 'success' | 'error' = 'info') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

const userStore = useUserStore()

type OCRResult = {
  filename?: string
  primary_category?: string | null
  secondary_category?: string | null
  tags?: string[]
  text?: string | null
}

const normalizeExtractedText = (text: string | null | undefined) =>
  (text ?? '').replace(/\s+/g, ' ').trim()

const normalizedTextEquals = (left: string | null | undefined, right: string | null | undefined) =>
  normalizeExtractedText(left).toLowerCase() === normalizeExtractedText(right).toLowerCase()

const extractDocumentWithOCR = async (fileData: File | Blob, displayName: string) => {
  const formData = new FormData()
  formData.append('file', fileData, displayName)

  const response = await fetch('http://127.0.0.1:5000/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) throw new Error('OCR service error')
  return (await response.json()) as OCRResult
}

const hasDuplicateTitle = async (fileName: string) => {
  const normalizedName = fileName.trim()
  if (!normalizedName) return false

  const { data, error } = await supabase
    .from('documents')
    .select('id')
    .eq('file_name', normalizedName)
    .limit(1)

  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

const hasDuplicateExtractedText = async (
  rawText: string | null | undefined,
  excludeDocumentId?: string,
) => {
  const extractedText = normalizeExtractedText(rawText).toLowerCase()
  if (!extractedText) return false

  const BATCH_SIZE = 200
  let from = 0

  while (true) {
    const to = from + BATCH_SIZE - 1
    const { data, error } = await supabase
      .from('documents')
      .select('id, extracted_text')
      .not('extracted_text', 'is', null)
      .range(from, to)

    if (error) throw new Error(error.message)
    if (!data?.length) return false

    const hasMatch = data.some(
      (row) =>
        row.id !== excludeDocumentId && normalizedTextEquals(row.extracted_text, extractedText),
    )
    if (hasMatch) return true

    if (data.length < BATCH_SIZE) return false
    from += BATCH_SIZE
  }
}

// ── Core OCR + save helper ────────────────────────────────────────────────────
// Sends the file to the Python OCR service then updates the Supabase record.
// `localId`    — the in-store entry id (for UI updates)
// `documentId` — the Supabase documents row id (durable across refreshes)
// `fileData`   — the File or Blob to process
// `displayName`— the filename to show / save
async function runOCRAndFinalize(
  localId: string,
  documentId: string,
  fileData: File | Blob,
  displayName: string,
  precomputedOCRResult?: OCRResult,
) {
  uploadStore.updateFile(localId, { status: 'ocr_processing' })
  showSnackbar(`Processing "${displayName}" — OCR in progress…`)

  const result = precomputedOCRResult ?? (await extractDocumentWithOCR(fileData, displayName))

  uploadStore.updateFile(localId, { status: 'classifying' })
  showSnackbar(`Classifying "${displayName}"…`)

  const { error: updateErr } = await supabase
    .from('documents')
    .update({
      file_name: result.filename ?? displayName,
      primary_category: result.primary_category ?? null,
      secondary_category: result.secondary_category ?? null,
      tags: result.tags ?? [],
      extracted_text: result.text ?? null,
      status: 'pending',
    })
    .eq('id', documentId)

  if (updateErr) throw new Error(updateErr.message)

  // Update locally too — Realtime will also propagate to other tabs/devices
  uploadStore.updateFile(localId, { status: 'completed' })
  showSnackbar(`"${displayName}" processed and saved.`, 'success')
}

// ── Retry: called on mount for docs that were mid-processing on last load ─────
async function retryOCR(docId: string, storagePath: string, fileName: string) {
  const match = uploadStore.files.find((f) => f.documentId === docId)
  const localId = match?.id ?? ''
  showSnackbar(`Resuming comparison for "${fileName}"…`)
  try {
    // File is already in Supabase storage — download and re-process
    const { data: blob, error: downloadErr } = await supabase.storage
      .from('documents')
      .download(storagePath)
    if (downloadErr || !blob) throw new Error('Could not download file for retry')

    if (localId) uploadStore.updateFile(localId, { status: 'comparing' })
    const ocrPreview = await extractDocumentWithOCR(blob, fileName)
    const duplicateText = await hasDuplicateExtractedText(ocrPreview.text, docId)

    if (duplicateText) {
      if (localId) {
        uploadStore.updateFile(localId, {
          status: 'error',
          error: 'Duplicate content: extracted text already exists.',
        })
      }
      await supabase.from('documents').update({ status: 'error' }).eq('id', docId)
      showSnackbar(
        `Could not continue "${fileName}": extracted text already exists in another document.`,
        'error',
      )
      return
    }

    await runOCRAndFinalize(localId, docId, blob, fileName, ocrPreview)
  } catch (err) {
    console.error('Retry failed:', err)
    if (localId)
      uploadStore.updateFile(localId, { status: 'error', error: 'Retry failed. Please re-upload.' })
    await supabase.from('documents').update({ status: 'error' }).eq('id', docId)
    showSnackbar(`Could not resume "${fileName}". Please re-upload.`, 'error')
  }
}

// ── Allowed file-type guard ─────────────────────────────────────────────────
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'])
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
])

function isAllowedFile(file: File): boolean {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
  return ALLOWED_EXTENSIONS.has(ext) || ALLOWED_MIME_TYPES.has(file.type)
}

const PROCESSING_STATUSES = new Set<string>([
  'uploading',
  'comparing',
  'ocr_processing',
  'classifying',
  'processing',
])
const hasProcessingFiles = computed(() =>
  files.value.some((f) => PROCESSING_STATUSES.has(f.status)),
)

const ensureCanUpload = () => {
  if (!hasProcessingFiles.value) return true
  showSnackbar('A document is still processing. Please wait until it is completed.', 'error')
  return false
}

// ── Main upload flow ──────────────────────────────────────────────────────────
const processFiles = async (uploadedFiles: File[]) => {
  if (!uploadedFiles.length || !ensureCanUpload()) return

  if (uploadedFiles.length > 1) {
    showSnackbar('Only one file can be uploaded at a time. Processing the first file only.', 'info')
  }

  const [file] = uploadedFiles
  if (!file) return
  let localId: string | null = null

  if (!isAllowedFile(file)) {
    showSnackbar(
      `"${file.name}" was rejected. Only PDF, DOC, DOCX, JPG, and PNG files are allowed.`,
      'error',
    )
    return
  }

  try {
    const duplicateTitle = await hasDuplicateTitle(file.name)
    if (duplicateTitle) {
      showSnackbar(
        'Upload cancelled: the title of this document is already present in the documents table.',
        'error',
      )
      return
    }

    localId = crypto.randomUUID()

    uploadStore.addFile({
      id: localId,
      documentId: null,
      storagePath: null,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading',
    })

    const userId = userStore.user?.id
    const storagePath = `${userId}/${crypto.randomUUID()}-${file.name}`

    showSnackbar(`Uploading "${file.name}"…`)

    // ① Upload file to storage first — the file is safe even if browser closes
    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file)
    if (storageError) throw new Error(storageError.message)

    // ② Create a durable DB record — this is what survives a refresh
    //    status 'processing' signals to the next page load that OCR is pending
    const { data: dbRow, error: dbInsertError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        file_name: file.name,
        path: storagePath,
        primary_category: null,
        secondary_category: null,
        tags: [],
        extracted_text: null,
        status: 'processing',
      })
      .select('id')
      .single()
    if (dbInsertError) throw new Error(dbInsertError.message)

    const documentId = dbRow.id
    uploadStore.updateFile(localId, { documentId, storagePath })

    uploadStore.updateFile(localId, { status: 'comparing' })
    showSnackbar(`Comparing "${file.name}" against existing documents…`)
    const ocrPreview = await extractDocumentWithOCR(file, file.name)
    const duplicateText = await hasDuplicateExtractedText(ocrPreview.text, documentId)
    if (duplicateText) {
      uploadStore.updateFile(localId, {
        status: 'error',
        error: 'Duplicate content: extracted text already exists.',
      })
      await supabase.from('documents').update({ status: 'error' }).eq('id', documentId)
      showSnackbar(
        'Upload cancelled: the extracted text from your document is already present.',
        'error',
      )
      return
    }

    // — if the browser closes here, the next page load detects
    //    status='processing' and retries automatically via retryOCR()
    await runOCRAndFinalize(localId, documentId, file, file.name, ocrPreview)
  } catch (error) {
    console.error('Upload error:', error)
    if (localId) {
      uploadStore.updateFile(localId, {
        status: 'error',
        error: 'Failed to process file. Please try again.',
      })
    }
    showSnackbar(`Failed to process "${file.name}". Please try again.`, 'error')
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  const userId = userStore.user?.id
  if (userId) uploadStore.initTracking(userId, retryOCR)
})

onUnmounted(() => uploadStore.cleanup())

// ── Drag & drop / file input ──────────────────────────────────────────────────
const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (hasProcessingFiles.value) return
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files) processFiles(Array.from(e.dataTransfer.files))
}

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files) processFiles(Array.from(target.files))
  target.value = ''
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

// ── Pagination ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 5
const currentPage = ref(1)
type QueueFilter = 'processing' | 'completed' | 'error'
const queueFilter = ref<QueueFilter>('processing')

// Keep in-progress items at the top so they are always visible
const sortedFiles = computed(() => {
  const active = files.value.filter((f) => f.status !== 'completed' && f.status !== 'error')
  const rest = files.value.filter((f) => f.status === 'completed' || f.status === 'error')
  return [...active, ...rest]
})

const processingCount = computed(
  () => files.value.filter((f) => f.status !== 'completed' && f.status !== 'error').length,
)
const completedCount = computed(() => files.value.filter((f) => f.status === 'completed').length)
const errorCount = computed(() => files.value.filter((f) => f.status === 'error').length)

const filteredFiles = computed(() => {
  if (queueFilter.value === 'completed')
    return sortedFiles.value.filter((f) => f.status === 'completed')
  if (queueFilter.value === 'error') return sortedFiles.value.filter((f) => f.status === 'error')
  return sortedFiles.value.filter((f) => f.status !== 'completed' && f.status !== 'error')
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredFiles.value.length / PAGE_SIZE)))

const pagedFiles = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredFiles.value.slice(start, start + PAGE_SIZE)
})

watch(queueFilter, () => {
  currentPage.value = 1
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}
const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}
</script>

<template>
  <div>
    <div class="mb-6">
      <h2 class="text-h5 text-grey-darken-3 mb-2 font-weight-medium">Upload Documents</h2>
      <p class="text-body-2 text-grey-darken-1">
        Automated OCR and intelligent classification using llama-3.3-70b-versatile
      </p>
    </div>

    <!-- Upload Area -->
    <v-card
      :class="[
        'upload-dropzone mb-6',
        {
          'dropzone-active': isDragging && !hasProcessingFiles,
          'dropzone-idle': !isDragging && !hasProcessingFiles,
          'dropzone-disabled': hasProcessingFiles,
        },
      ]"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <v-card-text class="pa-12 text-center">
        <div class="d-flex flex-column align-center ga-4">
          <v-avatar color="orange-lighten-4" size="80">
            <Upload :size="40" class="text-orange-darken-2" />
          </v-avatar>

          <div>
            <p class="text-h6 text-grey-darken-3 mb-1">Drag and drop files here</p>
            <p class="text-body-2 text-grey-darken-1">or click to browse from your computer</p>
          </div>

          <input
            ref="fileInput"
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            style="display: none"
            @change="handleFileSelect"
          />

          <v-btn
            color="orange-darken-2"
            size="large"
            class="text-none"
            :disabled="hasProcessingFiles"
            @click="triggerFileInput"
          >
            Browse Files
          </v-btn>

          <p v-if="hasProcessingFiles" class="text-body-2 text-red-darken-2">
            A document is still processing. Upload is locked until it finishes.
          </p>

          <div class="d-flex align-center ga-6 text-grey-darken-1 file-types-row">
            <div class="d-flex align-center ga-2">
              <FileText :size="16" />
              <span class="text-body-2">PDF, DOC, DOCX</span>
            </div>
            <div class="d-flex align-center ga-2">
              <Image :size="16" />
              <span class="text-body-2">JPG, PNG</span>
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Processing Information -->
    <v-row class="mb-6">
      <v-col cols="12" md="6">
        <v-card color="orange-lighten-5" class="h-100">
          <v-card-text class="pa-6">
            <div class="d-flex align-start ga-4">
              <v-avatar color="orange-darken-2" size="56">
                <Scan :size="28" class="text-white" />
              </v-avatar>
              <div>
                <h3 class="text-h6 text-orange-darken-4 mb-2">OCR Processing</h3>
                <p class="text-body-2 text-orange-darken-3">
                  Documents are automatically scanned and converted to machine-readable text using
                  advanced Optical Character Recognition.
                </p>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card color="amber-lighten-5" class="h-100">
          <v-card-text class="pa-6">
            <div class="d-flex align-start ga-4">
              <v-avatar color="amber-darken-3" size="56">
                <Brain :size="28" class="text-white" />
              </v-avatar>
              <div>
                <h3 class="text-h6 text-amber-darken-4 mb-2">Intelligent Classification</h3>
                <p class="text-body-2 text-amber-darken-3">
                  llama-3.3-70b-versatile model analyzes content and automatically categorizes
                  documents under QA standards.
                </p>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Uploaded Files -->
    <v-card v-if="files.length > 0">
      <div class="d-flex align-center justify-space-between pa-6 border-b">
        <div>
          <span class="text-h6">Processing Queue</span>
          <p class="text-body-2 text-grey-darken-1 mt-1">
            {{ filteredFiles.length }} shown of {{ files.length }} document{{
              files.length !== 1 ? 's' : ''
            }}
          </p>
        </div>
        <div class="d-flex align-center ga-2 queue-filters">
          <v-chip
            :variant="queueFilter === 'processing' ? 'flat' : 'tonal'"
            color="orange-darken-2"
            @click="queueFilter = 'processing'"
          >
            Processing ({{ processingCount }})
          </v-chip>
          <v-chip
            :variant="queueFilter === 'completed' ? 'flat' : 'tonal'"
            color="green-darken-1"
            @click="queueFilter = 'completed'"
          >
            Completed ({{ completedCount }})
          </v-chip>
          <v-chip
            :variant="queueFilter === 'error' ? 'flat' : 'tonal'"
            color="red-darken-1"
            @click="queueFilter = 'error'"
          >
            Error ({{ errorCount }})
          </v-chip>
        </div>
      </div>

      <v-divider />

      <div v-if="pagedFiles.length === 0" class="pa-6 text-body-2 text-grey-darken-1">
        No documents found for this filter.
      </div>

      <div v-for="file in pagedFiles" :key="file.id" class="pa-6 border-b">
        <div class="d-flex align-start ga-4 queue-row">
          <v-avatar color="grey-lighten-2" size="56" rounded="lg">
            <FileText :size="28" class="text-grey-darken-1" />
          </v-avatar>

          <div style="flex: 1">
            <!-- File Info and Status -->
            <div class="d-flex align-start justify-space-between mb-3 queue-header">
              <div>
                <p class="text-body-1 font-weight-medium text-grey-darken-3 mb-1">
                  {{ file.name }}
                </p>
                <p class="text-body-2 text-grey-darken-1">
                  {{
                    file.size > 0 ? formatFileSize(file.size) : 'Recovered from previous session'
                  }}
                </p>
              </div>

              <v-chip
                v-if="file.status === 'completed'"
                color="green"
                variant="flat"
                prepend-icon="mdi-check-circle"
              >
                Completed
              </v-chip>

              <v-chip v-else-if="file.status === 'uploading'" color="blue-darken-1" variant="tonal">
                <v-progress-circular
                  indeterminate
                  size="14"
                  width="2"
                  class="mr-2"
                  color="blue-darken-1"
                />
                Uploading…
              </v-chip>

              <v-chip v-else-if="file.status === 'comparing'" color="grey-darken-1" variant="tonal">
                <v-progress-circular
                  indeterminate
                  size="14"
                  width="2"
                  class="mr-2"
                  color="grey-darken-1"
                />
                Comparing…
              </v-chip>

              <v-chip
                v-else-if="file.status === 'ocr_processing'"
                color="orange-darken-2"
                variant="tonal"
              >
                <v-progress-circular
                  indeterminate
                  size="14"
                  width="2"
                  class="mr-2"
                  color="orange-darken-2"
                />
                OCR Processing…
              </v-chip>

              <v-chip
                v-else-if="file.status === 'classifying'"
                color="amber-darken-3"
                variant="tonal"
              >
                <v-progress-circular
                  indeterminate
                  size="14"
                  width="2"
                  class="mr-2"
                  color="amber-darken-3"
                />
                Classifying…
              </v-chip>

              <v-chip
                v-else-if="file.status === 'error'"
                color="red"
                variant="flat"
                prepend-icon="mdi-alert-circle"
              >
                Error
              </v-chip>

              <v-chip v-else color="grey-darken-1" variant="tonal">
                <v-progress-circular
                  indeterminate
                  size="14"
                  width="2"
                  class="mr-2"
                  color="grey-darken-1"
                />
                Processing…
              </v-chip>
            </div>

            <!-- Error Message -->
            <v-alert v-if="file.status === 'error'" type="error" variant="tonal" class="mb-4">
              {{ file.error }}
            </v-alert>
          </div>
        </div>
      </div>

      <!-- Pagination controls -->
      <div v-if="totalPages > 1" class="d-flex align-center justify-space-between px-6 py-3">
        <v-btn
          variant="text"
          size="small"
          :disabled="currentPage === 1"
          class="text-none"
          @click="prevPage"
        >
          ← Previous
        </v-btn>

        <span class="text-body-2 text-grey-darken-2">
          Page {{ currentPage }} of {{ totalPages }}
        </span>

        <v-btn
          variant="text"
          size="small"
          :disabled="currentPage === totalPages"
          class="text-none"
          @click="nextPage"
        >
          Next →
        </v-btn>
      </div>
    </v-card>

    <!-- Status Snackbar -->
    <v-snackbar
      v-model="snackbar"
      :color="snackbarColor"
      location="bottom right"
      :timeout="4000"
      rounded="lg"
    >
      {{ snackbarMessage }}
      <template #actions>
        <v-btn variant="text" @click="snackbar = false">Close</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<style scoped>
.upload-dropzone {
  border: 2px dashed rgb(189, 189, 189);
  transition: all 0.3s ease;
  cursor: pointer;
}

.dropzone-idle:hover {
  border-color: rgb(255, 152, 0);
  background-color: rgb(255, 243, 224);
}

.dropzone-active {
  border-color: rgb(230, 81, 0);
  background-color: rgb(255, 237, 213);
}

.dropzone-disabled {
  border-color: rgb(238, 238, 238);
  background-color: rgb(250, 250, 250);
  cursor: not-allowed;
}

.border-b {
  border-bottom: 1px solid rgb(224, 224, 224);
}

@media (max-width: 599px) {
  .queue-filters,
  .file-types-row,
  .queue-row,
  .queue-header {
    flex-direction: column;
    align-items: flex-start !important;
  }
}
</style>
