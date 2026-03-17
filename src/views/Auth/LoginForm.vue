<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Lock, Shield } from 'lucide-vue-next'
import type { User } from '@/types/user'
import logoImage from '@/assets/img/logo/Quams-logo.png'
import supabase, { supabaseAdmin } from '@/lib/supabase'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const emit = defineEmits<{
  login: [user: User]
}>()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')

// ── MFA flow state ─────────────────────────────────────────────────────────
const step = ref<'credentials' | 'mfa-verify' | 'mfa-enroll'>('credentials')
const mfaCode = ref('')
const mfaFactorId = ref('')
const mfaEnrollData = ref<{ id: string; qrCode: string; secret: string } | null>(null)
const pendingUser = ref<User | null>(null)

onMounted(() => {
  if (route.query.reason === 'deactivated') {
    errorMessage.value = 'Your account has been deactivated. Please contact an administrator.'
  } else if (route.query.reason === 'session-timeout') {
    errorMessage.value = 'Your session expired due to inactivity. Please sign in again.'
  }
})

const handleSubmit = async () => {
  if (!username.value || !password.value) {
    errorMessage.value = 'Please enter both username and password'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    // Use supabaseAdmin to look up the stored email by username — bypasses RLS (user is not yet authenticated).
    // New accounts: email = "username@quams-system.com"
    // Existing accounts: email = their real email stored in profiles
    const { data: profileLookup } = await supabaseAdmin
      .from('profiles')
      .select('email, status')
      .eq('username', username.value.trim().toLowerCase())
      .maybeSingle()

    // Pre-flight: block deactivated accounts before attempting auth
    if (profileLookup && profileLookup.status === false) {
      errorMessage.value = 'Your account has been deactivated. Please contact an administrator.'
      loading.value = false
      return
    }

    const signInEmail =
      profileLookup?.email ?? `${username.value.trim().toLowerCase()}@quams-system.com`

    const { data, error } = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password: password.value,
    })

    if (error) {
      errorMessage.value = 'Invalid username or password'
      return
    }

    if (data.user) {
      // Fetch user profile from profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (profileError || !profile) {
        errorMessage.value = 'Unable to load user profile'
        await supabase.auth.signOut()
        return
      }

      // Check if user is active
      if (!profile.status) {
        errorMessage.value = 'Your account has been deactivated. Please contact an administrator.'
        await supabase.auth.signOut()
        return
      }

      const user: User = {
        id: data.user.id,
        f_name: profile.f_name,
        l_name: profile.l_name,
        email: data.user.email || signInEmail,
        role: profile.role,
        is_taskforce: profile.is_taskforce ?? false,
        department: profile.department,
        status: profile.status,
        avatar: profile.avatar,
      }

      // ── Check if 2FA is required for this user's role ─────────────────────────────────
      const adminRoles = ['admin', 'dean', 'quams_coordinator']
      if (adminRoles.includes(profile.role)) {
        let twoFactorRequired = false
        try {
          const { data: settingData } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'two_factor_required')
            .maybeSingle()
          twoFactorRequired = settingData?.value === 'true'
        } catch {
          /* app_settings table may not exist yet — default to no 2FA */
        }

        if (twoFactorRequired) {
          const { data: factorsData } = await supabase.auth.mfa.listFactors()
          const verifiedFactor = factorsData?.totp?.find((f) => f.status === 'verified')

          if (verifiedFactor) {
            // User has a verified TOTP factor — show challenge step
            mfaFactorId.value = verifiedFactor.id
            pendingUser.value = user
            step.value = 'mfa-verify'
            return
          }

          // No verified factor — clean up stale unverified ones, then start enrollment
          const stale = (factorsData?.all ?? []).filter(
            (f) => f.factor_type === 'totp' && (f.status as string) === 'unverified',
          )
          for (const f of stale) {
            await supabase.auth.mfa.unenroll({ factorId: f.id })
          }
          const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'QuAMS Authenticator',
          })
          if (enrollErr || !enrollData) {
            errorMessage.value = 'Failed to start 2FA setup. Please try again.'
            await supabase.auth.signOut()
            return
          }
          mfaEnrollData.value = {
            id: enrollData.id,
            qrCode: enrollData.totp?.qr_code ?? '',
            secret: enrollData.totp?.secret ?? '',
          }
          pendingUser.value = user
          step.value = 'mfa-enroll'
          return
        }
      }

      // No 2FA required — complete login immediately
      userStore.setUser(user)
      emit('login', user)
      router.push('/dashboard')
    }
  } catch (err) {
    errorMessage.value = 'An unexpected error occurred. Please try again.'
    console.error('Login error:', err)
  } finally {
    loading.value = false
  }
}

