<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
  Edit,
  Search,
  AlertTriangle,
  Trash2,
  BookMarked,
} from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'
import { useComplianceStore } from '@/stores/compliance'
import type { ComplianceItem, ComplianceStatus, AccreditationDefinition } from '@/stores/compliance'
import ComplianceAddition from '@/components/ComplianceAddition.vue'

// Stores
const userStore = useUserStore()
const canCustomize = computed(
  () =>
    userStore.user?.is_taskforce === true ||
    userStore.user?.role === 'dean' ||
    userStore.user?.role === 'quams_coordinator' ||
    userStore.user?.role === 'admin',
)
const canManageAccreditations = computed(() => userStore.user?.role === 'quams_coordinator')

const complianceStore = useComplianceStore()
const {
  filteredItems,
  loading,
  accreditationLoading,
  accreditationTypes,
  accreditationDefinitions,
  filterAccreditation,
  filterStatus,
  searchQuery,
  metCount,
  pendingCount,
  notMetCount,
} = storeToRefs(complianceStore)

onMounted(async () => {
  await Promise.all([complianceStore.fetchAccreditations(), complianceStore.fetchItems()])
})

const STATUS_OPTIONS: ComplianceStatus[] = ['met', 'pending', 'not_met']

function setFilterStatus(v: string) {
  filterStatus.value = v as ComplianceStatus | 'all'
}

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

const snackbar = ref(false)
const snackbarMsg = ref('')
const snackbarColor = ref<'success' | 'error'>('success')
function showSnack(msg: string, color: 'success' | 'error' = 'success') {
  snackbarMsg.value = msg
  snackbarColor.value = color
  snackbar.value = true
}

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

async function changeStatus(item: ComplianceItem, status: ComplianceStatus) {
  try {
    await complianceStore.updateStatus(item.id, status)
  } catch {
    showSnack('Failed to update status', 'error')
  }
}

const detailDialog = ref(false)
const detailItem = ref<ComplianceItem | null>(null)
function openDetail(item: ComplianceItem) {
  detailItem.value = item
  detailDialog.value = true
}

const additionRef = ref<InstanceType<typeof ComplianceAddition>>()

function openAdd() {
  additionRef.value?.openAdd()
}

function openEdit(item: ComplianceItem) {
  additionRef.value?.openEdit(item)
}

function handleEditFromDetail() {
  if (!detailItem.value) return
  detailDialog.value = false
  additionRef.value?.openEdit(detailItem.value)
}

function handlePrint() {
  window.print()
}

