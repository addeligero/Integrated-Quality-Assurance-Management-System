<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import {
  Users,
  UserCheck,
  Building2,
  ShieldCheck,
  UserPlus,
  Settings,
  UserX,
  AlertTriangle,
  KeyRound,
} from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'
import { useAdminStore, generateUsername } from '@/stores/admin'
import AdminDialog from '@/components/AdminDialog.vue'

// ── Stores ─────────────────────────────────────────────────────────────────
const userStore = useUserStore()
const { hasAdminAccess } = storeToRefs(userStore)

const adminStore = useAdminStore()
const {
  users,
  loading,
  saving,
  totalUsers,
  activeUsers,
  departmentCount,
  adminCount,
  twoFactorEnabled,
  sessionTimeoutMinutes,
} = storeToRefs(adminStore)

onMounted(() => {
  if (hasAdminAccess.value) {
    adminStore.fetchUsers()
    adminStore.fetchSettings()
  }
})

// ── Stats ───────────────────────────────────────────────────────────────────
const stats = computed(() => [
  {
    label: 'Total Users',
    value: totalUsers.value,
    icon: Users,
    color: 'deep-orange-darken-2',
  },
  {
    label: 'Active Users',
    value: activeUsers.value,
    icon: UserCheck,
    color: 'green-darken-2',
  },
  {
    label: 'Departments',
    value: departmentCount.value,
    icon: Building2,
    color: 'blue-darken-2',
  },
  {
    label: 'Administrators',
    value: adminCount.value,
    icon: ShieldCheck,
    color: 'deep-purple-darken-2',
  },
])

// ── Role helpers ────────────────────────────────────────────────────────────
const roleColorMap: Record<string, string> = {
  dean: 'deep-orange',
  quams_coordinator: 'deep-purple',
  associate_dean: 'blue',
  department: 'cyan',
  faculty: 'teal',
  staff: 'green',
  user: 'grey',
  admin: 'red',
}
function roleColor(role: string) {
  return roleColorMap[role] ?? 'grey'
}

// ── Search ──────────────────────────────────────────────────────────────────
const search = ref('')
const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(
    (u) =>
      `${u.extension ?? ''} ${u.f_name} ${u.l_name}`.toLowerCase().includes(q) ||
      (u.username ?? '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.is_taskforce ? 'taskforce' : '').includes(q) ||
      (u.department ?? '').toLowerCase().includes(q),
  )
})

// ── Add User dialog ─────────────────────────────────────────────────────────
const addDialog = ref(false)
const addForm = ref({
  extension: '',
  fullName: '',
  username: '',
  role: '',
  department: '',
  password: '',
  showPassword: false,
})
const addFormError = ref('')

// Auto-generate username whenever fullName changes
watch(
  () => addForm.value.fullName,
  (name) => {
    addForm.value.username = generateUsername(name)
  },
)

function openAddDialog() {
  addForm.value = {
    extension: '',
    fullName: '',
    username: '',
    role: '',
    department: '',
    password: 'Quams123',
    showPassword: false,
  }
  addFormError.value = ''
  addDialog.value = true
}

const addFormValid = computed(
  () =>
    addForm.value.fullName.trim().length > 0 &&
    addForm.value.username.trim().length > 0 &&
    addForm.value.role.length > 0 &&
    addForm.value.password.length >= 8,
)

async function handleAddUser() {
  addFormError.value = ''
  const result = await adminStore.addUser({
    fullName: addForm.value.fullName.trim(),
    extension: addForm.value.extension,
    username: addForm.value.username.trim().toLowerCase(),
    role: addForm.value.role,
    department: addForm.value.department.trim(),
    password: addForm.value.password,
  })
  if (result.success) {
    addDialog.value = false
  } else {
    addFormError.value = result.error ?? 'Failed to create user'
  }
}

// ── Edit Role dialog ─────────────────────────────────────────────────────────
const editDialog = ref(false)
const editTarget = ref<{ id: string; role: string; isTaskforce: boolean } | null>(null)
const editSaving = ref(false)

