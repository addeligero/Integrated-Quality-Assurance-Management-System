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
const mfaCode = ref('')
const requiresMfa = ref(false)
const mfaFactorId = ref('')
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const MIN_PASSWORD_LENGTH = 8
const accountIdentifier = computed(() => userStore.user?.username || userStore.user?.email || '')

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

const isAal2RequiredError = (message: string) => /aal2 session is required/i.test(message)

const getVerifiedTotpFactorId = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) return null

  const verifiedTotp = data?.totp?.find((factor) => factor.status === 'verified')
  return verifiedTotp?.id ?? null
}

const verifyMfaChallenge = async (): Promise<boolean> => {
  if (!mfaCode.value.trim()) {
    errorMessage.value = 'Enter your authenticator code to continue.'
    return false
  }

  if (!mfaFactorId.value) {
    const factorId = await getVerifiedTotpFactorId()
    if (!factorId) {
      errorMessage.value =
        'No verified authenticator factor was found. Please sign in again and complete MFA first.'
      return false
    }
    mfaFactorId.value = factorId
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: mfaFactorId.value,
    code: mfaCode.value.trim(),
  })

  if (error) {
    errorMessage.value = 'Invalid authenticator code. Please try again.'
    return false
  }

  return true
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

    if (requiresMfa.value) {
      const verified = await verifyMfaChallenge()
      if (!verified) return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword.value })

    if (updateError) {
      if (isAal2RequiredError(updateError.message || '')) {
        requiresMfa.value = true
        if (!mfaFactorId.value) {
          const factorId = await getVerifiedTotpFactorId()
          if (!factorId) {
            errorMessage.value =
              'MFA is enabled, but no verified authenticator is configured. Please log in again and finish MFA setup.'
            return
          }
          mfaFactorId.value = factorId
        }
        errorMessage.value =
          'MFA verification is required before updating your password. Enter your authenticator code and submit again.'
        return
      }

      errorMessage.value = updateError.message || 'Failed to update password. Please try again.'
      return
    }

    successMessage.value = 'Password updated successfully.'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    mfaCode.value = ''
    mfaFactorId.value = ''
    requiresMfa.value = false
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
          <input
            v-if="accountIdentifier"
            :value="accountIdentifier"
            type="text"
            name="username"
            autocomplete="username"
            class="sr-only-username"
            readonly
            tabindex="-1"
            aria-hidden="true"
          />

          <v-text-field
            v-model="currentPassword"
            :type="showCurrentPassword ? 'text' : 'password'"
            label="Current Password"
            variant="outlined"
            name="current-password"
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
            name="new-password"
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
            name="new-password-confirmation"
            autocomplete="new-password"
            :append-inner-icon="showConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showConfirmPassword = !showConfirmPassword"
            @input="clearMessages"
          />

          <v-text-field
            v-if="requiresMfa"
            v-model="mfaCode"
            label="Authenticator Code"
            variant="outlined"
            maxlength="6"
            inputmode="numeric"
            autocomplete="one-time-code"
            hint="Enter the 6-digit code from your authenticator app"
            persistent-hint
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

<style scoped>
.sr-only-username {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
