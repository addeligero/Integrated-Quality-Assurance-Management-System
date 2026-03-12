<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'

defineOptions({ name: 'ComplianceMatrix' })
import {
  FileText,
  Download,
  Printer,
  CheckCircle,
  Clock,
  XCircle,
  Plus,
  Trash2,
  Edit,
  ChevronRight,
  Search,
  AlertTriangle,
} from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'
import {
  useComplianceStore,
  ACCREDITATION_TYPES,
  ACCREDITATION_CRITERIA,
  emptyDraft,
} from '@/stores/compliance'
import type {
  ComplianceItem,
  ComplianceDraft,
  AccreditationType,
  ComplianceStatus,
} from '@/stores/compliance'

// ── Stores ───────────────────────────────────────────────────────────────────
const userStore = useUserStore()
const canCustomize = computed(
  () =>
    userStore.user?.role === 'dean' ||
    userStore.user?.role === 'quams_coordinator' ||
    userStore.user?.role === 'admin',
)

const complianceStore = useComplianceStore()
const {
  filteredItems,
  loading,
  saving,
  filterAccreditation,
  filterStatus,
  searchQuery,
  metCount,
  pendingCount,
  notMetCount,
  approvedDocs,
  docsLoading,
} = storeToRefs(complianceStore)

onMounted(() => complianceStore.fetchItems())

const STATUS_OPTIONS: ComplianceStatus[] = ['met', 'pending', 'not_met']

function setFilterStatus(v: string) {
  filterStatus.value = v as ComplianceStatus | 'all'
}

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  ComplianceStatus,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  met: { label: 'Met', color: 'success', icon: CheckCircle },
  pending: { label: 'Pending', color: 'warning', icon: Clock },
  not_met: { label: 'Not Met', color: 'error', icon: XCircle },
}

function statusConfig(status: ComplianceStatus) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
}

// ── Snackbar ──────────────────────────────────────────────────────────────────
const snackbar = ref(false)
const snackbarMsg = ref('')
const snackbarColor = ref<'success' | 'error'>('success')
function showSnack(msg: string, color: 'success' | 'error' = 'success') {
  snackbarMsg.value = msg
  snackbarColor.value = color
  snackbar.value = true
}

// ── Delete confirm ────────────────────────────────────────────────────────────
const deleteDialog = ref(false)
const deleteTarget = ref<ComplianceItem | null>(null)
function openDeleteConfirm(item: ComplianceItem) {
  deleteTarget.value = item
  deleteDialog.value = true
}
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await complianceStore.deleteItem(deleteTarget.value.id)
  deleteDialog.value = false
  if (res.success) showSnack('Compliance item deleted')
  else showSnack(res.error ?? 'Delete failed', 'error')
}

// ── Status change ─────────────────────────────────────────────────────────────
async function changeStatus(item: ComplianceItem, status: ComplianceStatus) {
  try {
    await complianceStore.updateStatus(item.id, status)
  } catch {
    showSnack('Failed to update status', 'error')
  }
}

// ── View Details dialog ───────────────────────────────────────────────────────
const detailDialog = ref(false)
const detailItem = ref<ComplianceItem | null>(null)
function openDetail(item: ComplianceItem) {
  detailItem.value = item
  detailDialog.value = true
}

