<script setup lang="ts">
import { computed } from 'vue'
import { Eye, EyeOff, KeyRound } from 'lucide-vue-next'
import { NAME_EXTENSIONS, ROLES } from '@/stores/admin'

type AddForm = {
  extension: string
  fullName: string
  username: string
  role: string
  department: string
  password: string
  showPassword: boolean
}

type EditTarget = { id: string; role: string; isTaskforce: boolean } | null
type ConfirmTarget = { id: string; name: string; active: boolean } | null
type ResetPasswordTarget = { id: string; name: string } | null

const props = defineProps<{
  addDialog: boolean
  addForm: AddForm
  addFormError: string
  saving: boolean
  addFormValid: boolean
  editDialog: boolean
  editTarget: EditTarget
  editSaving: boolean
  confirmDialog: boolean
  confirmTarget: ConfirmTarget
  resetPasswordDialog: boolean
  resetPasswordTarget: ResetPasswordTarget
  resetPasswordLoading: boolean
  resetAllPasswordsDialog: boolean
  totalUsers: number
  resetAllLoading: boolean
}>()

const emit = defineEmits<{
  'update:addDialog': [value: boolean]
  'update:addForm': [value: AddForm]
  'update:editDialog': [value: boolean]
  'update:editTarget': [value: EditTarget]
  'update:confirmDialog': [value: boolean]
  'update:resetPasswordDialog': [value: boolean]
  'update:resetAllPasswordsDialog': [value: boolean]
  addUser: []
  updateRole: []
  toggleStatus: []
  resetPassword: []
  resetAllPasswords: []
}>()

const addDialogModel = computed({
  get: () => props.addDialog,
  set: (value: boolean) => emit('update:addDialog', value),
})

const addFormModel = computed({
  get: () => props.addForm,
  set: (value: AddForm) => emit('update:addForm', value),
})

const addExtensionModel = computed({
  get: () => addFormModel.value.extension,
  set: (value: string | null) => {
    addFormModel.value = { ...addFormModel.value, extension: value ?? '' }
  },
})

const addFullNameModel = computed({
  get: () => addFormModel.value.fullName,
  set: (value: string) => {
    addFormModel.value = { ...addFormModel.value, fullName: value }
  },
})

const addUsernameModel = computed({
  get: () => addFormModel.value.username,
  set: (value: string) => {
    addFormModel.value = { ...addFormModel.value, username: value }
  },
})

const addRoleModel = computed({
  get: () => addFormModel.value.role,
  set: (value: string | null) => {
    addFormModel.value = { ...addFormModel.value, role: value ?? '' }
  },
})

const addDepartmentModel = computed({
  get: () => addFormModel.value.department,
  set: (value: string) => {
    addFormModel.value = { ...addFormModel.value, department: value }
  },
})

const addPasswordModel = computed({
  get: () => addFormModel.value.password,
  set: (value: string) => {
    addFormModel.value = { ...addFormModel.value, password: value }
  },
})

const addShowPasswordModel = computed({
  get: () => addFormModel.value.showPassword,
  set: (value: boolean) => {
    addFormModel.value = { ...addFormModel.value, showPassword: value }
  },
})

const editDialogModel = computed({
  get: () => props.editDialog,
  set: (value: boolean) => emit('update:editDialog', value),
})

const editTargetModel = computed({
  get: () => props.editTarget,
  set: (value: EditTarget) => emit('update:editTarget', value),
})

const editRoleModel = computed({
  get: () => editTargetModel.value?.role ?? '',
  set: (value: string | null) => {
    if (!editTargetModel.value) return
    editTargetModel.value = {
      ...editTargetModel.value,
      role: value ?? '',
    }
  },
})

const editTaskforceModel = computed({
  get: () => editTargetModel.value?.isTaskforce ?? false,
  set: (value: boolean) => {
    if (!editTargetModel.value) return
    editTargetModel.value = {
      ...editTargetModel.value,
      isTaskforce: value,
    }
  },
})

