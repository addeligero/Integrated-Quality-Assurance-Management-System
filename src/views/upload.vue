<script setup lang="ts">
import { ref } from 'vue'
import { Upload, FileText, Image, Scan, Brain } from 'lucide-vue-next'
import supabase from '@/lib/supabase'
import { useUserStore } from '@/stores/user'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'ocr_processing' | 'classifying' | 'completed' | 'error'
  error?: string
}

const files = ref<UploadedFile[]>([])
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

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false

  if (e.dataTransfer?.files) {
    const droppedFiles = Array.from(e.dataTransfer.files)
    processFiles(droppedFiles)
  }
}

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files) {
    const selectedFiles = Array.from(target.files)
    processFiles(selectedFiles)
  }
}

const processFiles = async (uploadedFiles: File[]) => {
  for (const file of uploadedFiles) {
    const newFile: UploadedFile = {
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading',
    }

    files.value = [...files.value, newFile]

    try {
      const formData = new FormData()
      formData.append('file', file)

      // OCR phase
      files.value = files.value.map((f) =>
        f.id === newFile.id ? { ...f, status: 'ocr_processing' } : f,
      )
      showSnackbar(`Processing "${file.name}" — OCR in progress…`)

      const response = await fetch('http://127.0.0.1:5000/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Upload failed')

      const result = await response.json()

      // Classification phase
      files.value = files.value.map((f) =>
        f.id === newFile.id ? { ...f, status: 'classifying' } : f,
      )
      showSnackbar(`Classifying "${file.name}"…`)

      // Upload original file to Supabase storage
      const userId = userStore.user?.id
      const storagePath = `${userId}/${crypto.randomUUID()}-${result.filename}`

      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)

      if (storageError) throw new Error(storageError.message)

      // Insert metadata into documents table
      const { error: dbError } = await supabase.from('documents').insert({
        user_id: userId,
        file_name: result.filename,
        primary_category: result.primary_category ?? null,
        secondary_category: result.secondary_category ?? null,
        tags: result.tags ?? [],
        path: storagePath,
        extracted_text: result.text ?? null,
        status: 'pending',
      })

      if (dbError) throw new Error(dbError.message)

      // Mark as completed
      files.value = files.value.map((f) =>
        f.id === newFile.id ? { ...f, status: 'completed' } : f,
      )

      showSnackbar(`"${file.name}" processed and saved successfully.`, 'success')
    } catch (error) {
      console.error('Upload error:', error)
      files.value = files.value.map((f) =>
        f.id === newFile.id
          ? { ...f, status: 'error', error: 'Failed to process file. Please try again.' }
          : f,
      )
      showSnackbar(`Failed to process "${file.name}". Please try again.`, 'error')
    }
  }
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const triggerFileInput = () => {
  fileInput.value?.click()
}
</script>

<template>
  <div>
    <div class="mb-6">
      <h2 class="text-h5 text-grey-darken-3 mb-2 font-weight-medium">Upload Documents</h2>
      <p class="text-body-2 text-grey-darken-1">
        Automated OCR and intelligent classification using LDA-SVM model
      </p>
    </div>

    <!-- Upload Area -->
    <v-card
      :class="[
        'upload-dropzone mb-6',
        { 'dropzone-active': isDragging, 'dropzone-idle': !isDragging },
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
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            style="display: none"
            @change="handleFileSelect"
          />

          <v-btn color="orange-darken-2" size="large" class="text-none" @click="triggerFileInput">
            Browse Files
          </v-btn>

          <div class="d-flex align-center ga-6 text-grey-darken-1">
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
                  Hybrid LDA-SVM model analyzes content and automatically categorizes documents
                  under QA standards.
                </p>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Uploaded Files -->
    <v-card v-if="files.length > 0">
      <v-card-title class="text-h6 pa-6 border-b">Processing Queue</v-card-title>

      <v-divider />

      <div v-for="file in files" :key="file.id" class="pa-6 border-b">
        <div class="d-flex align-start ga-4">
          <v-avatar color="grey-lighten-2" size="56" rounded="lg">
            <FileText :size="28" class="text-grey-darken-1" />
          </v-avatar>

          <div style="flex: 1">
            <!-- File Info and Status -->
            <div class="d-flex align-start justify-space-between mb-3">
              <div>
                <p class="text-body-1 font-weight-medium text-grey-darken-3 mb-1">
                  {{ file.name }}
                </p>
                <p class="text-body-2 text-grey-darken-1">{{ formatFileSize(file.size) }}</p>
              </div>

              <v-chip
                v-if="file.status === 'completed'"
                color="green"
                variant="flat"
                prepend-icon="mdi-check-circle"
              >
                Completed
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
                v-if="file.status === 'error'"
                color="red"
                variant="flat"
                prepend-icon="mdi-alert-circle"
              >
                Error
              </v-chip>
            </div>

            <!-- Error Message -->
            <v-alert v-if="file.status === 'error'" type="error" variant="tonal" class="mb-4">
              {{ file.error }}
            </v-alert>
          </div>
        </div>
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

.border-b {
  border-bottom: 1px solid rgb(224, 224, 224);
}
</style>
