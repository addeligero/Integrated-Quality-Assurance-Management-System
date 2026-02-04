<script setup lang="ts">
import { ref, computed } from 'vue'
import { Lock } from 'lucide-vue-next'
import type { User, UserRole } from '@/types/user'
import logoImage from '@/assets/img/logo/Quams-logo.png'

const emit = defineEmits<{
  login: [user: User]
}>()

const email = ref('')
const password = ref('')
const selectedRole = ref<UserRole>('faculty')
const showPassword = ref(false)

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

const handleSubmit = () => {
  const user: User = {
    id: Math.random().toString(36).substring(2, 11),
    name: email.value.split('@')[0],
    role: selectedRole.value,
    email: email.value,
  }

  emit('login', user)
}
</script>

<template>
  <v-container fluid class="pa-0 fill-height">
    <v-row no-gutters class="fill-height">
      <!-- Left Side - Branding (hidden on mobile) -->
      <v-col cols="12" lg="6" class="d-none d-lg-flex">
        <v-sheet
          class="d-flex align-center justify-center pa-12 position-relative"
          color="#7C2D12"
          width="100%"
          height="100%"
        >
          <!-- Overlay -->
          <div
            class="position-absolute"
            style="
              inset: 0;
              background: linear-gradient(to bottom right, rgb(67, 20, 7), rgb(154, 52, 18));
              opacity: 0.9;
            "
          ></div>

          <!-- Decorative circles -->
          <div
            class="position-absolute"
            style="
              top: -6rem;
              left: -6rem;
              width: 24rem;
              height: 24rem;
              background-color: rgb(249, 115, 22);
              border-radius: 50%;
              opacity: 0.1;
              filter: blur(48px);
              pointer-events: none;
            "
          ></div>
          <div
            class="position-absolute"
            style="
              bottom: 0;
              right: 0;
              width: 16rem;
              height: 16rem;
              background-color: rgb(251, 146, 60);
              border-radius: 50%;
              opacity: 0.1;
              filter: blur(48px);
              pointer-events: none;
            "
          ></div>

          <!-- Content -->
          <div class="position-relative text-center" style="z-index: 10; max-width: 32rem">
            <v-img
              :src="logoImage"
              alt="CSU CCIS QuAMS Logo"
              class="mx-auto mb-10"
              width="320"
              style="filter: drop-shadow(0 25px 25px rgb(0 0 0 / 0.15))"
            />

            <h1
              class="text-h4 font-weight-bold text-white mb-6 text-uppercase"
              style="letter-spacing: 0.05em; line-height: 1.25"
            >
              Integrated Quality Assurance Management System
            </h1>

            <v-divider
              class="mx-auto mb-6"
              style="height: 4px; width: 6rem; background-color: rgb(251, 146, 60); opacity: 1"
            />

            <p class="text-body-1" style="color: rgb(254, 215, 170); line-height: 1.75rem">
              Advancing institutional excellence through streamlined quality assurance, intelligent
              classification, and secure document management.
            </p>
          </div>
        </v-sheet>
      </v-col>

      <!-- Right Side - Login Form -->
      <v-col cols="12" lg="6">
        <v-sheet
          class="d-flex align-center justify-center pa-6 pa-sm-12 bg-grey-lighten-4 overflow-y-auto"
          height="100%"
        >
          <div style="width: 100%; max-width: 28rem">
            <!-- Mobile-only header -->
            <div class="d-flex d-lg-none flex-column align-center mb-10 text-center">
              <v-img :src="logoImage" alt="CSU CCIS QuAMS Logo" width="128" class="mb-4" />
              <h1 class="text-h6 font-weight-bold text-uppercase" style="letter-spacing: -0.025em">
                Integrated Quality Assurance Management System
              </h1>
            </div>

            <!-- Form Card -->
            <v-card elevation="8" rounded="xl" class="pa-8">
              <!-- Header -->
              <v-card-title class="text-h5 font-weight-bold pa-0 mb-2"> Sign In </v-card-title>
              <v-card-subtitle class="pa-0 mb-8 text-grey-darken-1">
                Enter your credentials to access the system
              </v-card-subtitle>

              <!-- Form -->
              <v-form @submit.prevent="handleSubmit">
                <v-text-field
                  v-model="email"
                  type="email"
                  label="Email Address"
                  placeholder="name@institution.edu"
                  variant="outlined"
                  color="deep-orange-darken-2"
                  bg-color="grey-lighten-4"
                  rounded="lg"
                  required
                  class="mb-4"
                />

                <v-text-field
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  label="Password"
                  placeholder="••••••••"
                  variant="outlined"
                  color="deep-orange-darken-2"
                  bg-color="grey-lighten-4"
                  rounded="lg"
                  class="mb-4"
                  :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                  @click:append-inner="showPassword = !showPassword"
                />

                <v-select
                  v-model="selectedRole"
                  :items="roles"
                  item-title="title"
                  item-value="value"
                  label="Authentication Role"
                  variant="outlined"
                  color="deep-orange-darken-2"
                  bg-color="grey-lighten-4"
                  rounded="lg"
                  class="mb-3"
                />

                <v-alert
                  type="info"
                  variant="tonal"
                  color="deep-orange-lighten-4"
                  rounded="lg"
                  class="mb-6"
                  density="compact"
                >
                  <template #text>
                    <span class="text-caption">
                      <strong>Role Access:</strong>
                      {{ selectedRoleDescription }}
                    </span>
                  </template>
                </v-alert>

                <v-btn
                  type="submit"
                  block
                  size="x-large"
                  color="deep-orange-darken-2"
                  rounded="lg"
                  elevation="2"
                  class="text-none font-weight-bold"
                >
                  <template #prepend>
                    <Lock :size="20" />
                  </template>
                  Secure Login
                </v-btn>
              </v-form>

              <!-- Footer -->
              <v-divider class="my-4" />

              <div class="d-flex align-center ga-3 mb-2">
                <v-divider />
                <span
                  class="text-caption text-grey font-weight-bold text-uppercase"
                  style="letter-spacing: 0.1em"
                >
                  Official Access Only
                </span>
                <v-divider />
              </div>

              <p
                class="text-center text-caption text-grey"
                style="font-size: 0.6875rem; line-height: 1.75"
              >
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