function openEditDialog(id: string, role: string, isTaskforce: boolean) {
  editTarget.value = { id, role, isTaskforce }
  editDialog.value = true
}

async function handleUpdateRole() {
  if (!editTarget.value) return
  editSaving.value = true
  try {
    await adminStore.updateUserAccess(
      editTarget.value.id,
      editTarget.value.role,
      editTarget.value.isTaskforce,
    )
    editDialog.value = false
  } catch {
    // ignore
  } finally {
    editSaving.value = false
  }
}

// ── Deactivate / Reactivate ──────────────────────────────────────────────────
const confirmDialog = ref(false)
const confirmTarget = ref<{ id: string; name: string; active: boolean } | null>(null)

function openConfirm(id: string, name: string, active: boolean) {
  confirmTarget.value = { id, name, active }
  confirmDialog.value = true
}

async function handleToggleStatus() {
  if (!confirmTarget.value) return
  if (confirmTarget.value.active) {
    await adminStore.deactivateUser(confirmTarget.value.id)
  } else {
    await adminStore.reactivateUser(confirmTarget.value.id)
  }
  confirmDialog.value = false
}

// ── Reset Password ───────────────────────────────────────────────────────────
const resetPasswordDialog = ref(false)
const resetPasswordTarget = ref<{ id: string; name: string } | null>(null)
const resetPasswordLoading = ref(false)

function openResetPassword(id: string, name: string) {
  resetPasswordTarget.value = { id, name }
  resetPasswordDialog.value = true
}

async function handleResetPassword() {
  if (!resetPasswordTarget.value) return
  resetPasswordLoading.value = true
  try {
    await adminStore.resetUserPassword(resetPasswordTarget.value.id)
    resetPasswordDialog.value = false
  } catch {
    // ignore
  } finally {
    resetPasswordLoading.value = false
  }
}

const resetAllPasswordsDialog = ref(false)
const resetAllLoading = ref(false)

async function handleResetAllPasswords() {
  resetAllLoading.value = true
  try {
    await adminStore.resetAllPasswords()
    resetAllPasswordsDialog.value = false
  } catch {
    // ignore
  } finally {
    resetAllLoading.value = false
  }
}

// ── Security settings ─────────────────────────
const sessionTimeoutOptions = [
  { title: '15 minutes', value: 15 },
  { title: '30 minutes', value: 30 },
  { title: '1 hour', value: 60 },
  { title: '4 hours', value: 240 },
]

function handleTwoFactorToggle(val: boolean | null) {
  adminStore.saveTwoFactorSetting(val ?? false)
}

function handleSessionTimeoutChange(val: number | null) {
  if (typeof val !== 'number') return
  adminStore.saveSessionTimeoutSetting(val)
}

// ── Role permissions definition ──────────────────────────────────────────────
const rolePermissions = [
  {
    role: 'QuAMS Coordinator',
    access: 'Full system access',
    badge: 'deep-purple',
  },
  {
    role: 'Dean',
    access: 'Upload documents, Validate documents, view repository, view/edit compliance matrix',
    badge: 'deep-orange',
  },

  {
    role: 'Associate Dean',
    access: 'Upload documents, Validate documents, view repository, view compliance matrix',
    badge: 'blue',
  },
  {
    role: 'Department Head',
    access: 'Upload documents, Validate documents, view repository, view compliance matrix',
    badge: 'cyan',
  },
  {
    role: 'Faculty',
    access: 'Upload documents, view repository, view compliance matrix',
    badge: 'teal',
  },
  {
    role: 'Staff',
    access: 'Upload documents, view repository, view compliance matrix',
    badge: 'green',
  },
  {
    role: 'Taskforce (Flag)',
    access:
      'Can edit and delete Compliance Matrix items while keeping their base role (e.g. Staff)',
    badge: 'indigo',
  },
]

