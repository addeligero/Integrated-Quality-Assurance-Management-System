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

export interface ComplianceCategory {
  id: number
  name: string
}

export interface RequirementCategoryDraft {
  accreditation: string
  requirementKey: string
  categoryIds: number[]
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

function normalizeNumberArray(values: number[]): number[] {
  return Array.from(
    new Set(
      values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).sort((a, b) => a - b)
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code ?? '') : ''
  const message = 'message' in error ? String(error.message ?? '') : ''
  return code === '42P01' || message.toLowerCase().includes('does not exist')
}

export function extractRequirementKey(requirement: string): string {
  const text = requirement.trim()
  if (!text) return ''
  const match = text.match(/\d+/)
  if (!match) return text
  return String(Number(match[0]))
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useComplianceStore = defineStore('compliance', () => {
  const items = ref<ComplianceItem[]>([])
  const accreditationDefinitions = ref<AccreditationDefinition[]>([])
  const complianceCategories = ref<ComplianceCategory[]>([])
  const requirementCategoryMappings = ref<Record<string, Record<string, number[]>>>({})
  const loading = ref(false)
  const accreditationLoading = ref(false)
  const mappingLoading = ref(false)
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
  const categoryNameMap = computed<Record<number, string>>(() => {
    return complianceCategories.value.reduce<Record<number, string>>((acc, category) => {
      acc[category.id] = category.name
      return acc
    }, {})
  })

  const accreditationRequirementCategoryNames = computed<Record<string, Record<string, string[]>>>(
    () => {
      const namesByAccreditation: Record<string, Record<string, string[]>> = {}

      for (const [accreditation, requirementMap] of Object.entries(
        requirementCategoryMappings.value,
      )) {
        namesByAccreditation[accreditation] = {}
        for (const [requirementKey, categoryIds] of Object.entries(requirementMap)) {
          const names = categoryIds
            .map((id) => categoryNameMap.value[id])
            .filter((name): name is string => Boolean(name))
          namesByAccreditation[accreditation][requirementKey] = names
        }
      }

      return namesByAccreditation
    },
  )

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

      await Promise.all([fetchComplianceCategories(force), fetchRequirementCategoryMappings(force)])

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

  async function fetchComplianceCategories(force = false) {
    if (accreditationInitialized.value && !force && complianceCategories.value.length > 0) return

    try {
      const { data, error: err } = await supabase
        .from('catergories')
        .select('id, name')
        .order('id', { ascending: true })

      if (err) throw err

      complianceCategories.value = (data ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        name: String(row.name ?? '').trim(),
      }))
    } catch (error: unknown) {
      if (isMissingTableError(error)) {
        complianceCategories.value = []
        return
      }
      throw error
    }
  }

  async function fetchRequirementCategoryMappings(force = false) {
    if (
      accreditationInitialized.value &&
      !force &&
      Object.keys(requirementCategoryMappings.value).length
    )
      return

    mappingLoading.value = true
    try {
      const { data, error: err } = await supabase
        .from('compliance_requirement_categories')
        .select('accreditation_name, requirement_key, category_id')
        .order('accreditation_name', { ascending: true })
        .order('requirement_key', { ascending: true })
        .order('category_id', { ascending: true })

      if (err) throw err

      const nextMappings: Record<string, Record<string, number[]>> = {}
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const accreditation = String(row.accreditation_name ?? '').trim()
        const requirementKey = String(row.requirement_key ?? '').trim()
        const categoryId = Number(row.category_id)

        if (!accreditation || !requirementKey || !Number.isInteger(categoryId) || categoryId <= 0)
          continue

        if (!nextMappings[accreditation]) nextMappings[accreditation] = {}
        const existing = nextMappings[accreditation][requirementKey] ?? []
        nextMappings[accreditation][requirementKey] = normalizeNumberArray([
          ...existing,
          categoryId,
        ])
      }

      requirementCategoryMappings.value = nextMappings
    } catch (error: unknown) {
      if (isMissingTableError(error)) {
        requirementCategoryMappings.value = {}
        return
      }
      throw error
    } finally {
      mappingLoading.value = false
    }
  }