// ── Print / Export ────────────────────────────────────────────────────────────
function handlePrint() {
  window.print()
}
function handleExport() {
  const rows = [
    ['Accreditation', 'Requirements', 'Description', 'Status', 'Mandatory', 'Supporting Docs'],
    ...filteredItems.value.map((i) => [
      i.accreditation,
      i.requirements.join(' | '),
      i.description,
      statusConfig(i.status).label,
      i.mandatory.join(' | '),
      i.supporting_documents.map((d) => d.file_name).join(' | '),
    ]),
  ]
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'compliance-matrix.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Add / Edit Dialog (multi-step) ────────────────────────────────────────────
const addDialog = ref(false)
const dialogStep = ref<1 | 2>(1)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const draft = ref<ComplianceDraft>(emptyDraft())
const dialogError = ref('')

// criteria for selected accreditation
const availableCriteria = computed(() =>
  draft.value.accreditation
    ? (ACCREDITATION_CRITERIA[draft.value.accreditation as AccreditationType] ?? [])
    : [],
)

function handleEditFromDetail() {
  if (!detailItem.value) return
  detailDialog.value = false
  openEdit(detailItem.value)
}

function openEdit(item: ComplianceItem) {
  isEditing.value = true
  editingId.value = item.id
  draft.value = {
    accreditation: item.accreditation,
    requirements: [...item.requirements],
    description: item.description,
    mandatory: item.mandatory.length ? [...item.mandatory] : [''],
    enhancement: item.enhancement.length ? [...item.enhancement] : [''],
    supportingDocIds: item.supporting_documents.map((d) => d.id),
  }
  dialogError.value = ''
  dialogStep.value = 1
  addDialog.value = true
}

// reset criteria when accreditation changes
watch(
  () => draft.value.accreditation,
  () => {
    draft.value.requirements = []
  },
)

function openAdd() {
  isEditing.value = false
  editingId.value = null
  draft.value = emptyDraft()
  dialogError.value = ''
  dialogStep.value = 1
  addDialog.value = true
}

// Mandatory helpers
function addMandatory() {
  draft.value.mandatory.push('')
}
function removeMandatory(idx: number) {
  if (draft.value.mandatory.length > 1) draft.value.mandatory.splice(idx, 1)
}

// Enhancement helpers
function addEnhancement() {
  draft.value.enhancement.push('')
}
function removeEnhancement(idx: number) {
  if (draft.value.enhancement.length > 1) draft.value.enhancement.splice(idx, 1)
}

function toggleCriteria(crit: string) {
  const idx = draft.value.requirements.indexOf(crit)
  if (idx === -1) {
    draft.value.requirements.push(crit)
  } else {
    draft.value.requirements.splice(idx, 1)
  }
}

const step1Valid = computed(
  () =>
    draft.value.accreditation !== null &&
    draft.value.requirements.length > 0 &&
    draft.value.description.trim().length > 0 &&
    draft.value.mandatory.some((m) => m.trim().length > 0),
)

async function goToStep2() {
  dialogError.value = ''
  if (!step1Valid.value) {
    dialogError.value = 'Please fill in all required fields and select at least one requirement.'
    return
  }
  // load docs for step 2
  await complianceStore.fetchApprovedDocs()
  dialogStep.value = 2
}

function backToStep1() {
  dialogStep.value = 1
  dialogError.value = ''
}

// Step 2 — document search
const docSearch = ref('')
const docCategoryFilter = ref('all')

const docCategories = computed(() => {
  const cats = new Set(approvedDocs.value.map((d) => d.primary_category).filter(Boolean))
  return ['all', ...Array.from(cats)]
})

const filteredApprovedDocs = computed(() => {
  let list = approvedDocs.value
  if (docCategoryFilter.value !== 'all') {
    list = list.filter((d) => d.primary_category === docCategoryFilter.value)
  }
  if (docSearch.value.trim()) {
    const q = docSearch.value.toLowerCase()
    list = list.filter((d) => d.file_name.toLowerCase().includes(q))
  }
  return list
})

function toggleDoc(id: string) {
  const idx = draft.value.supportingDocIds.indexOf(id)
  if (idx === -1) draft.value.supportingDocIds.push(id)
  else draft.value.supportingDocIds.splice(idx, 1)
}

async function handleSave() {
  dialogError.value = ''
  const res = isEditing.value
    ? await complianceStore.updateItem(editingId.value!, draft.value)
    : await complianceStore.addItem(draft.value)

  if (res.success) {
    addDialog.value = false
    showSnack(isEditing.value ? 'Compliance item updated' : 'Compliance item added')
  } else {
    dialogError.value = res.error ?? 'Failed to save'
  }
}
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-6">
      <h1 class="text-h5 font-weight-bold text-grey-darken-3">Compliance Matrix</h1>
      <p class="text-body-2 text-grey-darken-1 mt-1">
        Track accreditation requirements and supporting documents
      </p>
    </div>

    <!-- View-only banner -->
    <v-alert
      v-if="!canCustomize"
      type="warning"
      variant="tonal"
      rounded="lg"
      class="mb-5"
      density="compact"
    >
      <template #prepend><AlertTriangle :size="18" /></template>
      <strong>View-Only Mode:</strong> Only the Dean and QuAMS Coordinator can add or edit
      compliance items.
    </v-alert>

    <!-- Stats row -->
    <v-row class="mb-5" dense>
      <v-col cols="6" sm="4" lg="2">
        <v-card rounded="lg" elevation="1">
          <v-card-text class="pa-4 text-center">
            <p class="text-h5 font-weight-bold text-success">{{ metCount }}</p>
            <p class="text-caption text-grey-darken-1">Met</p>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="4" lg="2">
        <v-card rounded="lg" elevation="1">
          <v-card-text class="pa-4 text-center">
            <p class="text-h5 font-weight-bold text-warning">{{ pendingCount }}</p>
            <p class="text-caption text-grey-darken-1">Pending</p>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="4" lg="2">
        <v-card rounded="lg" elevation="1">
          <v-card-text class="pa-4 text-center">
            <p class="text-h5 font-weight-bold text-error">{{ notMetCount }}</p>
            <p class="text-caption text-grey-darken-1">Not Met</p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filters + actions -->
    <v-card rounded="lg" elevation="1" class="mb-5">
      <v-card-text class="pa-5">
        <v-row align="center" dense>
          <!-- Search -->
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="searchQuery"
              placeholder="Search requirements…"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
            >
              <template #prepend-inner><Search :size="16" class="text-grey" /></template>
            </v-text-field>
          </v-col>

          <!-- Accreditation filter -->
          <v-col cols="12" sm="3">
            <v-select
              v-model="filterAccreditation"
              :items="[
                { title: 'All Accreditations', value: 'all' },
                ...ACCREDITATION_TYPES.map((t) => ({ title: t, value: t })),
              ]"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
            />
          </v-col>

          <!-- Status filter -->
          <v-col cols="12" sm="3">
            <div class="d-flex ga-2 flex-wrap">
              <v-btn
                v-for="opt in [
                  { value: 'all', label: 'All' },
                  { value: 'met', label: 'Met' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'not_met', label: 'Not Met' },
                ]"
                :key="opt.value"
                size="small"
                rounded="pill"
                :variant="filterStatus === opt.value ? 'flat' : 'outlined'"
                :color="
                  filterStatus === opt.value
                    ? opt.value === 'all'
                      ? 'deep-orange-darken-2'
                      : opt.value === 'met'
                        ? 'success'
                        : opt.value === 'pending'
                          ? 'warning'
                          : 'error'
                    : undefined
                "
                class="text-none"
                @click="setFilterStatus(opt.value)"
              >
                {{ opt.label }}
              </v-btn>
            </div>
          </v-col>

          <!-- Actions -->
          <v-col cols="12" sm="2" class="d-flex justify-end ga-2">
            <template v-if="!canCustomize">
              <v-tooltip text="Export CSV" location="top">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon variant="outlined" size="small" @click="handleExport">
                    <Download :size="16" />
                  </v-btn>
                </template>
              </v-tooltip>
              <v-tooltip text="Print" location="top">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon variant="outlined" size="small" @click="handlePrint">
                    <Printer :size="16" />
                  </v-btn>
                </template>
              </v-tooltip>
            </template>
            <v-btn
              v-if="canCustomize"
              color="deep-orange-darken-2"
              rounded="lg"
              elevation="1"
              class="text-none"
              @click="openAdd"
            >
              <template #prepend><Plus :size="16" /></template>
              Add Item
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Table -->
    <v-card rounded="lg" elevation="1">
      <div class="overflow-x-auto">
        <v-table>
          <thead>
            <tr class="bg-grey-lighten-4">
              <th class="text-grey-darken-2" style="min-width: 200px">Accreditation</th>
              <th class="text-grey-darken-2" style="min-width: 260px">Requirements</th>
              <th class="text-grey-darken-2">Description</th>
              <th class="text-grey-darken-2">Status</th>
              <th class="text-grey-darken-2">Supporting Docs</th>
              <th class="text-grey-darken-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            <!-- Loading -->
            <template v-if="loading">
              <tr v-for="i in 4" :key="i">
                <td colspan="6" class="pa-3">
                  <v-skeleton-loader type="text" />
                </td>
              </tr>
            </template>

            <!-- Empty -->
            <tr v-else-if="filteredItems.length === 0">
              <td colspan="6" class="text-center pa-10 text-grey-darken-1">
                No compliance items match the selected filters.
              </td>
            </tr>

            <!-- Rows -->
            <tr
              v-for="item in filteredItems"
              :key="item.id"
              class="hover-row"
              :class="{
                'row-met': item.status === 'met',
                'row-pending': item.status === 'pending',
                'row-not-met': item.status === 'not_met',
              }"
            >
              <!-- Accreditation chip -->
              <td class="py-3">
                <v-chip size="small" rounded="pill" variant="tonal" color="deep-orange-darken-2">
                  {{ item.accreditation }}
                </v-chip>
              </td>

              <!-- Requirements list -->
              <td class="py-3">
                <div class="d-flex flex-column ga-1">
                  <span
                    v-for="req in item.requirements"
                    :key="req"
                    class="text-body-2 text-grey-darken-2"
                  >
                    {{ req }}
                  </span>
                </div>
              </td>

              <!-- Description -->
              <td class="py-3 text-body-2 text-grey-darken-2" style="max-width: 240px">
                <span class="description-cell">{{ item.description }}</span>
              </td>

              <!-- Status -->
              <td class="py-3">
                <div class="d-flex align-center ga-1">
                  <component
                    :is="statusConfig(item.status).icon"
                    :size="16"
                    :class="`text-${statusConfig(item.status).color}`"
                  />
                  <span class="text-body-2" :class="`text-${statusConfig(item.status).color}`">
                    {{ statusConfig(item.status).label }}
                  </span>
                </div>
                <!-- Status change for admins -->
                <v-menu v-if="canCustomize" open-on-hover>
                  <template #activator="{ props }">
                    <span
                      v-bind="props"
                      class="text-caption text-grey text-decoration-underline cursor-pointer"
                    >
                      change
                    </span>
                  </template>
                  <v-list density="compact" rounded="lg">
                    <v-list-item
                      v-for="s in STATUS_OPTIONS"
                      :key="s"
                      :value="s"
                      @click="changeStatus(item, s)"
                    >
                      <template #prepend>
                        <component
                          :is="statusConfig(s).icon"
                          :size="14"
                          :class="`text-${statusConfig(s).color}`"
                        />
                      </template>
                      <v-list-item-title class="text-body-2">
                        {{ statusConfig(s).label }}
                      </v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>
              </td>

              <!-- Supporting docs -->
              <td class="py-3">
                <button
                  v-if="item.supporting_documents.length > 0"
                  class="text-deep-orange-darken-2 d-flex align-center ga-1 text-body-2"
                  @click="openDetail(item)"
                >
                  <FileText :size="14" />
                  {{ item.supporting_documents.length }} doc{{
                    item.supporting_documents.length !== 1 ? 's' : ''
                  }}
                </button>
                <span v-else class="text-body-2 text-grey">None</span>
              </td>

              <!-- Actions -->
              <td class="py-3">
                <div class="d-flex ga-1 align-center">
                  <v-tooltip text="View Details" location="top">
                    <template #activator="{ props }">
                      <v-btn
                        v-bind="props"
                        icon
                        variant="text"
                        size="small"
                        color="grey-darken-1"
                        @click="openDetail(item)"
                      >
                        <FileText :size="15" />
                      </v-btn>
                    </template>
                  </v-tooltip>
                  <template v-if="canCustomize">
                    <v-tooltip text="Edit" location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          variant="text"
                          size="small"
                          color="deep-orange-darken-2"
                          @click="openEdit(item)"
                        >
                          <Edit :size="15" />
                        </v-btn>
                      </template>
                    </v-tooltip>
                    <v-tooltip text="Delete" location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          variant="text"
                          size="small"
                          color="error"
                          @click="openDeleteConfirm(item)"
                        >
                          <Trash2 :size="15" />
                        </v-btn>
                      </template>
                    </v-tooltip>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </v-card>

    <!-- ── Add / Edit Dialog ─────────────────────────────────────────────────── -->
    <v-dialog v-model="addDialog" max-width="640" rounded="xl" scrollable>
      <v-card rounded="xl">
        <!-- dialog header -->
        <v-card-title class="d-flex align-center justify-space-between pa-5 pb-0">
          <div>
            <p class="text-subtitle-1 font-weight-bold text-grey-darken-3">
              {{ isEditing ? 'Edit Compliance Item' : 'Add Compliance Item' }}
            </p>
            <p class="text-caption text-grey-darken-1 mt-1">
              Step {{ dialogStep }} of 2 —
              {{ dialogStep === 1 ? 'Requirements & Details' : 'Supporting Documents' }}
            </p>
          </div>
          <!-- step indicator dots -->
          <div class="d-flex ga-2 align-center">
            <span
              v-for="s in [1, 2]"
              :key="s"
              class="step-dot"
              :class="{ active: dialogStep >= s }"
            />
          </div>
        </v-card-title>

        <v-divider class="mt-3" />

        <!-- ── Step 1 ── -->
        <v-card-text v-if="dialogStep === 1" class="pa-5">
          <div class="d-flex flex-column ga-4">
            <!-- Accreditation -->
            <div>
              <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
                Type of Accreditation <span class="text-error">*</span>
              </label>
              <v-select
                v-model="draft.accreditation"
                :items="ACCREDITATION_TYPES"
                placeholder="Select accreditation"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                color="deep-orange-darken-2"
              />
            </div>

            <!-- Criteria clickable boxes -->
            <div v-if="draft.accreditation && availableCriteria.length > 0">
              <div class="d-flex align-center justify-space-between mb-2">
                <label class="text-caption font-weight-bold text-grey-darken-3">
                  Requirements <span class="text-error">*</span>
                </label>
                <span class="text-caption text-grey">
                  {{ draft.requirements.length }} / {{ availableCriteria.length }} selected
                </span>
              </div>
              <div class="criteria-grid">
                <div
                  v-for="crit in availableCriteria"
                  :key="crit"
                  class="criteria-box"
                  :class="{ 'criteria-box--selected': draft.requirements.includes(crit) }"
                  role="checkbox"
                  :aria-checked="draft.requirements.includes(crit)"
                  tabindex="0"
                  @click="toggleCriteria(crit)"
                  @keydown.space.prevent="toggleCriteria(crit)"
                  @keydown.enter.prevent="toggleCriteria(crit)"
                >
                  <CheckCircle
                    v-if="draft.requirements.includes(crit)"
                    :size="14"
                    class="criteria-box__check"
                  />
                  <span class="criteria-box__label">{{ crit }}</span>
                </div>
              </div>
            </div>

            <!-- ISO placeholder -->
            <div v-else-if="draft.accreditation === 'ISO'">
              <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
                Requirements <span class="text-error">*</span>
              </label>
              <v-text-field
                v-model="draft.requirements[0]"
                placeholder="Enter ISO requirement (to be defined)"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                color="deep-orange-darken-2"
                @input="draft.requirements = [draft.requirements[0] ?? '']"
              />
            </div>

            <!-- Description -->
            <div>
              <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
                Description <span class="text-error">*</span>
              </label>
              <v-text-field
                v-model="draft.description"
                placeholder="Brief description of this compliance item"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                color="deep-orange-darken-2"
              />
            </div>

            <!-- Mandatory items -->
            <div>
              <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-2">
                Mandatory <span class="text-error">*</span>
              </label>
              <div class="d-flex flex-column ga-2">
                <div v-for="(_, idx) in draft.mandatory" :key="idx" class="d-flex align-start ga-2">
                  <span class="text-caption text-grey-darken-1 pt-2" style="min-width: 20px">
                    {{ idx + 1 }}.
                  </span>
                  <v-textarea
                    v-model="draft.mandatory[idx]"
                    :placeholder="`Mandatory item ${idx + 1}`"
                    variant="outlined"
                    density="compact"
                    rounded="lg"
                    hide-details
                    rows="2"
                    auto-grow
                    color="deep-orange-darken-2"
                    class="flex-grow-1"
                  />
                  <v-btn
                    v-if="draft.mandatory.length > 1"
                    icon
                    variant="text"
                    size="small"
                    color="error"
                    class="mt-1"
                    @click="removeMandatory(idx)"
                  >
                    <Trash2 :size="14" />
                  </v-btn>
                </div>
                <v-btn
                  variant="text"
                  color="deep-orange-darken-2"
                  size="small"
                  class="text-none align-self-start"
                  @click="addMandatory"
                >
                  <template #prepend><Plus :size="14" /></template>
                  Add Mandatory
                </v-btn>
              </div>
            </div>

            <!-- Enhancement items -->
            <div>
              <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-2">
                Enhancement
              </label>
              <div class="d-flex flex-column ga-2">
                <div
                  v-for="(_, idx) in draft.enhancement"
                  :key="idx"
                  class="d-flex align-start ga-2"
                >
                  <span class="text-caption text-grey-darken-1 pt-2" style="min-width: 20px">
                    {{ idx + 1 }}.
                  </span>
                  <v-textarea
                    v-model="draft.enhancement[idx]"
                    :placeholder="`Enhancement item ${idx + 1}`"
                    variant="outlined"
                    density="compact"
                    rounded="lg"
                    hide-details
                    rows="2"
                    auto-grow
                    color="deep-orange-darken-2"
                    class="flex-grow-1"
                  />
                  <v-btn
                    v-if="draft.enhancement.length > 1"
                    icon
                    variant="text"
                    size="small"
                    color="error"
                    class="mt-1"
                    @click="removeEnhancement(idx)"
                  >
                    <Trash2 :size="14" />
                  </v-btn>
                </div>
                <v-btn
                  variant="text"
                  color="deep-orange-darken-2"
                  size="small"
                  class="text-none align-self-start"
                  @click="addEnhancement"
                >
                  <template #prepend><Plus :size="14" /></template>
                  Add Enhancement
                </v-btn>
              </div>
            </div>

            <!-- Validation error -->
            <v-alert v-if="dialogError" type="error" variant="tonal" density="compact" rounded="lg">
              {{ dialogError }}
            </v-alert>
          </div>
        </v-card-text>

        <!-- ── Step 2 ── -->
        <v-card-text v-else-if="dialogStep === 2" class="pa-5">
          <div class="d-flex flex-column ga-4">
            <p class="text-body-2 text-grey-darken-2">
              Search and select approved documents from the repository to link as supporting
              evidence.
            </p>

            <!-- Search -->
            <v-text-field
              v-model="docSearch"
              placeholder="Search documents by filename…"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
            >
              <template #prepend-inner><Search :size="16" class="text-grey" /></template>
            </v-text-field>

            <!-- Category filter -->
            <v-select
              v-model="docCategoryFilter"
              :items="docCategories"
              label="Filter by Category"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
            />

            <!-- Document list -->
            <div v-if="docsLoading" class="py-4 text-center text-grey">Loading documents…</div>
            <v-card
              v-else
              variant="outlined"
              rounded="lg"
              class="doc-list pa-1"
              style="max-height: 320px; overflow-y: auto"
            >
              <div v-if="filteredApprovedDocs.length === 0" class="text-center pa-6 text-grey">
                No approved documents found.
              </div>
              <v-list density="compact" select-strategy="classic">
                <v-list-item
                  v-for="doc in filteredApprovedDocs"
                  :key="doc.id"
                  rounded="lg"
                  class="mb-1"
                  :active="draft.supportingDocIds.includes(doc.id)"
                  active-color="deep-orange-darken-2"
                  @click="toggleDoc(doc.id)"
                >
                  <template #prepend>
                    <v-checkbox-btn
                      :model-value="draft.supportingDocIds.includes(doc.id)"
                      color="deep-orange-darken-2"
                      density="compact"
                      hide-details
                    />
                  </template>
                  <v-list-item-title class="text-body-2">{{ doc.file_name }}</v-list-item-title>
                  <v-list-item-subtitle v-if="doc.primary_category" class="text-caption">
                    {{ doc.primary_category }}
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>

            <p class="text-caption text-grey-darken-1">
              {{ draft.supportingDocIds.length }} document(s) selected
            </p>

            <!-- Save error -->
            <v-alert v-if="dialogError" type="error" variant="tonal" density="compact" rounded="lg">
              {{ dialogError }}
            </v-alert>
          </div>
        </v-card-text>

        <v-divider />

        <!-- Dialog actions -->
        <v-card-actions class="pa-4 ga-2">
          <v-btn
            variant="text"
            rounded="lg"
            class="text-none"
            :disabled="saving"
            @click="dialogStep === 1 ? (addDialog = false) : backToStep1()"
          >
            {{ dialogStep === 1 ? 'Cancel' : 'Back' }}
          </v-btn>
          <v-spacer />
          <v-btn
            v-if="dialogStep === 1"
            color="deep-orange-darken-2"
            rounded="lg"
            elevation="1"
            class="text-none"
            :disabled="!step1Valid"
            @click="goToStep2"
          >
            <template #append><ChevronRight :size="16" /></template>
            Next
          </v-btn>
          <v-btn
            v-else
            color="deep-orange-darken-2"
            rounded="lg"
            elevation="1"
            class="text-none"
            :loading="saving"
            :disabled="saving"
            @click="handleSave"
          >
            {{ isEditing ? 'Save Changes' : 'Save Item' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── View Details Dialog ───────────────────────────────────────────────── -->
    <v-dialog v-model="detailDialog" max-width="560" rounded="xl" scrollable>
      <v-card v-if="detailItem" rounded="xl">
        <v-card-title class="pa-5 pb-3">
          <div class="d-flex align-center justify-space-between">
            <span class="text-subtitle-1 font-weight-bold">Compliance Details</span>
            <v-chip
              size="small"
              rounded="pill"
              variant="tonal"
              :color="statusConfig(detailItem.status).color"
            >
              <component :is="statusConfig(detailItem.status).icon" :size="12" class="mr-1" />
              {{ statusConfig(detailItem.status).label }}
            </v-chip>
          </div>
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-5">
          <div class="d-flex flex-column ga-4">
            <div>
              <p class="text-caption text-grey-darken-1 mb-1">Accreditation</p>
              <v-chip size="small" rounded="pill" variant="tonal" color="deep-orange-darken-2">
                {{ detailItem.accreditation }}
              </v-chip>
            </div>
            <div>
              <p class="text-caption text-grey-darken-1 mb-1">Requirements</p>
              <div class="d-flex flex-column ga-1">
                <p
                  v-for="r in detailItem.requirements"
                  :key="r"
                  class="text-body-2 text-grey-darken-3"
                >
                  • {{ r }}
                </p>
              </div>
            </div>
            <div>
              <p class="text-caption text-grey-darken-1 mb-1">Description</p>
              <p class="text-body-2 text-grey-darken-3">{{ detailItem.description }}</p>
            </div>
            <div v-if="detailItem.mandatory.length">
              <p class="text-caption text-grey-darken-1 mb-1">Mandatory</p>
              <ol class="pl-4">
                <li
                  v-for="(m, i) in detailItem.mandatory"
                  :key="i"
                  class="text-body-2 text-grey-darken-3 mb-1"
                >
                  {{ m }}
                </li>
              </ol>
            </div>
            <div v-if="detailItem.enhancement.some((e) => e.trim())">
              <p class="text-caption text-grey-darken-1 mb-1">Enhancement</p>
              <ol class="pl-4">
                <li
                  v-for="(e, i) in detailItem.enhancement.filter((x) => x.trim())"
                  :key="i"
                  class="text-body-2 text-grey-darken-3 mb-1"
                >
                  {{ e }}
                </li>
              </ol>
            </div>
            <div v-if="detailItem.supporting_documents.length">
              <p class="text-caption text-grey-darken-1 mb-2">Supporting Documents</p>
              <div class="d-flex flex-column ga-1">
                <div
                  v-for="doc in detailItem.supporting_documents"
                  :key="doc.id"
                  class="d-flex align-center ga-2 pa-2 bg-grey-lighten-4 rounded-lg"
                >
                  <FileText :size="14" class="text-grey-darken-1" />
                  <span class="text-body-2 text-grey-darken-3">{{ doc.file_name }}</span>
                  <v-chip
                    v-if="doc.primary_category"
                    size="x-small"
                    rounded="pill"
                    variant="tonal"
                    color="deep-orange"
                  >
                    {{ doc.primary_category }}
                  </v-chip>
                </div>
              </div>
            </div>
            <p v-else class="text-body-2 text-grey">No supporting documents linked.</p>
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" rounded="lg" class="text-none" @click="detailDialog = false">
            Close
          </v-btn>
          <v-btn
            v-if="canCustomize"
            color="deep-orange-darken-2"
            rounded="lg"
            elevation="1"
            class="text-none"
            @click="handleEditFromDetail"
          >
            <template #prepend><Edit :size="14" /></template>
            Edit
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Delete Confirm Dialog ─────────────────────────────────────────────── -->
    <v-dialog v-model="deleteDialog" max-width="380" rounded="xl">
      <v-card v-if="deleteTarget" rounded="xl" class="pa-6">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-2">
          Delete Compliance Item
        </v-card-title>
        <p class="text-body-2 text-grey-darken-2 mb-5">
          Are you sure you want to delete the compliance item for
          <strong>{{ deleteTarget.accreditation }}</strong
          >? This action cannot be undone.
        </p>
        <v-card-actions class="pa-0 ga-3">
          <v-spacer />
          <v-btn variant="text" rounded="lg" class="text-none" @click="deleteDialog = false">
            Cancel
          </v-btn>
          <v-btn color="error" rounded="lg" elevation="1" class="text-none" @click="confirmDelete">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Snackbar ──────────────────────────────────────────────────────────── -->
    <v-snackbar
      v-model="snackbar"
      :color="snackbarColor"
      rounded="lg"
      timeout="3000"
      location="bottom right"
    >
      {{ snackbarMsg }}
      <template #actions>
        <v-btn variant="text" @click="snackbar = false">Close</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<style scoped>
.hover-row:hover {
  background-color: rgba(0, 0, 0, 0.02);
}
.row-met {
  background-color: rgba(76, 175, 80, 0.04);
}
.row-pending {
  background-color: rgba(255, 193, 7, 0.05);
}
.row-not-met {
  background-color: rgba(244, 67, 54, 0.04);
}
.description-cell {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.doc-list {
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e0e0e0;
  transition: background 0.2s;
}
.step-dot.active {
  background: #e64a19;
}
.cursor-pointer {
  cursor: pointer;
}
.criteria-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
  padding-right: 4px;
}
.criteria-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1.5px solid #e0e0e0;
  background: #fafafa;
  cursor: pointer;
  user-select: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.criteria-box:hover {
  border-color: #bf360c;
  background: #fff3e0;
}
.criteria-box--selected {
  border-color: #e64a19;
  background: #fff3e0;
}
.criteria-box__check {
  color: #e64a19;
  flex-shrink: 0;
}
.criteria-box__label {
  font-size: 0.8125rem;
  line-height: 1.4;
  color: #212121;
}
.criteria-box--selected .criteria-box__label {
  font-weight: 600;
  color: #bf360c;
}
</style>