async function handleMfaVerify() {
  errorMessage.value = ''
  loading.value = true
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaFactorId.value,
      code: mfaCode.value.trim(),
    })
    if (error) {
      errorMessage.value = 'Invalid code. Please try again.'
      return
    }
    if (pendingUser.value) {
      userStore.setUser(pendingUser.value)
      emit('login', pendingUser.value)
      router.push('/dashboard')
    }
  } catch {
    errorMessage.value = 'Verification failed. Please try again.'
  } finally {
    loading.value = false
  }
}

async function handleMfaEnrollVerify() {
  errorMessage.value = ''
  loading.value = true
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaEnrollData.value!.id,
      code: mfaCode.value.trim(),
    })
    if (error) {
      errorMessage.value = 'Invalid code. Please try again.'
      return
    }
    if (pendingUser.value) {
      userStore.setUser(pendingUser.value)
      emit('login', pendingUser.value)
      router.push('/dashboard')
    }
  } catch {
    errorMessage.value = 'Verification failed. Please try again.'
  } finally {
    loading.value = false
  }
}

async function handleMfaBack() {
  await supabase.auth.signOut()
  step.value = 'credentials'
  mfaCode.value = ''
  mfaFactorId.value = ''
  mfaEnrollData.value = null
  pendingUser.value = null
  errorMessage.value = ''
}
</script>

