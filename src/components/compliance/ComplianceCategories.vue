<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import * as XLSX from 'xlsx'
import { Upload, Save } from 'lucide-vue-next'
import {
  useComplianceStore,
  extractRequirementKey,
  type ComplianceCategory,
} from '@/stores/compliance'

const emit = defineEmits<{
  saved: [message: string]
  error: [message: string]
}>()

const complianceStore = useComplianceStore()
const {
  accreditationTypes,
  accreditationCriteriaMap,
  complianceCategories,
  requirementCategoryMappings,
} = storeToRefs(complianceStore)

const categoryForm = ref<ComplianceCategory>({
  id: 1,
  name: '',
})
const editingCategoryId = ref<number | null>(null)
const categorySaving = ref(false)

const mappingAccreditation = ref('')
const mappingDraft = ref<Record<string, number[]>>({})
const mappingSaving = ref(false)
const importLoading = ref(false)
const inputLoading = ref(false)
const categoriesInput = ref('')
const mappingsInput = ref('')

const sampleCategoryRows = [
  { no: 1, name: 'VMGO' },
  { no: 2, name: 'Program Educational Objectives (PEO)' },
  { no: 3, name: 'Program Outcomes (PO)' },
  { no: 4, name: 'Faculty' },
  { no: 5, name: 'Curriculum' },
  { no: 6, name: 'Instruction' },
  { no: 7, name: 'Students' },
  { no: 8, name: 'Research' },
]

const sampleMappingRows = [
  { categories: '1', aaccup: '1', picab: '2', coe: '1, 8' },
  { categories: '4', aaccup: '2', picab: '7, 5', coe: '2' },
  { categories: '5, 6', aaccup: '3', picab: '5', coe: '3' },
  { categories: '8', aaccup: '5', picab: '10', coe: '4' },
]

const categoryOptions = computed(() =>
  complianceCategories.value.map((category) => ({
    title: `${category.id}. ${category.name}`,
    value: category.id,
  })),
)

const requirementRows = computed(() => {
  const accreditation = mappingAccreditation.value
  if (!accreditation) return []

  const requirements = accreditationCriteriaMap.value[accreditation] ?? []
  return requirements.map((requirement) => ({
    label: requirement,
    key: extractRequirementKey(requirement) || requirement.trim(),
  }))
})

function parseNumberList(raw: string | number | null | undefined): number[] {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Number.isInteger(raw) ? [raw] : [Math.trunc(raw)]
  }
  const text = String(raw ?? '').trim()
  if (!text) return []
  return Array.from(new Set((text.match(/\d+/g) ?? []).map((token) => Number(token)))).filter(
    (value) => Number.isInteger(value) && value > 0,
  )
}

function resetCategoryForm() {
  const lastCategory =
    complianceCategories.value.length > 0
      ? complianceCategories.value[complianceCategories.value.length - 1]
      : null

  editingCategoryId.value = null
  categoryForm.value = {
    id: lastCategory ? lastCategory.id + 1 : 1,
    name: '',
  }
}

function editCategory(category: ComplianceCategory) {
  editingCategoryId.value = category.id
  categoryForm.value = {
    id: category.id,
    name: category.name,
  }
}

async function saveCategory() {
  categorySaving.value = true
  const response = await complianceStore.upsertCategory(categoryForm.value)
  categorySaving.value = false

  if (!response.success) {
    emit('error', response.error ?? 'Failed to save category')
    return
  }

  emit('saved', editingCategoryId.value ? 'Category updated' : 'Category added')
  resetCategoryForm()
}

async function removeCategory(categoryId: number) {
  const confirmed = window.confirm(`Delete category ${categoryId}?`)
  if (!confirmed) return

  const response = await complianceStore.deleteCategory(categoryId)
  if (!response.success) {
    emit('error', response.error ?? 'Failed to delete category')
    return
  }

  emit('saved', 'Category deleted')
  if (editingCategoryId.value === categoryId) {
    resetCategoryForm()
  }
}

function loadMappingDraft(accreditation: string) {
  if (!accreditation) {
    mappingDraft.value = {}
    return
  }

  const existing = requirementCategoryMappings.value[accreditation] ?? {}
  const nextDraft: Record<string, number[]> = {}

  for (const requirement of accreditationCriteriaMap.value[accreditation] ?? []) {
    const requirementKey = extractRequirementKey(requirement)
    if (!requirementKey) continue
    nextDraft[requirementKey] = [...(existing[requirementKey] ?? [])]
  }

  mappingDraft.value = nextDraft
}

