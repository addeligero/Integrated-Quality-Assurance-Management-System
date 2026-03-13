<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { CheckCircle, Plus, Trash2, ChevronRight, Search } from 'lucide-vue-next'
import {
  useComplianceStore,
  ACCREDITATION_TYPES,
  ACCREDITATION_CRITERIA,
  emptyDraft,
} from '@/stores/compliance'
import type { ComplianceItem, ComplianceDraft, AccreditationType } from '@/stores/compliance'

const emit = defineEmits<{
  saved: [message: string]
  error: [message: string]
}>()

const complianceStore = useComplianceStore()
const { saving, approvedDocs, docsLoading } = storeToRefs(complianceStore)

// ── Dialog state ──────────────────────────────────────────────────────────────

const addDialog = ref(false)
const dialogStep = ref<1 | 2>(1)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const draft = ref<ComplianceDraft>(emptyDraft())
const dialogError = ref('')

// ── Criteria ──────────────────────────────────────────────────────────────────

const availableCriteria = computed(() =>
  draft.value.accreditation
    ? (ACCREDITATION_CRITERIA[draft.value.accreditation as AccreditationType] ?? [])
    : [],
)

// Clear criteria when accreditation type changes
watch(
  () => draft.value.accreditation,
  () => {
    draft.value.requirements = []
  },
)

function toggleCriteria(crit: string) {
  const idx = draft.value.requirements.indexOf(crit)
  if (idx === -1) draft.value.requirements.push(crit)
  else draft.value.requirements.splice(idx, 1)
}

// ── Public API (via template ref) ─────────────────────────────────────────────

function openAdd() {
  isEditing.value = false
  editingId.value = null
  draft.value = emptyDraft()
  dialogError.value = ''
  dialogStep.value = 1
  addDialog.value = true
}

function openEdit(item: ComplianceItem) {
  isEditing.value = true
  editingId.value = item.id
  // Save these before assignment so we can restore after the accreditation
  // watcher fires and clears requirements
  const savedRequirements = [...item.requirements]
  const savedDocIds = item.supporting_documents.map((d) => d.id)
  draft.value = {
    accreditation: item.accreditation,
    requirements: savedRequirements,
    description: item.description,
    mandatory: item.mandatory.length ? [...item.mandatory] : [''],
    enhancement: item.enhancement.length ? [...item.enhancement] : [''],
    supportingDocIds: savedDocIds,
  }
  // The watch on accreditation clears requirements synchronously after the
  // assignment above; restore them on the next tick
  nextTick(() => {
    draft.value.requirements = savedRequirements
    draft.value.supportingDocIds = savedDocIds
  })
  dialogError.value = ''
  dialogStep.value = 1
  addDialog.value = true
}

defineExpose({ openAdd, openEdit })

// ── Mandatory helpers ─────────────────────────────────────────────────────────

function addMandatory() {
  draft.value.mandatory.push('')
}
function removeMandatory(idx: number) {
  if (draft.value.mandatory.length > 1) draft.value.mandatory.splice(idx, 1)
}

// ── Enhancement helpers ───────────────────────────────────────────────────────

function addEnhancement() {
  draft.value.enhancement.push('')
}
function removeEnhancement(idx: number) {
  if (draft.value.enhancement.length > 1) draft.value.enhancement.splice(idx, 1)
}

// ── Step navigation ───────────────────────────────────────────────────────────

async function goToStep2() {
  dialogError.value = ''
  await complianceStore.fetchApprovedDocs()
  dialogStep.value = 2
}

function backToStep1() {
  dialogStep.value = 1
  dialogError.value = ''
}

// ── Step 2 — document search ─────────────────────────────────────────────────

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

// ── Save ──────────────────────────────────────────────────────────────────────

async function handleSave() {
  dialogError.value = ''
  const res = isEditing.value
    ? await complianceStore.updateItem(editingId.value!, draft.value)
    : await complianceStore.addItem(draft.value)

  if (res.success) {
    addDialog.value = false
    emit('saved', isEditing.value ? 'Compliance item updated' : 'Compliance item added')
  } else {
    dialogError.value = res.error ?? 'Failed to save'
    emit('error', res.error ?? 'Failed to save')
  }
}
</script>

<template>
  <v-dialog v-model="addDialog" max-width="640" rounded="xl" scrollable>
    <v-card rounded="xl">
      <!-- Header -->
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
        <!-- Step indicator dots -->
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

          <!-- ISO text input (no predefined criteria) -->
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
              <div v-for="(_, idx) in draft.enhancement" :key="idx" class="d-flex align-start ga-2">
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
            Search and select approved documents from the repository to link as supporting evidence.
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
          :disabled="false"
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
</template>

<style scoped>
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
.doc-list {
  border: 1px solid rgba(0, 0, 0, 0.12);
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
