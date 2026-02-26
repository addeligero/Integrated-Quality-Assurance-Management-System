import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'ocr_processing' | 'classifying' | 'completed' | 'error'
  error?: string
}

export const useUploadStore = defineStore('upload', () => {
  const files = ref<UploadedFile[]>([])

  const addFile = (file: UploadedFile) => {
    files.value = [...files.value, file]
  }

  const updateFile = (id: string, updates: Partial<UploadedFile>) => {
    files.value = files.value.map((f) => (f.id === id ? { ...f, ...updates } : f))
  }

  const clearCompleted = () => {
    files.value = files.value.filter((f) => f.status !== 'completed' && f.status !== 'error')
  }

  return { files, addFile, updateFile, clearCompleted }
})