<template>
  <v-container fluid class="pa-0 fill-height">
    <v-row no-gutters class="fill-height">
      <!-- Left Side - Branding (hidden on mobile) -->
      <v-col cols="12" lg="6" class="d-none d-lg-flex">
        <v-sheet
          class="d-flex align-center justify-center pa-12 position-relative overflow-hidden branding-sheet"
          width="100%"
          height="100%"
        >
          <!-- Overlay -->
          <div class="branding-overlay"></div>

          <!-- Decorative circles -->
          <div class="decorative-circle decorative-circle-top"></div>
          <div class="decorative-circle decorative-circle-bottom"></div>

          <!-- Content -->
          <div class="position-relative text-center branding-content">
            <v-img
              :src="logoImage"
              alt="CSU CCIS QuAMS Logo"
              class="mx-auto mb-10 branding-logo"
              width="320"
            />

            <h1 class="text-h4 font-weight-bold text-white mb-6 text-uppercase branding-title">
              Integrated Quality Assurance Management System
            </h1>

            <hr class="mx-auto mb-6 branding-divider" />

            <p class="text-body-1 branding-description">
              Advancing institutional excellence through streamlined quality assurance, intelligent
              classification, and secure document management.
            </p>
          </div>
        </v-sheet>
      </v-col>

      <!-- Right Side - Login Form -->
      <v-col cols="12" lg="6">
        <v-sheet
          class="d-flex align-center justify-center pa-6 pa-sm-12 bg-grey-lighten-4 overflow-y-auto fill-height"
        >
          <div class="w-100 form-container">
            <!-- Mobile-only header -->
            <div class="d-flex d-lg-none flex-column align-center mb-10 text-center">
              <v-img :src="logoImage" alt="CSU CCIS QuAMS Logo" width="128" class="mb-4" />
              <h1 class="text-h6 font-weight-bold text-uppercase mobile-title">
                Integrated Quality Assurance Management System
              </h1>
            </div>

            <!-- Form Card -->
            <v-card elevation="8" rounded="xl" class="pa-8 border-sm">
              <!-- ── Step 1: Credentials ── -->
              <template v-if="step === 'credentials'">
                <v-card-title class="text-h5 font-weight-bold pa-0 mb-2"> Sign In </v-card-title>
                <v-card-subtitle class="pa-0 mb-8 text-grey-darken-1">
                  Enter your username and password to access the system
                </v-card-subtitle>

                <v-form @submit.prevent="handleSubmit">
                  <div class="mb-4">
                    <label class="text-body-2 font-weight-bold text-grey-darken-3 d-block mb-2">
                      Username
                    </label>
                    <v-text-field
                      v-model="username"
                      placeholder="Enter your username"
                      variant="outlined"
                      color="deep-orange-darken-2"
                      bg-color="grey-lighten-4"
                      rounded="lg"
                      required
                      hide-details
                      :rules="[(v) => !!v || 'Username is required']"
                    />
                  </div>

                  <div class="mb-4">
                    <label class="text-body-2 font-weight-bold text-grey-darken-3 d-block mb-2">
                      Password
                    </label>
                    <v-text-field
                      v-model="password"
                      :type="showPassword ? 'text' : 'password'"
                      placeholder="••••••••"
                      variant="outlined"
                      color="deep-orange-darken-2"
                      bg-color="grey-lighten-4"
                      rounded="lg"
                      hide-details
                      :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                      @click:append-inner="showPassword = !showPassword"
                    />
                  </div>

                  <v-alert
                    v-if="errorMessage"
                    type="error"
                    variant="tonal"
                    rounded="lg"
                    class="mb-6"
                    density="compact"
                    closable
                    @click:close="errorMessage = ''"
                  >
                    {{ errorMessage }}
                  </v-alert>

                  <v-btn
                    type="submit"
                    block
                    size="x-large"
                    color="deep-orange-darken-2"
                    rounded="lg"
                    elevation="2"
                    class="text-none font-weight-bold submit-button"
                    :loading="loading"
                    :disabled="loading"
                  >
                    <template #prepend>
                      <Lock :size="20" />
                    </template>
                    Secure Login
                  </v-btn>
                </v-form>

                <!-- Footer -->
                <div class="d-flex align-center ga-3 mb-2 mt-6">
                  <v-divider class="border-opacity-100" color="grey-lighten-2" />
                  <span class="text-caption text-grey font-weight-bold text-uppercase footer-text">
                    Official Access Only
                  </span>
                  <v-divider class="border-opacity-100" color="grey-lighten-2" />
                </div>

                <p class="text-center text-caption text-grey footer-notice">
                  This system is protected by multi-factor authentication protocols. Unauthorized
                  access attempts are logged and reported to the IT department.
                </p>
              </template>

              <!-- ── Step 2: MFA Verify ── -->
              <template v-else-if="step === 'mfa-verify'">
                <div class="d-flex align-center ga-3 mb-3">
                  <v-avatar color="deep-orange-darken-2" size="40" rounded="lg">
                    <Shield :size="20" class="text-white" />
                  </v-avatar>
                  <v-card-title class="text-h5 font-weight-bold pa-0">
                    Two-Factor Auth
                  </v-card-title>
                </div>
                <v-card-subtitle class="pa-0 mb-8 text-grey-darken-1">
                  Enter the 6-digit code from your authenticator app.
                </v-card-subtitle>

                <div class="mb-4">
                  <label class="text-body-2 font-weight-bold text-grey-darken-3 d-block mb-2">
                    Authentication Code
                  </label>
                  <v-text-field
                    v-model="mfaCode"
                    placeholder="000000"
                    variant="outlined"
                    color="deep-orange-darken-2"
                    bg-color="grey-lighten-4"
                    rounded="lg"
                    hide-details
                    maxlength="6"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                  />
                </div>

                <v-alert
                  v-if="errorMessage"
                  type="error"
                  variant="tonal"
                  rounded="lg"
                  class="mb-4"
                  density="compact"
                  closable
                  @click:close="errorMessage = ''"
                >
                  {{ errorMessage }}
                </v-alert>

                <v-btn
                  block
                  size="x-large"
                  color="deep-orange-darken-2"
                  rounded="lg"
                  elevation="2"
                  class="text-none font-weight-bold submit-button mb-3"
                  :loading="loading"
                  :disabled="loading || mfaCode.length !== 6"
                  @click="handleMfaVerify"
                >
                  <template #prepend>
                    <Shield :size="20" />
                  </template>
                  Verify
                </v-btn>
                <v-btn
                  block
                  variant="text"
                  rounded="lg"
                  class="text-none text-grey-darken-1"
                  :disabled="loading"
                  @click="handleMfaBack"
                >
                  Back to Login
                </v-btn>
              </template>

              <!-- ── Step 3: MFA Enroll ── -->
              <template v-else-if="step === 'mfa-enroll'">
                <div class="d-flex align-center ga-3 mb-3">
                  <v-avatar color="deep-orange-darken-2" size="40" rounded="lg">
                    <Shield :size="20" class="text-white" />
                  </v-avatar>
                  <v-card-title class="text-h5 font-weight-bold pa-0">Set Up 2FA</v-card-title>
                </div>
                <v-card-subtitle class="pa-0 mb-4 text-grey-darken-1">
                  Scan this QR code with your authenticator app <br />
                  (e.g. Google Authenticator, Authy), <br />
                  then enter the 6-digit code to confirm.
                </v-card-subtitle>

                <div class="text-center mb-4">
                  <img
                    v-if="mfaEnrollData?.qrCode"
                    :src="mfaEnrollData.qrCode"
                    alt="QR Code"
                    width="180"
                    class="rounded-lg"
                  />
                </div>

                <div class="bg-grey-lighten-4 pa-3 rounded-lg mb-4">
                  <p class="text-caption text-grey-darken-1 mb-1">Or enter this key manually:</p>
                  <code
                    class="text-body-2 font-weight-bold text-grey-darken-3"
                    style="word-break: break-all"
                  >
                    {{ mfaEnrollData?.secret }}
                  </code>
                </div>

                <div class="mb-4">
                  <label class="text-body-2 font-weight-bold text-grey-darken-3 d-block mb-2">
                    Verification Code
                  </label>
                  <v-text-field
                    v-model="mfaCode"
                    placeholder="000000"
                    variant="outlined"
                    color="deep-orange-darken-2"
                    bg-color="grey-lighten-4"
                    rounded="lg"
                    hide-details
                    maxlength="6"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                  />
                </div>

                <v-alert
                  v-if="errorMessage"
                  type="error"
                  variant="tonal"
                  rounded="lg"
                  class="mb-4"
                  density="compact"
                  closable
                  @click:close="errorMessage = ''"
                >
                  {{ errorMessage }}
                </v-alert>

                <v-btn
                  block
                  size="x-large"
                  color="deep-orange-darken-2"
                  rounded="lg"
                  elevation="2"
                  class="text-none font-weight-bold submit-button mb-3"
                  :loading="loading"
                  :disabled="loading || mfaCode.length !== 6"
                  @click="handleMfaEnrollVerify"
                >
                  <template #prepend>
                    <Shield :size="20" />
                  </template>
                  Verify &amp; Enable
                </v-btn>
                <v-btn
                  block
                  variant="text"
                  rounded="lg"
                  class="text-none text-grey-darken-1"
                  :disabled="loading"
                  @click="handleMfaBack"
                >
                  Back to Login
                </v-btn>
              </template>
            </v-card>
          </div>
        </v-sheet>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