const confirmDialogModel = computed({
  get: () => props.confirmDialog,
  set: (value: boolean) => emit('update:confirmDialog', value),
})

const resetPasswordDialogModel = computed({
  get: () => props.resetPasswordDialog,
  set: (value: boolean) => emit('update:resetPasswordDialog', value),
})

const resetAllPasswordsDialogModel = computed({
  get: () => props.resetAllPasswordsDialog,
  set: (value: boolean) => emit('update:resetAllPasswordsDialog', value),
})
</script>

<template>
  <!-- Add User Dialog -->
  <v-dialog v-model="addDialogModel" max-width="520" rounded="xl">
    <v-card rounded="xl" class="pa-6">
      <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-1"> Add New User </v-card-title>
      <v-card-subtitle class="pa-0 mb-5 text-grey-darken-1 text-caption">
        Fill in the details below. The username is generated automatically.
      </v-card-subtitle>

      <div class="d-flex flex-column ga-4">
        <div>
          <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1"
            >Name Extension</label
          >
          <v-select
            v-model="addExtensionModel"
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

        <div>
          <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
            Full Name <span class="text-error">*</span>
          </label>
          <v-text-field
            v-model="addFullNameModel"
            placeholder="e.g. Mary Rose Raz"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            color="deep-orange-darken-2"
          />
        </div>

        <div>
          <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
            Username <span class="text-caption text-grey">(auto-generated, editable)</span>
          </label>
          <v-text-field
            v-model="addUsernameModel"
            placeholder="Generated from full name"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            color="deep-orange-darken-2"
          />
          <p class="text-caption text-grey mt-1 ml-1">
            e.g. "Mary Rose Raz" -> <strong>mrraz</strong>
          </p>
        </div>

        <div>
          <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
            Role <span class="text-error">*</span>
          </label>
          <v-select
            v-model="addRoleModel"
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

        <div>
          <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1"
            >Department</label
          >
          <v-text-field
            v-model="addDepartmentModel"
            placeholder="e.g. Computer Science"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            color="deep-orange-darken-2"
          />
        </div>

        <div>
          <label class="text-caption font-weight-bold text-grey-darken-3 d-block mb-1">
            Password <span class="text-error">*</span>
          </label>
          <v-text-field
            v-model="addPasswordModel"
            :type="addShowPasswordModel ? 'text' : 'password'"
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
                @click="addShowPasswordModel = !addShowPasswordModel"
              >
                <Eye v-if="!addShowPasswordModel" :size="16" />
                <EyeOff v-else :size="16" />
              </v-btn>
            </template>
          </v-text-field>
        </div>

        <v-alert
          v-if="props.addFormError"
          type="error"
          variant="tonal"
          density="compact"
          rounded="lg"
        >
          {{ props.addFormError }}
        </v-alert>
      </div>

      <v-card-actions class="pa-0 mt-5 ga-3">
        <v-spacer />
        <v-btn
          variant="text"
          rounded="lg"
          class="text-none"
          :disabled="props.saving"
          @click="addDialogModel = false"
        >
          Cancel
        </v-btn>
        <v-btn
          color="deep-orange-darken-2"
          rounded="lg"
          class="text-none"
          elevation="1"
          :disabled="!props.addFormValid || props.saving"
          :loading="props.saving"
          @click="emit('addUser')"
        >
          Create User
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Edit Role Dialog -->
  <v-dialog v-model="editDialogModel" max-width="380" rounded="xl">
    <v-card v-if="props.editTarget" rounded="xl" class="pa-6">
      <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-4"
        >Edit Role & Access</v-card-title
      >
      <v-select
        v-model="editRoleModel"
        :items="ROLES"
        item-title="label"
        item-value="value"
        label="Role"
        variant="outlined"
        rounded="lg"
        color="deep-orange-darken-2"
        hide-details
      />
      <div class="d-flex align-center justify-space-between mt-3 taskforce-toggle">
        <span class="text-body-2 text-grey-darken-3">
          Taskforce access (can edit/delete Compliance Matrix regardless of role)
        </span>
        <v-switch
          v-model="editTaskforceModel"
          color="deep-orange-darken-2"
          hide-details
          density="compact"
          inset
        />
      </div>
      <v-card-actions class="pa-0 mt-5 ga-3">
        <v-spacer />
        <v-btn
          variant="text"
          rounded="lg"
          class="text-none"
          :disabled="props.editSaving"
          @click="editDialogModel = false"
        >
          Cancel
        </v-btn>
        <v-btn
          color="deep-orange-darken-2"
          rounded="lg"
          class="text-none"
          elevation="1"
          :loading="props.editSaving"
          @click="emit('updateRole')"
        >
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Confirm Deactivate / Reactivate Dialog -->
  <v-dialog v-model="confirmDialogModel" max-width="380" rounded="xl">
    <v-card v-if="props.confirmTarget" rounded="xl" class="pa-6">
      <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-2">
        {{ props.confirmTarget.active ? 'Deactivate User' : 'Reactivate User' }}
      </v-card-title>
      <p class="text-body-2 text-grey-darken-2 mb-5">
        Are you sure you want to
        {{ props.confirmTarget.active ? 'deactivate' : 'reactivate' }}
        <strong>{{ props.confirmTarget.name }}</strong
        >?
      </p>
      <v-card-actions class="pa-0 ga-3">
        <v-spacer />
        <v-btn variant="text" rounded="lg" class="text-none" @click="confirmDialogModel = false">
          Cancel
        </v-btn>
        <v-btn
          :color="props.confirmTarget.active ? 'error' : 'success'"
          rounded="lg"
          class="text-none"
          elevation="1"
          @click="emit('toggleStatus')"
        >
          {{ props.confirmTarget.active ? 'Deactivate' : 'Reactivate' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Reset single user password dialog -->
  <v-dialog v-model="resetPasswordDialogModel" max-width="420" persistent>
    <v-card rounded="lg" class="pa-6">
      <template v-if="props.resetPasswordTarget">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-2"
          >Reset Password</v-card-title
        >
        <p class="text-body-2 text-grey-darken-2 mb-5">
          Reset the password of <strong>{{ props.resetPasswordTarget.name }}</strong> to
          <strong>Quams123</strong>?
        </p>
        <v-card-actions class="pa-0 ga-3">
          <v-spacer />
          <v-btn
            variant="text"
            rounded="lg"
            class="text-none"
            :disabled="props.resetPasswordLoading"
            @click="resetPasswordDialogModel = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="blue-darken-2"
            rounded="lg"
            class="text-none"
            elevation="1"
            :loading="props.resetPasswordLoading"
            @click="emit('resetPassword')"
          >
            Reset Password
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>

  <!-- Reset all passwords dialog -->
  <v-dialog v-model="resetAllPasswordsDialogModel" max-width="420" persistent>
    <v-card rounded="lg" class="pa-6">
      <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-2"
        >Reset All Passwords</v-card-title
      >
      <p class="text-body-2 text-grey-darken-2 mb-5">
        Reset the passwords of all <strong>{{ props.totalUsers }}</strong> user(s) to
        <strong>Quams123</strong>? This cannot be undone.
      </p>
      <v-card-actions class="pa-0 ga-3">
        <v-spacer />
        <v-btn
          variant="text"
          rounded="lg"
          class="text-none"
          :disabled="props.resetAllLoading"
          @click="resetAllPasswordsDialogModel = false"
        >
          Cancel
        </v-btn>
        <v-btn
          color="blue-darken-2"
          rounded="lg"
          class="text-none"
          elevation="1"
          :loading="props.resetAllLoading"
          @click="emit('resetAllPasswords')"
        >
          <template #prepend>
            <KeyRound :size="16" />
          </template>
          Reset All
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.taskforce-toggle {
  gap: 12px;
}
</style>
