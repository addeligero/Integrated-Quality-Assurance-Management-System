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
  Eye,
  EyeOff,
} from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'
import { useAdminStore, generateUsername, NAME_EXTENSIONS, ROLES } from '@/stores/admin'

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
    password: '',
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
const editTarget = ref<{ id: string; role: string } | null>(null)
const editSaving = ref(false)

function openEditDialog(id: string, role: string) {
  editTarget.value = { id, role }
  editDialog.value = true
}

async function handleUpdateRole() {
  if (!editTarget.value) return
  editSaving.value = true
  try {
    await adminStore.updateUserRole(editTarget.value.id, editTarget.value.role)
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

// ── Security settings ──────────────────────────────────────────────────────────
const sessionTimeout = ref('30 minutes')
const sessionTimeoutOptions = ['15 minutes', '30 minutes', '1 hour', '4 hours']

function handleTwoFactorToggle(val: boolean | null) {
  adminStore.saveTwoFactorSetting(val ?? false)
}

// ── Role permissions definition ──────────────────────────────────────────────
const rolePermissions = [
  {
    role: 'Dean',
    access: 'Full system access — view, manage, validate, and configure',
    badge: 'deep-orange',
  },
  {
    role: 'QuAMS Coordinator',
    access: 'Full system access — upload, classify, validate, manage users',
    badge: 'deep-purple',
  },
  {
    role: 'Associate Dean',
    access: 'Validate documents, view repository, view dashboard',
    badge: 'blue',
  },
  {
    role: 'Department Head',
    access: 'Validate documents, upload, view repository',
    badge: 'cyan',
  },
  { role: 'Faculty', access: 'Upload documents, view own repository', badge: 'teal' },
  { role: 'Staff', access: 'Upload documents, view own repository', badge: 'green' },
]

// ── Document settings ────────────────────────────────────────────────────────
const docSettings = [
  { label: 'Allowed File Types', value: 'PDF, DOCX, XLSX, PPTX, JPG, PNG' },
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
        <div class="d-flex align-center justify-space-between pa-5 border-b">
          <h2 class="text-subtitle-1 font-weight-bold text-grey-darken-3">User Management</h2>
          <div class="d-flex align-center ga-3">
            <v-text-field
              v-model="search"
              placeholder="Search users…"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              style="width: 220px"
              color="deep-orange-darken-2"
            />
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
                  <v-chip
                    :color="roleColor(u.role)"
                    size="small"
                    rounded="pill"
                    variant="tonal"
                    class="text-capitalize"
                  >
                    {{ adminStore.roleLabel(u.role) }}
                  </v-chip>
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
                          @click="openEditDialog(u.id, u.role)"
                        >
                          <Settings :size="16" />
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
          <div class="d-flex align-center justify-space-between pa-4 bg-grey-lighten-4 rounded-lg">
            <div class="mr-15">
              <p class="text-body-2 font-weight-medium text-grey-darken-3 mb-1">Session Timeout</p>
              <p class="text-caption text-grey-darken-1">Automatic logout after inactivity</p>
            </div>
            <v-select
              v-model="sessionTimeout"
              :items="sessionTimeoutOptions"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
              style="width: 160px"
            />
          </div>
        </div>
      </v-card>
    </template>

    <!-- ── Add User Dialog ─── -->
    <v-dialog v-model="addDialog" max-width="520" rounded="xl">
      <v-card rounded="xl" class="pa-6">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-1">
          Add New User
        </v-card-title>
        <v-card-subtitle class="pa-0 mb-5 text-grey-darken-1 text-caption">
          Fill in the details below. The username is generated automatically.
        </v-card-subtitle>

        <div class="d-flex flex-column ga-4">
          <!-- Extension -->
          <div>
            <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
              Name Extension
            </label>
            <v-select
              v-model="addForm.extension"
              :items="NAME_EXTENSIONS"
              placeholder="Select extension (optional)"
              variant="outlined"
              density="compact"
              rounded="lg"
              clearable
              hide-details
              color="deep-orange-darken-2"
            />
          </div>

          <!-- Full Name -->
          <div>
            <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
              Full Name <span class="text-error">*</span>
            </label>
            <v-text-field
              v-model="addForm.fullName"
              placeholder="e.g. Mary Rose Raz"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
            />
          </div>

          <!-- Username (auto-generated, editable) -->
          <div>
            <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
              Username <span class="text-caption text-grey">(auto-generated, editable)</span>
            </label>
            <v-text-field
              v-model="addForm.username"
              placeholder="Generated from full name"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
            />
            <p class="text-caption text-grey mt-1 ml-1">
              e.g. "Mary Rose Raz" → <strong>mrraz</strong>
            </p>
          </div>

          <!-- Role -->
          <div>
            <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
              Role <span class="text-error">*</span>
            </label>
            <v-select
              v-model="addForm.role"
              :items="ROLES"
              item-title="label"
              item-value="value"
              placeholder="Select role"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
            />
          </div>

          <!-- Department -->
          <div>
            <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
              Department
            </label>
            <v-text-field
              v-model="addForm.department"
              placeholder="e.g. Computer Science"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
            />
          </div>

          <!-- Password -->
          <div>
            <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
              Password <span class="text-error">*</span>
            </label>
            <v-text-field
              v-model="addForm.password"
              :type="addForm.showPassword ? 'text' : 'password'"
              placeholder="Minimum 8 characters"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              color="deep-orange-darken-2"
            >
              <template #append-inner>
                <v-btn
                  icon
                  variant="text"
                  size="x-small"
                  @click="addForm.showPassword = !addForm.showPassword"
                >
                  <Eye v-if="!addForm.showPassword" :size="16" />
                  <EyeOff v-else :size="16" />
                </v-btn>
              </template>
            </v-text-field>
          </div>

          <!-- Error -->
          <v-alert v-if="addFormError" type="error" variant="tonal" density="compact" rounded="lg">
            {{ addFormError }}
          </v-alert>
        </div>

        <v-card-actions class="pa-0 mt-5 ga-3">
          <v-spacer />
          <v-btn
            variant="text"
            rounded="lg"
            class="text-none"
            :disabled="saving"
            @click="addDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="deep-orange-darken-2"
            rounded="lg"
            class="text-none"
            elevation="1"
            :disabled="!addFormValid || saving"
            :loading="saving"
            @click="handleAddUser"
          >
            Create User
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Edit Role Dialog ────────────────────────────────────────────────── -->
    <v-dialog v-model="editDialog" max-width="380" rounded="xl">
      <v-card v-if="editTarget" rounded="xl" class="pa-6">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-4">Edit Role</v-card-title>
        <v-select
          v-model="editTarget.role"
          :items="ROLES"
          item-title="label"
          item-value="value"
          label="Role"
          variant="outlined"
          rounded="lg"
          color="deep-orange-darken-2"
          hide-details
        />
        <v-card-actions class="pa-0 mt-5 ga-3">
          <v-spacer />
          <v-btn
            variant="text"
            rounded="lg"
            class="text-none"
            :disabled="editSaving"
            @click="editDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="deep-orange-darken-2"
            rounded="lg"
            class="text-none"
            elevation="1"
            :loading="editSaving"
            @click="handleUpdateRole"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Confirm Deactivate / Reactivate Dialog ──────────────────────────── -->
    <v-dialog v-model="confirmDialog" max-width="380" rounded="xl">
      <v-card v-if="confirmTarget" rounded="xl" class="pa-6">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-2">
          {{ confirmTarget.active ? 'Deactivate User' : 'Reactivate User' }}
        </v-card-title>
        <p class="text-body-2 text-grey-darken-2 mb-5">
          Are you sure you want to
          {{ confirmTarget.active ? 'deactivate' : 'reactivate' }}
          <strong>{{ confirmTarget.name }}</strong
          >?
        </p>
        <v-card-actions class="pa-0 ga-3">
          <v-spacer />
          <v-btn variant="text" rounded="lg" class="text-none" @click="confirmDialog = false">
            Cancel
          </v-btn>
          <v-btn
            :color="confirmTarget.active ? 'error' : 'success'"
            rounded="lg"
            class="text-none"
            elevation="1"
            @click="handleToggleStatus"
          >
            {{ confirmTarget.active ? 'Deactivate' : 'Reactivate' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