watch(mappingAccreditation, (value) => {
  loadMappingDraft(value)
})

async function saveAccreditationMappings() {
  if (!mappingAccreditation.value) {
    emit('error', 'Select an accreditation first')
    return
  }

  mappingSaving.value = true
  const response = await complianceStore.replaceRequirementCategoryMappings(
    mappingAccreditation.value,
    mappingDraft.value,
  )
  mappingSaving.value = false

  if (!response.success) {
    emit('error', response.error ?? 'Failed to save mappings')
    return
  }

  emit('saved', `Mappings updated for ${mappingAccreditation.value}`)
}

function normalizeName(input: string): string {
  return input
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function resolveAccreditationName(headerValue: string): string | null {
  const cleanHeader = headerValue.trim()
  if (!cleanHeader) return null

  const headerNormalized = normalizeName(cleanHeader)
  const exact = accreditationTypes.value.find((name) => normalizeName(name) === headerNormalized)
  if (exact) return exact

  const startsWith = accreditationTypes.value.find((name) =>
    headerNormalized.startsWith(normalizeName(name)),
  )
  if (startsWith) return startsWith

  const included = accreditationTypes.value.find((name) =>
    normalizeName(name).startsWith(headerNormalized),
  )
  return included ?? null
}

function parseWorkbookCategories(workbook: XLSX.WorkBook): ComplianceCategory[] {
  const categories = new Map<number, string>()

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    })

    for (const row of rows) {
      const id = Number(row[0])
      const name = String(row[1] ?? '').trim()
      if (!Number.isInteger(id) || id <= 0 || !name || !/[a-z]/i.test(name)) continue
      categories.set(id, name)
    }
  }

  return Array.from(categories.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, name]) => ({ id, name }))
}

function parseWorkbookMappings(workbook: XLSX.WorkBook): Record<string, Record<string, number[]>> {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    })

    if (rows.length < 2) continue

    const headerRow = rows[0]
    if (!headerRow) continue
    const headers = headerRow.map((value) => String(value ?? '').trim())
    if (headers.length < 2) continue
    if (normalizeName(headers[0] ?? '') !== 'categories') continue

    const resolvedAccreditations = headers
      .slice(1)
      .map((header) => resolveAccreditationName(header))
    const mapping: Record<string, Record<string, Set<number>>> = {}

    for (const row of rows.slice(1)) {
      const rowCategoryIds = parseNumberList(row[0])
      if (rowCategoryIds.length === 0) continue

      resolvedAccreditations.forEach((accreditation, index) => {
        if (!accreditation) return
        const requirementIds = parseNumberList(row[index + 1])
        if (requirementIds.length === 0) return

        if (!mapping[accreditation]) mapping[accreditation] = {}

        for (const requirementId of requirementIds) {
          const requirementKey = String(requirementId)
          if (!mapping[accreditation][requirementKey]) {
            mapping[accreditation][requirementKey] = new Set<number>()
          }
          const categorySet = mapping[accreditation][requirementKey]
          if (!categorySet) continue
          rowCategoryIds.forEach((categoryId) => {
            categorySet.add(categoryId)
          })
        }
      })
    }

    const normalized: Record<string, Record<string, number[]>> = {}
    for (const [accreditation, requirementMap] of Object.entries(mapping)) {
      normalized[accreditation] = {}
      for (const [requirementKey, categoryIds] of Object.entries(requirementMap)) {
        normalized[accreditation][requirementKey] = Array.from(categoryIds).sort((a, b) => a - b)
      }
    }

    return normalized
  }

  return {}
}