// ── Document settings ────────────────────────────────────────────────────────
const docSettings = [
  { label: 'Allowed File Types', value: 'PDF, DOCX, JPG, PNG' },
  { label: 'Max File Size', value: '50 MB' },
  { label: 'OCR Language', value: 'English' },
  { label: 'Default Document Status', value: 'Pending Review' },
]
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-6">
      <h1 class="text-h5 font-weight-bold text-grey-darken-3">Administration</h1>
      <p class="text-body-2 text-grey-darken-1 mt-1">System configuration and user management</p>
    </div>

    <!-- Access Restricted -->
    <template v-if="!hasAdminAccess">
      <v-card variant="tonal" color="warning" rounded="lg" class="pa-6">
        <div class="d-flex align-start ga-4">
          <AlertTriangle :size="24" class="text-warning mt-1" />
          <div>
            <p class="text-subtitle-1 font-weight-bold mb-1">Access Restricted</p>
            <p class="text-body-2">
              Only the Dean and QuAMS Coordinator have full system configuration rights. Please
              contact an administrator if you need to make changes.
            </p>
          </div>
        </div>
      </v-card>
    </template>

    <template v-else>
      <!-- ── Stats Row ────────────────────────────────────────────────────── -->
      <v-row class="mb-6" dense>
        <v-col v-for="stat in stats" :key="stat.label" cols="12" sm="6" lg="3">
          <v-card rounded="lg" elevation="1" height="100%">
            <v-card-text class="pa-5">
              <div class="d-flex align-start justify-space-between">
                <div>
                  <p class="text-body-2 text-grey-darken-1 mb-1">{{ stat.label }}</p>
                  <p class="text-h5 font-weight-bold text-grey-darken-3">
                    <span v-if="loading" class="skeleton-line w-25 rounded d-block"></span>
                    <span v-else>{{ stat.value }}</span>
                  </p>
                </div>
                <v-avatar :color="stat.color" size="48" rounded="lg">
                  <component :is="stat.icon" :size="24" class="text-white" />
                </v-avatar>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- ── User Management ───────────────────────────────────────────────── -->
      <v-card rounded="lg" elevation="1" class="mb-6">
        <!-- Header -->
        <div class="d-flex align-center justify-space-between pa-5 border-b user-management-header">
          <h2 class="text-subtitle-1 font-weight-bold text-grey-darken-3">User Management</h2>
          <div class="d-flex align-center ga-3 user-management-controls">
            <v-text-field
              v-model="search"
              placeholder="Search users…"
              variant="outlined"
              density="compact"
              rounded="lg"
              class="user-search-field"
              hide-details
              color="deep-orange-darken-2"
            />
            <v-btn
              color="blue-darken-2"
              rounded="lg"
              class="text-none"
              elevation="1"
              @click="resetAllPasswordsDialog = true"
            >
              <template #prepend>
                <KeyRound :size="16" />
              </template>
              Reset All Passwords
            </v-btn>
            <v-btn
              color="deep-orange-darken-2"
              rounded="lg"
              class="text-none"
              elevation="1"
              @click="openAddDialog"
            >
              <template #prepend>
                <UserPlus :size="16" />
              </template>
              Add New User
            </v-btn>
          </div>
        </div>

        <!-- Table -->
        <div class="overflow-x-auto">
          <v-table>
            <thead>
              <tr class="bg-grey-lighten-4">
                <th class="text-grey-darken-2">Name</th>
                <th class="text-grey-darken-2">Username</th>
                <th class="text-grey-darken-2">Role</th>
                <th class="text-grey-darken-2">Department</th>
                <th class="text-grey-darken-2">Last Signed In</th>
                <th class="text-grey-darken-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              <!-- Loading skeleton -->
              <template v-if="loading">
                <tr v-for="i in 3" :key="i">
                  <td colspan="6" class="pa-3">
                    <v-skeleton-loader type="text" />
                  </td>
                </tr>
              </template>

              <!-- Empty state -->
              <tr v-else-if="filteredUsers.length === 0">
                <td colspan="6" class="text-center pa-8 text-grey-darken-1">No users found</td>
              </tr>

              <!-- Data rows -->
              <tr
                v-for="u in filteredUsers"
                :key="u.id"
                class="hover-row"
                :class="{ 'opacity-50': !u.status }"
              >
                <td class="py-3 text-grey-darken-3 font-weight-medium">
                  <span v-if="u.extension" class="text-grey-darken-1 mr-1">{{ u.extension }}</span>
                  {{ u.f_name }} {{ u.l_name }}
                </td>
                <td class="py-3 text-mono text-body-2 text-grey-darken-2">
                  {{ u.username ?? '—' }}
                </td>
                <td class="py-3">
                  <div class="d-flex flex-column ga-1 align-start">
                    <v-chip
                      :color="roleColor(u.role)"
                      size="small"
                      rounded="pill"
                      variant="tonal"
                      class="text-capitalize"
                    >
                      {{ adminStore.roleLabel(u.role) }}
                    </v-chip>
                    <v-chip
                      v-if="u.is_taskforce"
                      color="indigo"
                      size="x-small"
                      rounded="pill"
                      variant="outlined"
                    >
                      Taskforce
                    </v-chip>
                  </div>
                </td>
                <td class="py-3 text-body-2 text-grey-darken-2">{{ u.department ?? '—' }}</td>
                <td class="py-3 text-body-2 text-grey-darken-2">
                  <span v-if="u.last_sign_in_at">
                    {{
                      new Date(u.last_sign_in_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    }}
                  </span>
                  <span v-else class="text-grey">Never</span>
                </td>
                <td class="py-3">
                  <div class="d-flex align-center ga-1">
                    <v-tooltip text="Edit Role" location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          variant="text"
                          size="small"
                          color="grey-darken-1"
                          @click="openEditDialog(u.id, u.role, u.is_taskforce)"
                        >
                          <Settings :size="16" />
                        </v-btn>
                      </template>
                    </v-tooltip>
                    <v-tooltip text="Reset Password" location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          variant="text"
                          size="small"
                          color="blue-darken-2"
                          @click="
                            openResetPassword(
                              u.id,
                              `${u.extension ?? ''} ${u.f_name} ${u.l_name}`.trim(),
                            )
                          "
                        >
                          <KeyRound :size="16" />
                        </v-btn>
                      </template>
                    </v-tooltip>
                    <v-tooltip :text="u.status ? 'Deactivate' : 'Reactivate'" location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          variant="text"
                          size="small"
                          :color="u.status ? 'error' : 'success'"
                          @click="
                            openConfirm(
                              u.id,
                              `${u.extension ?? ''} ${u.f_name} ${u.l_name}`.trim(),
                              u.status,
                            )
                          "
                        >
                          <UserX :size="16" />
                        </v-btn>
                      </template>
                    </v-tooltip>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </v-card>

      <!-- ── Configuration Row ──────────────────────────────────────────────── -->
      <v-row class="mb-6" dense>
        <!-- Role & Permissions -->
        <v-col cols="12" lg="6">
          <v-card rounded="lg" elevation="1" height="100%">
            <div class="pa-5 border-b">
              <h3 class="text-subtitle-1 font-weight-bold text-grey-darken-3">
                Role & Permissions
              </h3>
            </div>
            <v-table density="compact">
              <thead>
                <tr class="bg-grey-lighten-4">
                  <th class="text-grey-darken-2" style="width: 180px">Role</th>
                  <th class="text-grey-darken-2">Access Level</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rp in rolePermissions" :key="rp.role">
                  <td class="py-3">
                    <v-chip :color="rp.badge" size="small" rounded="pill" variant="tonal">
                      {{ rp.role }}
                    </v-chip>
                  </td>
                  <td class="py-3 text-body-2 text-grey-darken-2">{{ rp.access }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-card>
        </v-col>

        <!-- Document Settings -->
        <v-col cols="12" lg="6">
          <v-card rounded="lg" elevation="1" class="pa-5" height="100%">
            <h3 class="text-subtitle-1 font-weight-bold text-grey-darken-3 mb-4">
              Document Settings
            </h3>
            <div class="d-flex flex-column ga-3">
              <div
                v-for="ds in docSettings"
                :key="ds.label"
                class="d-flex align-center justify-space-between pa-3 bg-grey-lighten-4 rounded-lg"
              >
                <span class="text-body-2 text-grey-darken-2">{{ ds.label }}</span>
                <span class="text-body-2 font-weight-medium text-grey-darken-3">{{
                  ds.value
                }}</span>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- ── Security & Access Control ───────────────────────────────────────── -->
      <v-card rounded="lg" elevation="1" class="pa-5">
        <h3 class="text-subtitle-1 font-weight-bold text-grey-darken-3 mb-4">
          Security & Access Control
        </h3>
        <div class="d-flex flex-column ga-3">
          <!-- Two-Factor Authentication -->
          <div class="d-flex align-center justify-space-between pa-4 bg-grey-lighten-4 rounded-lg">
            <div>
              <p class="text-body-2 font-weight-medium text-grey-darken-3 mb-1">
                Two-Factor Authentication
              </p>
              <p class="text-caption text-grey-darken-1">
                Require 2FA for all administrative users
              </p>
            </div>
            <v-switch
              :model-value="twoFactorEnabled"
              color="deep-orange-darken-2"
              hide-details
              density="compact"
              inset
              @update:model-value="handleTwoFactorToggle"
            />
          </div>

          <!-- Session Timeout -->
          <div
            class="d-flex align-center justify-space-between pa-4 bg-grey-lighten-4 rounded-lg session-timeout-row"
          >
            <div class="session-timeout-details">
              <p class="text-body-2 font-weight-medium text-grey-darken-3 mb-1">Session Timeout</p>
              <p class="text-caption text-grey-darken-1">Automatic logout after inactivity</p>
            </div>
            <v-select
              :model-value="sessionTimeoutMinutes"
              :items="sessionTimeoutOptions"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
              class="session-timeout-select"
              @update:model-value="handleSessionTimeoutChange"
            />
          </div>
        </div>
      </v-card>
    </template>

    <AdminDialog
      v-model:addDialog="addDialog"
      v-model:addForm="addForm"
      v-model:editDialog="editDialog"
      v-model:editTarget="editTarget"
      v-model:confirmDialog="confirmDialog"
      v-model:resetPasswordDialog="resetPasswordDialog"
      v-model:resetAllPasswordsDialog="resetAllPasswordsDialog"
      :add-form-error="addFormError"
      :saving="saving"
      :add-form-valid="addFormValid"
      :edit-saving="editSaving"
      :confirm-target="confirmTarget"
      :reset-password-target="resetPasswordTarget"
      :reset-password-loading="resetPasswordLoading"
      :total-users="totalUsers"
      :reset-all-loading="resetAllLoading"
      @add-user="handleAddUser"
      @update-role="handleUpdateRole"
      @toggle-status="handleToggleStatus"
      @reset-password="handleResetPassword"
      @reset-all-passwords="handleResetAllPasswords"
    />
  </div>
</template>

<style scoped>
.border-b {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.hover-row:hover {
  background-color: rgba(0, 0, 0, 0.02);
}
.text-mono {
  font-family: monospace;
}
.skeleton-line {
  height: 24px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f5f5f5 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
.w-25 {
  width: 25%;
}

.user-management-header {
  gap: 12px;
}

.user-management-controls {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.user-search-field {
  width: 220px;
}

.session-timeout-row {
  gap: 12px;
}

.session-timeout-details {
  min-width: 0;
}

.session-timeout-select {
  width: 160px;
}

@media (max-width: 959px) {
  .user-management-header {
    flex-direction: column;
    align-items: stretch !important;
  }

  .user-management-controls {
    justify-content: flex-start;
  }
}

@media (max-width: 599px) {
  .user-search-field,
  .session-timeout-select {
    width: 100%;
  }

  .session-timeout-row {
    flex-direction: column;
    align-items: stretch !important;
  }
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
