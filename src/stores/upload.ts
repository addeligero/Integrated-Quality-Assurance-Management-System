import { defineStore } from 'pinia'
import { ref } from 'vue'
import supabase from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface UploadedFile {
  id: string
  documentId: string | null // Supabase documents row id
  storagePath: string | null // Supabase storage path (survives refresh)
  name: string
  size: number
  type: string
  status: 'uploading' | 'comparing' | 'ocr_processing' | 'classifying' | 'completed' | 'error'
  error?: string
}

export type RetryOCRFn = (docId: string, storagePath: string, fileName: string) => Promise<void>

export const useUploadStore = defineStore('upload', () => {
  const files = ref<UploadedFile[]>([])
  let realtimeChannel: RealtimeChannel | null = null

  function addFile(file: UploadedFile) {
    files.value = [...files.value, file]
  }

  function updateFile(id: string, updates: Partial<UploadedFile>) {
    files.value = files.value.map((f) => (f.id === id ? { ...f, ...updates } : f))
  }

  function clearCompleted() {
    files.value = files.value.filter((f) => f.status !== 'completed' && f.status !== 'error')
  }

  function removeFile(id: string) {
    files.value = files.value.filter((f) => f.id !== id)
  }

  /**
   * Called on mount. Restores all recent documents from the DB so the
   * Processing Queue survives a page refresh.
   * - status 'processing'  → resume OCR (file already in storage)
   * - status 'error'       → show error so user can re-upload
   * - status 'pending' / 'approved' / 'rejected' → show as completed
   */
  async function initTracking(userId: string, retryOCR: RetryOCRFn) {
    const { data: recentDocs } = await supabase
      .from('documents')
      .select('id, file_name, path, status')
      .eq('user_id', userId)
      .in('status', ['processing', 'error', 'pending', 'approved', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (recentDocs) {
      for (const doc of recentDocs) {
        const alreadyQueued = files.value.some((f) => f.documentId === doc.id)
        if (alreadyQueued) continue

        const localId = crypto.randomUUID()

        if (doc.status === 'processing') {
          // Still mid-OCR — add placeholder and resume
          addFile({
            id: localId,
            documentId: doc.id,
            storagePath: doc.path,
            name: doc.file_name,
            size: 0,
            type: '',
            status: 'comparing',
          })
          retryOCR(doc.id, doc.path, doc.file_name).catch(() => {})
        } else if (doc.status === 'error') {
          addFile({
            id: localId,
            documentId: doc.id,
            storagePath: doc.path,
            name: doc.file_name,
            size: 0,
            type: '',
            status: 'error',
            error: 'Processing failed. Please re-upload.',
          })
        } else {
          // pending / approved / rejected — OCR finished successfully
          addFile({
            id: localId,
            documentId: doc.id,
            storagePath: doc.path,
            name: doc.file_name,
            size: 0,
            type: '',
            status: 'completed',
          })
        }
      }
    }

    // Subscribe to realtime changes so all tabs / devices see status updates
    if (realtimeChannel) supabase.removeChannel(realtimeChannel)
    realtimeChannel = supabase
      .channel(`upload-tracking-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; status: string }
          const match = files.value.find((f) => f.documentId === updated.id)
          if (!match) return
          if (updated.status === 'pending') {
            updateFile(match.id, { status: 'completed' })
          } else if (updated.status === 'error') {
            updateFile(match.id, { status: 'error', error: 'Processing failed on server.' })
          }
        },
      )
      .subscribe()
  }

  function cleanup() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  return { files, addFile, updateFile, removeFile, clearCompleted, initTracking, cleanup }
})
