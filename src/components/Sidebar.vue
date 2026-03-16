<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  LayoutDashboard,
  Upload,
  FolderSearch,
  Tags,
  Settings,
  UserCircle,
  ClipboardCheck,
  LogOut,
  Camera,
  KeyRound,
} from 'lucide-vue-next'
import type { User } from '@/types/user'
import { useUserStore } from '@/stores/user'
import { storeToRefs } from 'pinia'

interface Props {
  user: User
  modelValue: boolean
  isMobile: boolean
}

interface Emits {
  (e: 'update:model-value', value: boolean): void
  (e: 'logout'): void
  (e: 'update-user', user: User): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const showProfileMenu = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)

const avatarSrc = computed(() => userStore.user?.avatar ?? null)
const profileMenuWidth = computed(() => (props.isMobile ? 280 : 320))

// Reset error state whenever the avatar URL changes (e.g. after a new upload).
const avatarImgError = ref(false)
watch(avatarSrc, () => {
  avatarImgError.value = false
})

const { fullName, hasAdminAccess, hasValidationAccess } = storeToRefs(userStore)

const menuItems = computed(() => [
  {
    route: '/dashboard',
    name: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    access: true,
  },
  {
    route: '/dashboard/upload',
    name: 'upload',
    label: 'Upload Documents',
    icon: Upload,
    access: true,
  },
  {
    route: '/dashboard/repository',
    name: 'repository',
    label: 'Document Repository',
    icon: FolderSearch,
    access: true,
  },
  {
    route: '/dashboard/compliance',
    name: 'compliance',
    label: 'Compliance Matrix',
    icon: ClipboardCheck,
    access: true,
  },
  {
    route: '/dashboard/change-password',
    name: 'change-password',
    label: 'Change Password',
    icon: KeyRound,
    access: true,
  },
  {
    route: '/dashboard/classification',
    name: 'classification',
    label: 'Classification',
    icon: Tags,
    access: hasValidationAccess.value,
  },
  {
    route: '/dashboard/admin',
    name: 'admin',
    label: 'Administration',
    icon: Settings,
    access: hasAdminAccess.value,
  },
])

const isActive = (itemRoute: string) => {
  return route.path === itemRoute
}

const navigateTo = (path: string) => {
  router.push(path)
  if (props.isMobile) {
    emit('update:model-value', false)
  }
}

