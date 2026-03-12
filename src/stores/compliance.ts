import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import supabase from '@/lib/supabase'
import type { DocumentWithUser } from '@/stores/repository'

// ── Accreditation definitions ────────────────────────────────────────────────

export type AccreditationType = 'AACCUP' | 'PICAB' | 'COE' | 'AUN-QA' | 'ISO'

export const ACCREDITATION_TYPES: AccreditationType[] = ['AACCUP', 'PICAB', 'COE', 'AUN-QA', 'ISO']

export const ACCREDITATION_CRITERIA: Record<AccreditationType, string[]> = {
  AACCUP: [
    'Area 1 – Vision, Mission, Goals and Objectives',
    'Area 2 – Faculty',
    'Area 3 – Curriculum and Instruction',
    'Area 4 – Support to Students',
    'Area 5 – Research',
    'Area 6 – Extension and Community Involvement',
    'Area 7 – Library',
    'Area 8 – Physical Plant and Facilities',
    'Area 9 – Laboratories',
    'Area 10 – Administration',
  ],
  PICAB: [
    '1.0 Background Information',
    '2.0 Institutional Summary',
    '3.0 Program Educational Objectives',
    '4.0 Program Outcomes (Student Outcomes)',
    '5.0 Curriculum',
    '6.0 Students',
    '7.0 Faculty',
    '8.0 Facilities',
    '9.0 Institutional Support',
    '10.0 Industry-Academe Linkage and Community Programs',
    '11.0 Program Improvement',
  ],
  COE: [
    'Criterion 1 – Innovation Culture',
    'Criterion 2 – Staff Development Tradition',
    'Criterion 3 – Learner and Graduate Quality',
    'Criterion 4 – Culture of Research and Creativity',
    'Criterion 5 – International Outlook',
    'Criterion 6 – Service Orientation',
  ],
  'AUN-QA': [
    'Criterion 1 – University Information',
    'Criterion 2 – Programme Structure and Content',
    'Criterion 3 – Teaching and Learning Approach',
    'Criterion 4 – Academic Staff',
    'Criterion 5 – Academic Staff Support',
    'Criterion 6 – Student Support Services',
    'Criterion 7 – Facilities and Infrastructure',
    'Criterion 8 – Output and Outcomes',
  ],
  ISO: [],
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ComplianceStatus = 'met' | 'pending' | 'not_met'

export interface ComplianceDocument {
  id: string
  file_name: string
  primary_category: string | null
}

export interface ComplianceItem {
  id: string
  accreditation: AccreditationType
  requirements: string[] // checked criteria from ACCREDITATION_CRITERIA
  description: string
  mandatory: string[]
  enhancement: string[]
  status: ComplianceStatus
  supporting_documents: ComplianceDocument[]
  created_at: string
  updated_at: string
}

// Draft used while creating / editing (before saving)
export interface ComplianceDraft {
  accreditation: AccreditationType | null
  requirements: string[]
  description: string
  mandatory: string[]
  enhancement: string[]
  supportingDocIds: string[]
}

export function emptyDraft(): ComplianceDraft {
  return {
    accreditation: null,
    requirements: [],
    description: '',
    mandatory: [''],
    enhancement: [''],
    supportingDocIds: [],
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useComplianceStore = defineStore('compliance', () => {
  const items = ref<ComplianceItem[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const initialized = ref(false)
  const error = ref<string | null>(null)

  // filters
  const filterAccreditation = ref<AccreditationType | 'all'>('all')
  const filterStatus = ref<ComplianceStatus | 'all'>('all')
  const searchQuery = ref('')

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filteredItems = computed(() => {
    return items.value.filter((item) => {
      if (filterAccreditation.value !== 'all' && item.accreditation !== filterAccreditation.value)
        return false
      if (filterStatus.value !== 'all' && item.status !== filterStatus.value) return false
      if (searchQuery.value.trim()) {
        const q = searchQuery.value.toLowerCase()
        const matchReq = item.requirements.some((r) => r.toLowerCase().includes(q))
        const matchDesc = item.description.toLowerCase().includes(q)
        const matchAcc = item.accreditation.toLowerCase().includes(q)
        if (!matchReq && !matchDesc && !matchAcc) return false
      }
      return true
    })
  })

  const metCount = computed(() => items.value.filter((i) => i.status === 'met').length)
  const pendingCount = computed(() => items.value.filter((i) => i.status === 'pending').length)
  const notMetCount = computed(() => items.value.filter((i) => i.status === 'not_met').length)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  async function fetchItems() {
    if (initialized.value) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('compliance_items')
        .select(`*, compliance_documents(id, file_name, primary_category)`)
        .order('created_at', { ascending: false })

      if (err) throw err

      items.value = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        accreditation: row.accreditation,
        requirements: row.requirements ?? [],
        description: row.description ?? '',
        mandatory: row.mandatory ?? [],
        enhancement: row.enhancement ?? [],
        status: row.status ?? 'pending',
        supporting_documents: row.compliance_documents ?? [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      })) as unknown as ComplianceItem[]

      initialized.value = true
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to load compliance items'
    } finally {
      loading.value = false
    }
  }

  // ── Add ──────────────────────────────────────────────────────────────────────

  async function addItem(draft: ComplianceDraft): Promise<{ success: boolean; error?: string }> {
    saving.value = true
    error.value = null
    try {
      const mandatory = draft.mandatory.filter((m) => m.trim())
      const enhancement = draft.enhancement.filter((e) => e.trim())

      const { data: row, error: insertErr } = await supabase
        .from('compliance_items')
        .insert({
          accreditation: draft.accreditation,
          requirements: draft.requirements,
          description: draft.description.trim(),
          mandatory,
          enhancement,
          status: 'pending',
        })
        .select()
        .single()

      if (insertErr) throw insertErr

      // link supporting documents
      if (draft.supportingDocIds.length > 0) {
        await supabase.from('compliance_item_documents').insert(
          draft.supportingDocIds.map((docId) => ({
            compliance_item_id: row.id,
            document_id: docId,
          })),
        )
      }

      initialized.value = false
      await fetchItems()
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save compliance item'
      error.value = msg
      return { success: false, error: msg }
    } finally {
      saving.value = false
    }
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  async function updateItem(
    id: string,
    draft: ComplianceDraft,
  ): Promise<{ success: boolean; error?: string }> {
    saving.value = true
    error.value = null
    try {
      const mandatory = draft.mandatory.filter((m) => m.trim())
      const enhancement = draft.enhancement.filter((e) => e.trim())

      const { error: updateErr } = await supabase
        .from('compliance_items')
        .update({
          accreditation: draft.accreditation,
          requirements: draft.requirements,
          description: draft.description.trim(),
          mandatory,
          enhancement,
        })
        .eq('id', id)

      if (updateErr) throw updateErr

      // re-link documents
      await supabase.from('compliance_item_documents').delete().eq('compliance_item_id', id)
      if (draft.supportingDocIds.length > 0) {
        await supabase.from('compliance_item_documents').insert(
          draft.supportingDocIds.map((docId) => ({
            compliance_item_id: id,
            document_id: docId,
          })),
        )
      }

      initialized.value = false
      await fetchItems()
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update compliance item'
      error.value = msg
      return { success: false, error: msg }
    } finally {
      saving.value = false
    }
  }

  // ── Update status ────────────────────────────────────────────────────────────

  async function updateStatus(id: string, status: ComplianceStatus) {
    const { error: err } = await supabase.from('compliance_items').update({ status }).eq('id', id)
    if (err) throw err
    const item = items.value.find((i) => i.id === id)
    if (item) item.status = status
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function deleteItem(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error: err } = await supabase.from('compliance_items').delete().eq('id', id)
      if (err) throw err
      items.value = items.value.filter((i) => i.id !== id)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Delete failed' }
    }
  }

  // ── Approved docs for linking ────────────────────────────────────────────────

  const approvedDocs = ref<DocumentWithUser[]>([])
  const docsLoading = ref(false)

  async function fetchApprovedDocs() {
    if (approvedDocs.value.length > 0) return
    docsLoading.value = true
    try {
      const { data, error: err } = await supabase
        .from('documents')
        .select(
          'id, file_name, primary_category, secondary_category, status, created_at, updated_at, user_id, path, extracted_text, tags',
        )
        .eq('status', 'approved')
        .order('file_name', { ascending: true })
      if (err) throw err
      approvedDocs.value = (data ?? []) as DocumentWithUser[]
    } finally {
      docsLoading.value = false
    }
  }

  return {
    items,
    loading,
    saving,
    initialized,
    error,
    filterAccreditation,
    filterStatus,
    searchQuery,
    filteredItems,
    metCount,
    pendingCount,
    notMetCount,
    approvedDocs,
    docsLoading,
    fetchItems,
    addItem,
    updateItem,
    updateStatus,
    deleteItem,
    fetchApprovedDocs,
  }
})