async function importFromWorkbook(file: File) {
  importLoading.value = true
  try {
    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: 'array' })

    const categories = parseWorkbookCategories(workbook)
    for (const category of categories) {
      const categoryResult = await complianceStore.upsertCategory(category)
      if (!categoryResult.success) {
        emit('error', categoryResult.error ?? 'Failed to import categories')
        importLoading.value = false
        return
      }
    }

    const mappings = parseWorkbookMappings(workbook)
    for (const [accreditation, requirementMap] of Object.entries(mappings)) {
      const mappingResult = await complianceStore.replaceRequirementCategoryMappings(
        accreditation,
        requirementMap,
      )
      if (!mappingResult.success) {
        emit('error', mappingResult.error ?? `Failed to import mappings for ${accreditation}`)
        importLoading.value = false
        return
      }
    }

    if (mappingAccreditation.value) {
      await complianceStore.fetchRequirementCategoryMappings(true)
      loadMappingDraft(mappingAccreditation.value)
    }

    emit('saved', 'Excel/CSV import completed')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : 'Failed to import workbook')
  } finally {
    importLoading.value = false
  }
}

function onImportFileSelected(file: File | File[] | null) {
  const selected = Array.isArray(file) ? file[0] : file
  const isFile = selected instanceof File
  const picked = isFile ? selected : null
  const input = document.activeElement as HTMLInputElement | null
  const clearInput = () => {
    if (input && input.tagName === 'INPUT') input.value = ''
  }

  const chosenFile = picked
  if (!chosenFile) {
    clearInput()
    return
  }

  void importFromWorkbook(chosenFile)
  clearInput()
}

function parseCategoriesInput(raw: string): ComplianceCategory[] {
  const text = raw.trim()
  if (!text) return []

  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) {
      const rows = parsed
        .map((entry): ComplianceCategory | null => {
          if (!entry || typeof entry !== 'object') return null
          const record = entry as Record<string, unknown>
          const id = Number(record.id)
          const name = String(record.name ?? '').trim()
          if (!Number.isInteger(id) || id <= 0 || !name) return null
          return { id, name }
        })
        .filter((row): row is ComplianceCategory => Boolean(row))
      return rows
    }

    if (parsed && typeof parsed === 'object') {
      const rows = Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]): ComplianceCategory | null => {
          const id = Number(key)
          const name = String(value ?? '').trim()
          if (!Number.isInteger(id) || id <= 0 || !name) return null
          return { id, name }
        })
        .filter((row): row is ComplianceCategory => Boolean(row))
      return rows
    }
  } catch {
    // Fall back to line parsing.
  }

  const numberedPattern = /^(\d+)\s*[\.)\-:]\s*(.+)$/
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): ComplianceCategory | null => {
      const match = line.match(numberedPattern)
      if (!match) return null
      const id = Number(match[1])
      const name = (match[2] ?? '').trim()
      if (!Number.isInteger(id) || id <= 0 || !name) return null
      return { id, name }
    })
    .filter((row): row is ComplianceCategory => Boolean(row))

  return rows
}

function parseMappingsInput(raw: string): Record<string, Record<string, number[]>> {
  const text = raw.trim()
  if (!text) return {}

  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const normalized: Record<string, Record<string, number[]>> = {}

  for (const [rawAccreditation, rawRequirementMap] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    const accreditation = resolveAccreditationName(rawAccreditation) ?? rawAccreditation.trim()
    if (!accreditation) continue
    if (
      !rawRequirementMap ||
      typeof rawRequirementMap !== 'object' ||
      Array.isArray(rawRequirementMap)
    ) {
      continue
    }

    const requirementMap: Record<string, number[]> = {}

    for (const [rawRequirementKey, rawCategoryValue] of Object.entries(
      rawRequirementMap as Record<string, unknown>,
    )) {
      const requirementKey = extractRequirementKey(String(rawRequirementKey))
      if (!requirementKey) continue

      const categories = Array.isArray(rawCategoryValue)
        ? parseNumberList(rawCategoryValue.join(','))
        : parseNumberList(String(rawCategoryValue ?? ''))
      if (categories.length === 0) continue

      requirementMap[requirementKey] = categories
    }

    if (Object.keys(requirementMap).length > 0) {
      normalized[accreditation] = requirementMap
    }
  }

  return normalized
}