const formatRole = (role: string) => {
  if (role === 'department') return 'Department Head'
  return role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  avatarUploading.value = true
  try {
    const avatarUrl = await userStore.uploadAvatar(file)
    if (avatarUrl) {
      emit('update-user', { ...props.user, avatar: avatarUrl })
    }
  } finally {
    avatarUploading.value = false
    // Reset so the same file can be re-selected if needed
    target.value = ''
  }
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleLogout = async () => {
  await userStore.logout()
  emit('update:model-value', false)
  emit('logout')
  router.push('/')
}
</script>

<template>
  <v-navigation-drawer
    :model-value="modelValue"
    :temporary="isMobile"
    :permanent="!isMobile"
    :fixed="!isMobile"
    width="256"
    class="sidebar-drawer"
    @update:model-value="(value) => emit('update:model-value', !!value)"
  >
    <!-- User Profile Section -->
    <div class="pa-6 border-b-profile">
      <div class="d-flex align-center">
        <v-menu v-model="showProfileMenu" :close-on-content-click="false" location="end">
          <template #activator="{ props: menuProps }">
            <v-avatar v-bind="menuProps" size="56" class="cursor-pointer profile-avatar mb-3">
              <v-img
                v-if="avatarSrc && !avatarImgError"
                :key="avatarSrc"
                :src="avatarSrc"
                cover
                @error="avatarImgError = true"
              />
              <UserCircle v-else :size="40" class="text-orange-lighten-4" />
            </v-avatar>
          </template>

          <v-card :width="profileMenuWidth" class="profile-menu-card">
            <v-card-title class="text-subtitle-1 font-weight-medium">User Profile</v-card-title>
            <v-card-subtitle class="text-caption">Manage your account settings.</v-card-subtitle>

            <v-card-text>
              <div class="d-flex align-center ga-4 mb-4">
                <v-avatar size="64" color="orange-lighten-4">
                  <v-img
                    v-if="avatarSrc && !avatarImgError"
                    :key="avatarSrc"
                    :src="avatarSrc"
                    cover
                    @error="avatarImgError = true"
                  />
                  <UserCircle v-else :size="40" class="text-orange-darken-2" />
                </v-avatar>

                <div>
                  <v-btn
                    variant="text"
                    size="small"
                    color="orange-darken-2"
                    class="text-none"
                    :loading="avatarUploading"
                    :disabled="avatarUploading"
                    @click="triggerFileInput"
                  >
                    <template #prepend>
                      <Camera :size="16" />
                    </template>
                    {{ avatarUploading ? 'Uploading...' : 'Change Photo' }}
                  </v-btn>
                  <input
                    ref="fileInput"
                    type="file"
                    accept="image/*"
                    style="display: none"
                    @change="handleFileChange"
                  />
                </div>
              </div>

              <v-divider class="mb-4" />

              <div class="profile-info">
                <div class="d-flex align-center mb-3">
                  <div class="text-caption text-grey-darken-1 profile-label">NAME</div>
                  <div class="text-body-2 font-weight-medium">{{ fullName }}</div>
                </div>

                <div class="d-flex align-center mb-3">
                  <div class="text-caption text-grey-darken-1 profile-label">ROLE</div>
                  <div class="text-body-2">{{ formatRole(user.role) }}</div>
                </div>

                <div class="d-flex align-center">
                  <div class="text-caption text-grey-darken-1 profile-label">EMAIL</div>
                  <div class="text-body-2 text-truncate" :title="user.email">{{ user.email }}</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-menu>

        <div class="ml-3">
          <h2 class="text-white text-body-2 font-weight-medium">{{ fullName }}</h2>
          <p class="text-orange-lighten-4 text-caption">{{ formatRole(user.role) }}</p>
        </div>
      </div>
    </div>

    <!-- Navigation Menu -->
    <v-list class="pa-4" nav color="transparent">
      <template v-for="item in menuItems" :key="item.name">
        <v-list-item
          v-if="item.access"
          :active="isActive(item.route)"
          :value="item.name"
          rounded="lg"
          class="mb-2"
          @click="navigateTo(item.route)"
        >
          <template #prepend>
            <component :is="item.icon" :size="20" class="text-white" />
          </template>
          <v-list-item-title class="text-body-2 text-white ml-2">{{
            item.label
          }}</v-list-item-title>
        </v-list-item>
      </template>
    </v-list>

    <!-- Logout Button -->
    <template #append>
      <hr style="border-color: rgba(255, 152, 0, 0.3)" />
      <div class="pa-4">
        <v-btn
          block
          variant="text"
          color="white"
          class="text-none justify-start logout-btn mb-4"
          @click="handleLogout"
        >
          <template #prepend>
            <LogOut :size="20" class="text-white" />
          </template>
          Logout
        </v-btn>

        <!-- Footer Info -->
        <div class="footer-card pa-3 text-center rounded-lg">
          <p class="text-white text-caption">Streamlined Quality, Compliance, and Documentation</p>
        </div>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.sidebar-drawer {
  background-color: rgb(124, 45, 18) !important;
  color: white;
  height: 100vh !important;
  overflow-y: auto !important;
}

@media (min-width: 600px) {
  .sidebar-drawer {
    position: fixed !important;
    top: 0;
    left: 0;
  }
}

.profile-menu-card {
  margin-inline-start: 16px;
}

.border-b-profile {
  border-bottom: 1px solid rgba(255, 152, 0, 0.3);
}

.profile-avatar {
  transition: background-color 0.2s;
}

.profile-avatar:hover {
  background-color: rgb(230, 81, 0) !important;
}

.profile-info .profile-label {
  width: 80px;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.v-list-item {
  color: rgb(254, 215, 170) !important;
}

.v-list-item--active {
  background-color: rgb(194, 65, 12) !important;
  color: white !important;
}

.v-list-item:not(.v-list-item--active):hover {
  background-color: rgb(151, 38, 7) !important;
  color: white !important;
}

.logout-btn:hover {
  background-color: rgb(151, 38, 7) !important;
  color: white !important;
}

.footer-card {
  background-color: rgb(151, 38, 7);
  border: 1px solid rgba(255, 152, 0, 0.2);
}

@media (max-width: 599px) {
  .profile-menu-card {
    margin-inline-start: 8px;
  }
}
</style>
