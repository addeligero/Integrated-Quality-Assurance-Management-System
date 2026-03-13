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
  status: 'uploading' | 'ocr_processing' | 'classifying' | 'completed' | 'error'
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

  /**
   * Called on mount. Restores any documents that were mid-processing from a
   * previous session and subscribes to Realtime so all tabs / devices stay in sync.
   */
  async function initTracking(userId: string, retryOCR: RetryOCRFn) {
    // Restore in-progress documents from the database
    const { data: inProgress } = await supabase
      .from('documents')
      .select('id, file_name, path')
      .eq('user_id', userId)
      .eq('status', 'processing')
      .order('created_at', { ascending: false })

    if (inProgress) {
      for (const doc of inProgress) {
        const alreadyQueued = files.value.some((f) => f.documentId === doc.id)
        if (!alreadyQueued) {
          // Add a placeholder so the UI shows the item as recovering
          addFile({
            id: crypto.randomUUID(),
            documentId: doc.id,
            storagePath: doc.path,
            name: doc.file_name,
            size: 0,
            type: '',
            status: 'ocr_processing',
          })
          // Re-run OCR in the background (file is already in Supabase storage)
          retryOCR(doc.id, doc.path, doc.file_name).catch(() => {})
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

  return { files, addFile, updateFile, clearCompleted, initTracking, cleanup }
})