async function importFromInput() {
  inputLoading.value = true
  try {
    const categories = parseCategoriesInput(categoriesInput.value)
    for (const category of categories) {
      const categoryResult = await complianceStore.upsertCategory(category)
      if (!categoryResult.success) {
        emit('error', categoryResult.error ?? 'Failed to import categories from input')
        return
      }
    }

    const mappings = parseMappingsInput(mappingsInput.value)
    for (const [accreditation, requirementMap] of Object.entries(mappings)) {
      const mappingResult = await complianceStore.replaceRequirementCategoryMappings(
        accreditation,
        requirementMap,
      )
      if (!mappingResult.success) {
        emit('error', mappingResult.error ?? `Failed to import mappings for ${accreditation}`)
        return
      }
    }

    if (mappingAccreditation.value) {
      await complianceStore.fetchRequirementCategoryMappings(true)
      loadMappingDraft(mappingAccreditation.value)
    }

    emit('saved', 'Text input import completed')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : 'Invalid input format')
  } finally {
    inputLoading.value = false
  }
}

onMounted(async () => {
  await complianceStore.fetchAccreditations()
  if (!mappingAccreditation.value && accreditationTypes.value.length > 0) {
    mappingAccreditation.value = accreditationTypes.value[0] ?? ''
  }
  if (categoryForm.value.name === '') {
    resetCategoryForm()
  }
})
</script>

