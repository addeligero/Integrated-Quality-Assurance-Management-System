<script setup lang="ts">
import { computed, ref } from 'vue'
import supabase from '@/lib/supabase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const MIN_PASSWORD_LENGTH = 8

const passwordValidation = computed(() => {
  if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  if (newPassword.value === currentPassword.value) {
    return 'New password must be different from your current password.'
  }

  if (newPassword.value !== confirmPassword.value) {
    return 'New password and confirmation password do not match.'
  }

  return ''
})

const canSubmit = computed(
  () =>
    !loading.value &&
    currentPassword.value.length > 0 &&
    newPassword.value.length > 0 &&
    confirmPassword.value.length > 0 &&
    !passwordValidation.value,
)

const clearMessages = () => {
  errorMessage.value = ''
  successMessage.value = ''
}

const handleChangePassword = async () => {
  clearMessages()

  if (!canSubmit.value) {
    errorMessage.value = passwordValidation.value || 'Please complete all required fields.'
    return
  }

  const email = userStore.user?.email
  if (!email) {
    errorMessage.value = 'Unable to verify your account session. Please log in again.'
    return
  }

  loading.value = true

  try {
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword.value,
    })

    if (reauthError) {
      errorMessage.value = 'Current password is incorrect.'
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword.value })

    if (updateError) {
      errorMessage.value = updateError.message || 'Failed to update password. Please try again.'
      return
    }

    successMessage.value = 'Password updated successfully.'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch {
    errorMessage.value = 'An unexpected error occurred. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-row justify="center">
    <v-col cols="12" md="8" lg="6">
      <v-card class="pa-4 pa-sm-6 rounded-lg" elevation="2">
        <v-card-title class="text-h6 font-weight-bold px-0 pt-0">Change Password</v-card-title>
        <v-card-subtitle class="px-0 pb-4">
          Enter your current password first, then set a new password.
        </v-card-subtitle>

        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
          {{ errorMessage }}
        </v-alert>

        <v-alert v-if="successMessage" type="success" variant="tonal" class="mb-4">
          {{ successMessage }}
        </v-alert>

        <v-form @submit.prevent="handleChangePassword">
          <v-text-field
            v-model="currentPassword"
            :type="showCurrentPassword ? 'text' : 'password'"
            label="Current Password"
            variant="outlined"
            autocomplete="current-password"
            :append-inner-icon="showCurrentPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showCurrentPassword = !showCurrentPassword"
            @input="clearMessages"
          />

          <v-text-field
            v-model="newPassword"
            :type="showNewPassword ? 'text' : 'password'"
            label="New Password"
            variant="outlined"
            autocomplete="new-password"
            :append-inner-icon="showNewPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showNewPassword = !showNewPassword"
            @input="clearMessages"
          />

          <v-text-field
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            label="Confirm New Password"
            variant="outlined"
            autocomplete="new-password"
            :append-inner-icon="showConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showConfirmPassword = !showConfirmPassword"
            @input="clearMessages"
          />

          <p v-if="passwordValidation" class="text-caption text-error mb-4">
            {{ passwordValidation }}
          </p>

          <v-btn
            type="submit"
            color="orange-darken-2"
            class="text-none"
            :loading="loading"
            :disabled="!canSubmit"
          >
            Update Password
          </v-btn>
        </v-form>
      </v-card>
    </v-col>
  </v-row>
</template>
