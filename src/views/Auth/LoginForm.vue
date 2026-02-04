<script setup lang="ts">
import { ref, computed } from 'vue'
import { Lock } from 'lucide-vue-next'
import type { User, UserRole } from '@/types/user'
import logoImage from '@/assets/img/logo/Quams-logo.png'
import supabase from '@/lib/supabase'

const emit = defineEmits<{
  login: [user: User]
}>()

const email = ref('')
const password = ref('')
const selectedRole = ref<UserRole>('faculty')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const roles = [
  {
    value: 'dean' as UserRole,
    title: 'Dean',
    subtitle: 'Full system configuration rights',
  },
  {
    value: 'quams_coordinator' as UserRole,
    title: 'QuAMS Coordinator',
    subtitle: 'Full system configuration rights',
  },
  {
    value: 'associate_dean' as UserRole,
    title: 'Associate Dean',
    subtitle: 'Validation authority',
  },
  {
    value: 'department' as UserRole,
    title: 'Department Head',
    subtitle: 'Validation authority',
  },
  {
    value: 'faculty' as UserRole,
    title: 'Faculty Member',
    subtitle: 'Upload and view assigned documents',
  },
  {
    value: 'staff' as UserRole,
    title: 'Staff',
    subtitle: 'Upload and view assigned documents',
  },
]

const selectedRoleDescription = computed(() => {
  return roles.find((r) => r.value === selectedRole.value)?.subtitle
})

const handleSubmit = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = 'Please enter both email and password'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (error) {
      errorMessage.value = error.message
      return
    }

    if (data.user) {
      const user: User = {
        id: data.user.id,
        name: data.user.email?.split('@')[0] || 'User',
        role: selectedRole.value,
        email: data.user.email || email.value,
      }

      emit('login', user)
    }
  } catch (err) {
    errorMessage.value = 'An unexpected error occurred. Please try again.'
    console.error('Login error:', err)
  } finally {
    loading.value = false
  }
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
              <!-- Header -->
              <v-card-title class="text-h5 font-weight-bold pa-0 mb-2"> Sign In </v-card-title>
              <v-card-subtitle class="pa-0 mb-8 text-grey-darken-1">
                Enter your credentials to access the system
              </v-card-subtitle>

              <!-- Form -->
              <v-form @submit.prevent="handleSubmit">
                <div class="mb-4">
                  <label class="text-body-2 font-weight-bold text-grey-darken-3 d-block mb-2">
                    Email Address
                  </label>
                  <v-text-field
                    v-model="email"
                    type="email"
                    placeholder="name@institution.edu"
                    variant="outlined"
                    color="deep-orange-darken-2"
                    bg-color="grey-lighten-4"
                    rounded="lg"
                    required
                    hide-details
                    :rules="[(v) => !!v || 'Email is required']"
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

                <div class="mb-3">
                  <label class="text-body-2 font-weight-bold text-grey-darken-3 d-block mb-2">
                    Authentication Role
                  </label>
                  <v-select
                    v-model="selectedRole"
                    :items="roles"
                    item-title="title"
                    item-value="value"
                    variant="outlined"
                    color="deep-orange-darken-2"
                    bg-color="grey-lighten-4"
                    rounded="lg"
                    hide-details
                  />
                </div>

                <v-alert
                  variant="tonal"
                  color="deep-orange-lighten-4"
                  rounded="lg"
                  class="mb-6"
                  density="compact"
                >
                  <template #text>
                    <span class="text-caption text-deep-orange-darken-4">
                      <span class="font-weight-bold">Role Access:</span>
                      {{ selectedRoleDescription }}
                    </span>
                  </template>
                </v-alert>

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

              <div class="d-flex align-center ga-3 mb-2">
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