function handleExport() {
  const rows = [
    ['Accreditation', 'Requirements', 'Remarks', 'Status', 'Mandatory', 'Supporting Docs'],
    ...filteredItems.value.map((i) => [
      i.accreditation,
      i.requirements.join(' | '),
      i.remarks,
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

const accreditationDialog = ref(false)
const accreditationForm = ref({
  name: '',
  requirementsText: '',
})
const accreditationEditingName = ref<string | null>(null)
const accreditationSaving = ref(false)

function resetAccreditationForm() {
  accreditationEditingName.value = null
  accreditationForm.value = {
    name: '',
    requirementsText: '',
  }
}

function openAccreditationDialog() {
  resetAccreditationForm()
  accreditationDialog.value = true
}

function editAccreditation(def: AccreditationDefinition) {
  accreditationEditingName.value = def.name
  accreditationForm.value = {
    name: def.name,
    requirementsText: def.requirements.join('\n'),
  }
}

async function saveAccreditation() {
  const requirements = accreditationForm.value.requirementsText
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)

  accreditationSaving.value = true
  const res = accreditationEditingName.value
    ? await complianceStore.updateAccreditation(accreditationEditingName.value, {
        name: accreditationForm.value.name,
        requirements,
      })
    : await complianceStore.addAccreditation({
        name: accreditationForm.value.name,
        requirements,
      })
  accreditationSaving.value = false

  if (!res.success) {
    showSnack(res.error ?? 'Failed to save accreditation', 'error')
    return
  }

  showSnack(accreditationEditingName.value ? 'Accreditation updated' : 'Accreditation added')
  resetAccreditationForm()
}

async function removeAccreditation(name: string) {
  const confirmed = window.confirm(`Delete accreditation "${name}"?`)
  if (!confirmed) return

  const res = await complianceStore.deleteAccreditation(name)
  if (!res.success) {
    showSnack(res.error ?? 'Failed to delete accreditation', 'error')
    return
  }

  showSnack('Accreditation deleted')
  if (accreditationEditingName.value === name) {
    resetAccreditationForm()
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
      <strong>View-Only Mode:</strong> Only users with Dean, QuAMS Coordinator, Admin, or Taskforce
      access can add, edit, or delete compliance items.
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
                ...accreditationTypes.map((t) => ({ title: t, value: t })),
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
          <v-col cols="12" sm="auto" class="d-flex justify-end ga-2 filter-actions">
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
              v-if="canManageAccreditations"
              variant="outlined"
              color="deep-orange-darken-2"
              rounded="lg"
              @click="openAccreditationDialog"
            >
              <template #prepend><BookMarked :size="16" /></template>
              Manage Accreditations
            </v-btn>
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
              <th class="text-grey-darken-2">Remarks</th>
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

              <!-- Remarks -->
              <td class="py-3 text-body-2 text-grey-darken-2" style="max-width: 240px">
                <span class="remarks-cell">{{ item.remarks }}</span>
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

    <!-- Add / Edit dialog extracted to ComplianceAddition component -->
    <ComplianceAddition
      ref="additionRef"
      @saved="showSnack($event)"
      @error="showSnack($event, 'error')"
    />

    <v-dialog v-model="accreditationDialog" max-width="820" rounded="xl" scrollable>
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-3 d-flex align-center justify-space-between">
          <span class="text-subtitle-1 font-weight-bold">Manage Accreditations</span>
          <v-chip size="small" variant="tonal" color="deep-orange-darken-2">
            {{ accreditationDefinitions.length }} total
          </v-chip>
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-5">
          <v-row dense>
            <v-col cols="12" md="5">
              <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
                Accreditation Name
              </label>
              <v-text-field
                v-model="accreditationForm.name"
                placeholder="e.g., AACCUP"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                color="deep-orange-darken-2"
              />
            </v-col>
            <v-col cols="12" md="7">
              <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
                Requirements (one per line)
              </label>
              <v-textarea
                v-model="accreditationForm.requirementsText"
                placeholder="Enter requirements, one per line"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                rows="5"
                auto-grow
                color="deep-orange-darken-2"
              />
            </v-col>
          </v-row>

          <div class="d-flex ga-2 mt-3">
            <v-btn
              color="deep-orange-darken-2"
              rounded="lg"
              class="text-none"
              :loading="accreditationSaving"
              :disabled="accreditationSaving"
              @click="saveAccreditation"
            >
              {{ accreditationEditingName ? 'Save Accreditation' : 'Add Accreditation' }}
            </v-btn>
            <v-btn
              v-if="accreditationEditingName"
              variant="text"
              rounded="lg"
              class="text-none"
              @click="resetAccreditationForm"
            >
              Cancel Edit
            </v-btn>
          </div>

          <v-divider class="my-4" />

          <div v-if="accreditationLoading" class="text-grey">Loading accreditations...</div>
          <v-table v-else density="compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Requirements</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="accreditationDefinitions.length === 0">
                <td colspan="3" class="text-grey">No accreditations found.</td>
              </tr>
              <tr v-for="def in accreditationDefinitions" :key="def.id">
                <td class="font-weight-medium">{{ def.name }}</td>
                <td>{{ def.requirements.length }}</td>
                <td>
                  <div class="d-flex ga-1">
                    <v-btn
                      size="small"
                      variant="text"
                      color="deep-orange-darken-2"
                      @click="editAccreditation(def)"
                    >
                      Edit
                    </v-btn>
                    <v-btn
                      size="small"
                      variant="text"
                      color="error"
                      @click="removeAccreditation(def.name)"
                    >
                      Delete
                    </v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" rounded="lg" class="text-none" @click="accreditationDialog = false">
            Close
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
              <p class="text-caption text-grey-darken-1 mb-1">Remarks</p>
              <p class="text-body-2 text-grey-darken-3">{{ detailItem.remarks }}</p>
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
.remarks-cell {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.doc-list {
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.cursor-pointer {
  cursor: pointer;
}

@media (max-width: 599px) {
  .filter-actions {
    justify-content: flex-start !important;
    flex-wrap: wrap;
  }
}
</style>