/* Branding Section - Custom styles that Vuetify doesn't provide */
.branding-sheet {
  background-color: rgb(124, 45, 18);
}

.branding-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom right, rgb(67, 20, 7), rgb(154, 52, 18));
  opacity: 0.9;
  pointer-events: none;
}

.decorative-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.1;
  filter: blur(48px);
  pointer-events: none;
}

.decorative-circle-top {
  top: -6rem;
  left: -6rem;
  width: 24rem;
  height: 24rem;
  background-color: rgb(249, 115, 22);
}

.decorative-circle-bottom {
  bottom: 0;
  right: 0;
  width: 16rem;
  height: 16rem;
  background-color: rgb(251, 146, 60);
}

.branding-content {
  z-index: 10;
  max-width: 32rem;
}

.branding-logo {
  filter: drop-shadow(0 25px 25px rgb(0 0 0 / 0.15));
}

.branding-title {
  letter-spacing: 0.05em;
  line-height: 1.25;
}

.branding-divider {
  height: 4px;
  width: 6rem;
  background-color: rgb(251, 146, 60);
  opacity: 1;
}

.branding-description {
  color: rgb(254, 215, 170);
  line-height: 1.75rem;
}

/* Form Section */
.form-container {
  max-width: 28rem;
}

.mobile-title {
  letter-spacing: -0.025em;
}

.border-sm {
  border: 1px solid rgb(243, 244, 246);
}

.submit-button {
  box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.2) !important;
}

.submit-button:active {
  transform: scale(0.98);
}

.footer-text {
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.footer-notice {
  font-size: 0.6875rem;
  line-height: 1.75;
}
</style>
