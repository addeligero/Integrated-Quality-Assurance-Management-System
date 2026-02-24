<script setup lang="ts">
import { ref } from 'vue'
import { Upload, FileText, Image, Scan, Brain } from 'lucide-vue-next'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'ocr_processing' | 'classifying' | 'completed' | 'error'
  ocrProgress: number
  classificationProgress: number
  extractedText?: string
  detectedType?: string
  primaryCategory?: string
  secondaryCategory?: string
  tags?: string[]
  error?: string
}

const files = ref<UploadedFile[]>([])
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

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
      ocrProgress: 0,
      classificationProgress: 0,
    }

    files.value = [...files.value, newFile]

    try {
      // Upload file
      const formData = new FormData()
      formData.append('file', file)

      // Simulate upload progress
      files.value = files.value.map((f) =>
        f.id === newFile.id ? { ...f, status: 'ocr_processing' } : f,
      )

      // Simulate OCR progress
      const ocrInterval = setInterval(() => {
        files.value = files.value.map((f) => {
          if (f.id === newFile.id && f.ocrProgress < 100) {
            return { ...f, ocrProgress: Math.min(f.ocrProgress + 10, 100) }
          }
          return f
        })
      }, 200)

      // Make actual API call
      const response = await fetch('http://127.0.0.1:5000/upload', {
        method: 'POST',
        body: formData,
      })

      clearInterval(ocrInterval)

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const result = await response.json()

      // Start classification phase
      files.value = files.value.map((f) =>
        f.id === newFile.id
          ? { ...f, status: 'classifying', ocrProgress: 100, classificationProgress: 0 }
          : f,
      )

      // Simulate classification progress
      const classInterval = setInterval(() => {
        files.value = files.value.map((f) => {
          if (f.id === newFile.id && f.classificationProgress < 100) {
            return { ...f, classificationProgress: Math.min(f.classificationProgress + 15, 100) }
          }
          return f
        })
      }, 300)

      // Wait for classification animation to complete
      await new Promise((resolve) => setTimeout(resolve, 2000))
      clearInterval(classInterval)

      // Mark as completed with results
      files.value = files.value.map((f) =>
        f.id === newFile.id
          ? {
              ...f,
              status: 'completed',
              ocrProgress: 100,
              classificationProgress: 100,
              extractedText: result.text,
              detectedType: result.type,
              primaryCategory: result.primary_category,
              secondaryCategory: result.secondary_category,
              tags: result.tags ?? [],
            }
          : f,
      )
    } catch (error) {
      console.error('Upload error:', error)
      files.value = files.value.map((f) =>
        f.id === newFile.id
          ? { ...f, status: 'error', error: 'Failed to process file. Please try again.' }
          : f,
      )
    }
  }
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const formatType = (type: string) => {
  return type
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
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
                v-if="file.status === 'error'"
                color="red"
                variant="flat"
                prepend-icon="mdi-alert-circle"
              >
                Error
              </v-chip>
            </div>

            <!-- OCR Progress -->
            <div
              v-if="
                file.status === 'ocr_processing' ||
                file.status === 'classifying' ||
                file.status === 'completed'
              "
              class="mb-4"
            >
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="d-flex align-center ga-2">
                  <v-progress-circular
                    v-if="file.status === 'ocr_processing'"
                    indeterminate
                    color="orange-darken-2"
                    size="16"
                    width="2"
                  />
                  <span class="text-body-2 text-grey-darken-2">
                    {{ file.status === 'ocr_processing' ? 'OCR Processing...' : 'OCR Complete' }}
                  </span>
                </div>
                <span class="text-body-2 text-grey-darken-1">{{ file.ocrProgress }}%</span>
              </div>
              <v-progress-linear
                :model-value="file.ocrProgress"
                color="orange-darken-2"
                height="8"
                rounded
              />
            </div>

            <!-- Classification Progress -->
            <div v-if="file.status === 'classifying' || file.status === 'completed'" class="mb-4">
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="d-flex align-center ga-2">
                  <v-progress-circular
                    v-if="file.status === 'classifying'"
                    indeterminate
                    color="amber-darken-3"
                    size="16"
                    width="2"
                  />
                  <span class="text-body-2 text-grey-darken-2">
                    {{
                      file.status === 'classifying'
                        ? 'LDA-SVM Classification...'
                        : 'Classification Complete'
                    }}
                  </span>
                </div>
                <span class="text-body-2 text-grey-darken-1"
                  >{{ file.classificationProgress }}%</span
                >
              </div>
              <v-progress-linear
                :model-value="file.classificationProgress"
                color="amber-darken-3"
                height="8"
                rounded
              />
            </div>

            <!-- Error Message -->
            <v-alert v-if="file.status === 'error'" type="error" variant="tonal" class="mb-4">
              {{ file.error }}
            </v-alert>

            <!-- Extracted Text Result -->
            <v-card
              v-if="file.status === 'completed' && file.extractedText"
              color="green-lighten-5"
            >
              <v-card-title class="text-subtitle-1 text-green-darken-3 pa-4">
                Extracted Content
              </v-card-title>
              <v-divider />
              <v-card-text class="pa-4">
                <div class="d-flex align-center justify-space-between mb-3">
                  <div>
                    <p class="text-caption text-green-darken-2 mb-1">Document Type</p>
                    <p class="text-body-2 font-weight-medium text-green-darken-4">
                      {{ formatType(file.detectedType || 'Unknown') }}
                    </p>
                  </div>
                  <v-chip color="green-darken-1" size="small">
                    {{ file.extractedText.length }} characters
                  </v-chip>
                </div>

                <v-row class="mb-3">
                  <v-col cols="12" sm="6">
                    <p class="text-caption text-green-darken-2 mb-1">Primary Category</p>
                    <p class="text-body-2 font-weight-medium text-green-darken-4">
                      {{ formatType(file.primaryCategory || 'N/A') }}
                    </p>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <p class="text-caption text-green-darken-2 mb-1">Secondary Category</p>
                    <p class="text-body-2 font-weight-medium text-green-darken-4">
                      {{ formatType(file.secondaryCategory || 'N/A') }}
                    </p>
                  </v-col>
                </v-row>

                <div v-if="file.tags && file.tags.length > 0" class="mb-3">
                  <p class="text-caption text-green-darken-2 mb-2">Tags</p>
                  <div class="d-flex flex-wrap ga-2">
                    <v-chip
                      v-for="tag in file.tags"
                      :key="tag"
                      color="green-darken-1"
                      variant="outlined"
                      size="small"
                    >
                      {{ tag }}
                    </v-chip>
                  </div>
                </div>

                <v-divider class="mb-3" />

                <v-textarea
                  :model-value="file.extractedText"
                  readonly
                  variant="outlined"
                  auto-grow
                  rows="10"
                  class="extracted-text-area"
                  hide-details
                />

                <div class="d-flex justify-end mt-3">
                  <v-btn
                    variant="text"
                    color="green-darken-2"
                    class="text-none"
                    prepend-icon="mdi-content-copy"
                    @click="copyToClipboard(file.extractedText || '')"
                  >
                    Copy Text
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </div>
      </div>
    </v-card>
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

.extracted-text-area :deep(textarea) {
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
}
</style>