  async function upsertCategory(
    category: ComplianceCategory,
  ): Promise<{ success: boolean; error?: string }> {
    const id = Number(category.id)
    const name = category.name.trim()

    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, error: 'Category number must be a positive integer' }
    }
    if (!name) {
      return { success: false, error: 'Category name is required' }
    }

    try {
      const { error: err } = await supabase.from('catergories').upsert({ id, name })
      if (err) throw err
      await fetchComplianceCategories(true)
      return { success: true }
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to save category',
      }
    }
  }

  async function deleteCategory(id: number): Promise<{ success: boolean; error?: string }> {
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, error: 'Category number must be a positive integer' }
    }

    try {
      const { error: err } = await supabase.from('catergories').delete().eq('id', id)
      if (err) throw err
      await Promise.all([fetchComplianceCategories(true), fetchRequirementCategoryMappings(true)])
      return { success: true }
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to delete category',
      }
    }
  }

  async function saveRequirementCategoryMapping(
    draft: RequirementCategoryDraft,
  ): Promise<{ success: boolean; error?: string }> {
    const accreditation = draft.accreditation.trim()
    const requirementKey = extractRequirementKey(draft.requirementKey)
    const categoryIds = normalizeNumberArray(draft.categoryIds)

    if (!accreditation) return { success: false, error: 'Accreditation is required' }
    if (!requirementKey) return { success: false, error: 'Requirement number is required' }
    if (!categoryIds.length) return { success: false, error: 'At least one category is required' }

    try {
      const { error: deleteErr } = await supabase
        .from('compliance_requirement_categories')
        .delete()
        .eq('accreditation_name', accreditation)
        .eq('requirement_key', requirementKey)

      if (deleteErr) throw deleteErr

      const rows = categoryIds.map((categoryId) => ({
        accreditation_name: accreditation,
        requirement_key: requirementKey,
        category_id: categoryId,
      }))
      const { error: insertErr } = await supabase
        .from('compliance_requirement_categories')
        .insert(rows)
      if (insertErr) throw insertErr

      await fetchRequirementCategoryMappings(true)
      return { success: true }
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to save requirement mapping',
      }
    }
  }

  async function removeRequirementCategoryMapping(
    accreditation: string,
    requirementKey: string,
  ): Promise<{ success: boolean; error?: string }> {
    const normalizedAccreditation = accreditation.trim()
    const normalizedRequirementKey = extractRequirementKey(requirementKey)

    if (!normalizedAccreditation || !normalizedRequirementKey) {
      return { success: false, error: 'Accreditation and requirement number are required' }
    }

    try {
      const { error: err } = await supabase
        .from('compliance_requirement_categories')
        .delete()
        .eq('accreditation_name', normalizedAccreditation)
        .eq('requirement_key', normalizedRequirementKey)
      if (err) throw err
      await fetchRequirementCategoryMappings(true)
      return { success: true }
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to delete requirement mapping',
      }
    }
  }

  async function replaceRequirementCategoryMappings(
    accreditation: string,
    mappings: Record<string, number[]>,
  ): Promise<{ success: boolean; error?: string }> {
    const normalizedAccreditation = accreditation.trim()
    if (!normalizedAccreditation) {
      return { success: false, error: 'Accreditation is required' }
    }

    try {
      const { error: deleteErr } = await supabase
        .from('compliance_requirement_categories')
        .delete()
        .eq('accreditation_name', normalizedAccreditation)
      if (deleteErr) throw deleteErr

      const payload = Object.entries(mappings).flatMap(([rawRequirementKey, rawCategoryIds]) => {
        const requirementKey = extractRequirementKey(rawRequirementKey)
        if (!requirementKey) return []
        const categoryIds = normalizeNumberArray(rawCategoryIds)

        return categoryIds.map((categoryId) => ({
          accreditation_name: normalizedAccreditation,
          requirement_key: requirementKey,
          category_id: categoryId,
        }))
      })

      if (payload.length > 0) {
        const { error: insertErr } = await supabase
          .from('compliance_requirement_categories')
          .insert(payload)
        if (insertErr) throw insertErr
      }

      await fetchRequirementCategoryMappings(true)
      return { success: true }
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to replace requirement mappings',
      }
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
    complianceCategories,
    requirementCategoryMappings,
    loading,
    accreditationLoading,
    mappingLoading,
    saving,
    initialized,
    accreditationInitialized,
    error,
    filterAccreditation,
    filterStatus,
    searchQuery,
    accreditationTypes,
    accreditationCriteriaMap,
    accreditationRequirementCategoryNames,
    filteredItems,
    metCount,
    pendingCount,
    notMetCount,
    approvedDocs,
    docsLoading,
    fetchAccreditations,
    fetchComplianceCategories,
    fetchRequirementCategoryMappings,
    addAccreditation,
    updateAccreditation,
    deleteAccreditation,
    upsertCategory,
    deleteCategory,
    saveRequirementCategoryMapping,
    removeRequirementCategoryMapping,
    replaceRequirementCategoryMappings,
    fetchItems,
    addItem,
    updateItem,
    updateStatus,
    deleteItem,
    fetchApprovedDocs,
  }
})
