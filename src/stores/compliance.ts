import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import supabase from '@/lib/supabase'
import type { DocumentWithUser } from '@/stores/repository'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ComplianceStatus = 'met' | 'pending' | 'not_met'

export interface AccreditationDefinition {
  id: string
  name: string
  requirements: string[]
  created_at: string
  updated_at: string
}

export interface AccreditationDefinitionDraft {
  name: string
  requirements: string[]
}

export interface ComplianceDocument {
  id: string
  file_name: string
  primary_category: string | null
}

export interface ComplianceItem {
  id: string
  accreditation: string
  requirements: string[]
  remarks: string
  mandatory: string[]
  enhancement: string[]
  status: ComplianceStatus
  supporting_documents: ComplianceDocument[]
  created_at: string
  updated_at: string
}

// Draft used while creating / editing (before saving)
export interface ComplianceDraft {
  accreditation: string | null
  requirements: string[]
  remarks: string
  mandatory: string[]
  enhancement: string[]
  supportingDocIds: string[]
}

export function emptyDraft(): ComplianceDraft {
  return {
    accreditation: null,
    requirements: [],
    remarks: '',
    mandatory: [''],
    enhancement: [''],
    supportingDocIds: [],
  }
}

function normalizeTextArray(values: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of values) {
    const clean = value.trim()
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(clean)
  }
  return normalized
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useComplianceStore = defineStore('compliance', () => {
  const items = ref<ComplianceItem[]>([])
  const accreditationDefinitions = ref<AccreditationDefinition[]>([])
  const loading = ref(false)
  const accreditationLoading = ref(false)
  const saving = ref(false)
  const initialized = ref(false)
  const accreditationInitialized = ref(false)
  const error = ref<string | null>(null)

  // filters
  const filterAccreditation = ref<string | 'all'>('all')
  const filterStatus = ref<ComplianceStatus | 'all'>('all')
  const searchQuery = ref('')

  const accreditationTypes = computed(() => accreditationDefinitions.value.map((d) => d.name))
  const accreditationCriteriaMap = computed<Record<string, string[]>>(() => {
    return accreditationDefinitions.value.reduce<Record<string, string[]>>((acc, def) => {
      acc[def.name] = [...def.requirements]
      return acc
    }, {})
  })

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filteredItems = computed(() => {
    return items.value.filter((item) => {
      if (filterAccreditation.value !== 'all' && item.accreditation !== filterAccreditation.value)
        return false
      if (filterStatus.value !== 'all' && item.status !== filterStatus.value) return false
      if (searchQuery.value.trim()) {
        const q = searchQuery.value.toLowerCase()
        const matchReq = item.requirements.some((r) => r.toLowerCase().includes(q))
        const matchRemarks = item.remarks.toLowerCase().includes(q)
        const matchAcc = item.accreditation.toLowerCase().includes(q)
        if (!matchReq && !matchRemarks && !matchAcc) return false
      }
      return true
    })
  })

  const metCount = computed(() => items.value.filter((i) => i.status === 'met').length)
  const pendingCount = computed(() => items.value.filter((i) => i.status === 'pending').length)
  const notMetCount = computed(() => items.value.filter((i) => i.status === 'not_met').length)

  // ── Accreditation definitions ───────────────────────────────────────────────

  async function fetchAccreditations(force = false) {
    if (accreditationInitialized.value && !force) return
    accreditationLoading.value = true
    try {
      const { data, error: err } = await supabase
        .from('compliance_accreditations')
        .select('id, name, requirements, created_at, updated_at')
        .order('name', { ascending: true })

      if (err) throw err

      accreditationDefinitions.value = (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        name: String(row.name),
        requirements: normalizeTextArray((row.requirements as string[] | null) ?? []),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      }))

      if (
        filterAccreditation.value !== 'all' &&
        !accreditationTypes.value.includes(filterAccreditation.value)
      ) {
        filterAccreditation.value = 'all'
      }

      accreditationInitialized.value = true
    } finally {
      accreditationLoading.value = false
    }
  }

  async function addAccreditation(
    draft: AccreditationDefinitionDraft,
  ): Promise<{ success: boolean; error?: string }> {
    const name = draft.name.trim()
    const requirements = normalizeTextArray(draft.requirements)
    if (!name) return { success: false, error: 'Accreditation name is required' }
    if (!requirements.length)
      return { success: false, error: 'At least one requirement is required' }

    try {
      const { error: err } = await supabase
        .from('compliance_accreditations')
        .insert({ name, requirements })

      if (err) throw err
      accreditationInitialized.value = false
      await fetchAccreditations(true)
      return { success: true }
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to add accreditation',
      }
    }
  }

  async function updateAccreditation(
    originalName: string,
    draft: AccreditationDefinitionDraft,
  ): Promise<{ success: boolean; error?: string }> {
    const name = draft.name.trim()
    const requirements = normalizeTextArray(draft.requirements)
    if (!name) return { success: false, error: 'Accreditation name is required' }
    if (!requirements.length)
      return { success: false, error: 'At least one requirement is required' }

    try {
      const { error: defErr } = await supabase
        .from('compliance_accreditations')
        .update({ name, requirements })
        .eq('name', originalName)

      if (defErr) throw defErr

      if (originalName !== name) {
        const { error: itemsErr } = await supabase
          .from('compliance_items')
          .update({ accreditation: name })
          .eq('accreditation', originalName)
        if (itemsErr) throw itemsErr
        items.value = items.value.map((item) =>
          item.accreditation === originalName ? { ...item, accreditation: name } : item,
        )
      }

      accreditationInitialized.value = false
      await fetchAccreditations(true)
      return { success: true }
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to update accreditation',
      }
    }
  }

  async function deleteAccreditation(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { count, error: countErr } = await supabase
        .from('compliance_items')
        .select('id', { count: 'exact', head: true })
        .eq('accreditation', name)
      if (countErr) throw countErr

      if ((count ?? 0) > 0) {
        return {
          success: false,
          error: `Cannot delete accreditation. ${count} compliance item(s) still use it.`,
        }
      }

      const { error: err } = await supabase
        .from('compliance_accreditations')
        .delete()
        .eq('name', name)
      if (err) throw err

      accreditationInitialized.value = false
      await fetchAccreditations(true)
      return { success: true }
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to delete accreditation',
      }
    }
  }

  // ── Fetch ────────────────────────────────────────────────────────────────────

  async function fetchItems() {
    if (initialized.value) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('compliance_items')
        .select(`*, compliance_documents(document_id, file_name, primary_category)`)
        .order('created_at', { ascending: false })

      if (err) throw err

      items.value = (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        accreditation: String(row.accreditation),
        requirements: (row.requirements as string[] | null) ?? [],
        remarks: String((row.remarks ?? row.description ?? '') as string),
        mandatory: (row.mandatory as string[] | null) ?? [],
        enhancement: (row.enhancement as string[] | null) ?? [],
        status: (row.status as ComplianceStatus | null) ?? 'pending',
        supporting_documents: (
          (row.compliance_documents ?? []) as Array<{
            document_id: string
            file_name: string
            primary_category: string | null
          }>
        ).map((d) => ({
          id: d.document_id,
          file_name: d.file_name,
          primary_category: d.primary_category,
        })),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
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
          remarks: draft.remarks.trim(),
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
          remarks: draft.remarks.trim(),
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
    accreditationDefinitions,
    loading,
    accreditationLoading,
    saving,
    initialized,
    accreditationInitialized,
    error,
    filterAccreditation,
    filterStatus,
    searchQuery,
    accreditationTypes,
    accreditationCriteriaMap,
    filteredItems,
    metCount,
    pendingCount,
    notMetCount,
    approvedDocs,
    docsLoading,
    fetchAccreditations,
    addAccreditation,
    updateAccreditation,
    deleteAccreditation,
    fetchItems,
    addItem,
    updateItem,
    updateStatus,
    deleteItem,
    fetchApprovedDocs,
  }
})