<template>
  <div class="d-flex flex-column ga-6">
    <div>
      <p class="text-subtitle-2 font-weight-bold text-grey-darken-3 mb-2">Category Dictionary</p>
      <p class="text-caption text-grey-darken-1 mb-3">
        Manage numbered categories used by compliance filtering (example: 1. VMGO).
      </p>

      <v-row dense>
        <v-col cols="12" sm="3">
          <v-text-field
            v-model.number="categoryForm.id"
            type="number"
            min="1"
            label="Category No."
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model="categoryForm.name"
            label="Category Name"
            placeholder="VMGO"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="3" class="d-flex ga-2">
          <v-btn
            color="deep-orange-darken-2"
            rounded="lg"
            class="text-none"
            :loading="categorySaving"
            :disabled="categorySaving"
            @click="saveCategory"
          >
            {{ editingCategoryId ? 'Update' : 'Add' }}
          </v-btn>
          <v-btn
            v-if="editingCategoryId"
            variant="text"
            rounded="lg"
            class="text-none"
            @click="resetCategoryForm"
          >
            Cancel
          </v-btn>
        </v-col>
      </v-row>

      <v-table density="compact" class="mt-3">
        <thead>
          <tr>
            <th style="width: 90px">No.</th>
            <th>Name</th>
            <th style="width: 140px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="complianceCategories.length === 0">
            <td colspan="3" class="text-grey">No categories yet.</td>
          </tr>
          <tr v-for="category in complianceCategories" :key="category.id">
            <td>{{ category.id }}</td>
            <td>{{ category.name }}</td>
            <td>
              <div class="d-flex ga-1">
                <v-btn
                  size="small"
                  variant="text"
                  color="deep-orange-darken-2"
                  @click="editCategory(category)"
                >
                  Edit
                </v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  color="error"
                  @click="removeCategory(category.id)"
                >
                  Delete
                </v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <v-divider />

    <div>
      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
        <div>
          <p class="text-subtitle-2 font-weight-bold text-grey-darken-3">Requirement Mapping</p>
          <p class="text-caption text-grey-darken-1">
            Assign each requirement number to one or more categories.
          </p>
        </div>

        <v-file-input
          accept=".xlsx,.xls,.csv"
          label="Import Excel/CSV"
          prepend-icon=""
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          style="max-width: 260px"
          :loading="importLoading"
          @update:model-value="onImportFileSelected"
        >
          <template #prepend-inner>
            <Upload :size="16" class="text-grey" />
          </template>
        </v-file-input>
      </div>

      <v-expansion-panels variant="accordion" class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>Paste Input / Code Import</v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row dense>
              <v-col cols="12" md="6">
                <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
                  Categories Input
                </label>
                <v-textarea
                  v-model="categoriesInput"
                  rows="6"
                  auto-grow
                  variant="outlined"
                  density="compact"
                  rounded="lg"
                  placeholder="1. VMGO&#10;2. Program Educational Objectives (PEO)&#10;3. Program Outcomes (PO)"
                />
              </v-col>
              <v-col cols="12" md="6">
                <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
                  Mapping JSON Input
                </label>
                <v-textarea
                  v-model="mappingsInput"
                  rows="6"
                  auto-grow
                  variant="outlined"
                  density="compact"
                  rounded="lg"
                  placeholder='{"AACCUP":{"1":[2],"2":[4]},"PICAB":{"2":[1],"7":[4],"5":[4]},"COE":{"1":[1],"8":[1],"2":[4]}}'
                />
              </v-col>
            </v-row>
            <div class="d-flex justify-end mt-2">
              <v-btn
                color="deep-orange-darken-2"
                rounded="lg"
                class="text-none"
                :loading="inputLoading"
                :disabled="inputLoading"
                @click="importFromInput"
              >
                Apply Input Import
              </v-btn>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <v-select
        v-model="mappingAccreditation"
        :items="accreditationTypes"
        label="Accreditation"
        placeholder="Select accreditation"
        variant="outlined"
        density="compact"
        rounded="lg"
        hide-details
        class="mb-3"
      />

      <v-table density="compact">
        <thead>
          <tr>
            <th style="width: 140px">Req No.</th>
            <th>Requirement</th>
            <th style="min-width: 280px">Mapped Categories</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!mappingAccreditation">
            <td colspan="3" class="text-grey">Select an accreditation to configure mappings.</td>
          </tr>
          <tr v-else-if="requirementRows.length === 0">
            <td colspan="3" class="text-grey">No requirements found for this accreditation.</td>
          </tr>
          <tr
            v-for="row in requirementRows"
            :key="`${mappingAccreditation}-${row.key}-${row.label}`"
          >
            <td>{{ row.key || '-' }}</td>
            <td>{{ row.label }}</td>
            <td>
              <v-select
                v-model="mappingDraft[row.key]"
                :items="categoryOptions"
                item-title="title"
                item-value="value"
                chips
                multiple
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
              />
            </td>
          </tr>
        </tbody>
      </v-table>

      <div class="d-flex justify-end mt-3">
        <v-btn
          color="deep-orange-darken-2"
          rounded="lg"
          class="text-none"
          :loading="mappingSaving"
          :disabled="mappingSaving || !mappingAccreditation"
          @click="saveAccreditationMappings"
        >
          <template #prepend><Save :size="14" /></template>
          Save Mappings
        </v-btn>
      </div>
    </div>

    <v-alert variant="tonal" density="compact" rounded="lg" type="info">
      Excel import format:
      <strong>Sheet with first header "CATEGORIES"</strong> and accreditation columns (AACCUP,
      PICAB, COE, etc.), where each row maps category IDs to requirement numbers.
    </v-alert>
    <v-alert variant="tonal" density="compact" rounded="lg" type="info">
      Your two-file workflow is supported:
      <strong
        >import List of Categories first, then import Accreditations requirements mapping
        file</strong
      >. PDF files are treated as reference examples; import should use Excel/CSV or pasted input.
    </v-alert>

    <v-expansion-panels variant="accordion">
      <v-expansion-panel>
        <v-expansion-panel-title>Example Excel Input Guide</v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="text-body-2 text-grey-darken-2 mb-2">
            Step 1: Upload a categories sheet using this structure.
          </p>
          <v-table density="compact" class="mb-4">
            <thead>
              <tr>
                <th style="width: 120px">A</th>
                <th>B</th>
              </tr>
              <tr>
                <th>No.</th>
                <th>LIST OF FINAL CATEGORIES</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in sampleCategoryRows" :key="`cat-${row.no}`">
                <td>{{ row.no }}</td>
                <td>{{ row.name }}</td>
              </tr>
            </tbody>
          </v-table>

          <p class="text-body-2 text-grey-darken-2 mb-2">
            Step 2: Upload the mapping sheet where each row maps CATEGORY number(s) to requirement
            number(s).
          </p>
          <v-table density="compact">
            <thead>
              <tr>
                <th>CATEGORIES</th>
                <th>AACCUP (AREA)</th>
                <th>PICAB (CRITERIA)</th>
                <th>COE</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in sampleMappingRows" :key="`map-${idx}`">
                <td>{{ row.categories }}</td>
                <td>{{ row.aaccup }}</td>
                <td>{{ row.picab }}</td>
                <td>{{ row.coe }}</td>
              </tr>
            </tbody>
          </v-table>

          <p class="text-caption text-grey-darken-1 mt-3 mb-0">
            Notes: use numbers only in mapping cells (single or comma-separated). Example: "7, 5" or
            "1, 8".
          </p>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>
