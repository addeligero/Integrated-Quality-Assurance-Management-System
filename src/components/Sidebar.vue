<script setup lang="ts">
import { ref, computed } from 'vue'
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
} from 'lucide-vue-next'
import type { User, TabType } from '@/types/user'
import supabase from '@/lib/supabase'

interface Props {
  user: User
  activeTab: TabType
}

interface Emits {
  (e: 'tab-change', tab: TabType): void
  (e: 'logout'): void
  (e: 'update-user', user: User): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const showProfileMenu = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const fullName = computed(() => `${props.user.f_name} ${props.user.l_name}`.trim() || 'User')

const isQuamsCoordinator = computed(() => props.user.role === 'quams_coordinator')
const isDean = computed(() => props.user.role === 'dean')
const isAdmin = computed(() => props.user.role === 'admin')
const hasAdminAccess = computed(() => isDean.value || isQuamsCoordinator.value || isAdmin.value)
const hasValidationAccess = computed(
  () =>
    hasAdminAccess.value ||
    props.user.role === 'associate_dean' ||
    props.user.role === 'department',
)

const menuItems = computed(() => [
  { id: 'overview' as TabType, label: 'Dashboard', icon: LayoutDashboard, access: true },
  { id: 'upload' as TabType, label: 'Upload Documents', icon: Upload, access: true },
  {
    id: 'repository' as TabType,
    label: 'Document Repository',
    icon: FolderSearch,
    access: true,
  },
  { id: 'compliance' as TabType, label: 'Compliance Matrix', icon: ClipboardCheck, access: true },
  {
    id: 'classification' as TabType,
    label: 'Classification',
    icon: Tags,
    access: hasValidationAccess.value,
  },
  {
    id: 'admin' as TabType,
    label: 'Administration',
    icon: Settings,
    access: hasAdminAccess.value,
  },
])

const formatRole = (role: string) => {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onloadend = () => {
      emit('update-user', { ...props.user, avatar: reader.result as string })
    }
    reader.readAsDataURL(file)
  }
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleLogout = async () => {
  await supabase.auth.signOut()
  emit('logout')
}
</script>

<template>
  <v-navigation-drawer permanent width="256" class="sidebar-drawer">
    <!-- User Profile Section -->
    <div class="pa-6 border-b-profile">
      <div class="d-flex align-center">
        <v-menu v-model="showProfileMenu" :close-on-content-click="false" location="end">
          <template #activator="{ props: menuProps }">
            <v-avatar
              v-bind="menuProps"
              size="56"
              class="cursor-pointer profile-avatar mb-3"
              color="orange-darken-1"
            >
              <v-img v-if="user.avatar" :src="user.avatar" cover />
              <UserCircle v-else :size="40" class="text-orange-lighten-4" />
            </v-avatar>
          </template>

          <v-card width="320" class="ml-4">
            <v-card-title class="text-subtitle-1 font-weight-medium">User Profile</v-card-title>
            <v-card-subtitle class="text-caption">Manage your account settings.</v-card-subtitle>

            <v-card-text>
              <div class="d-flex align-center ga-4 mb-4">
                <v-avatar size="64" color="orange-lighten-4">
                  <v-img v-if="user.avatar" :src="user.avatar" cover />
                  <UserCircle v-else :size="40" class="text-orange-darken-2" />
                </v-avatar>

                <div>
                  <v-btn
                    variant="text"
                    size="small"
                    color="orange-darken-2"
                    class="text-none"
                    @click="triggerFileInput"
                  >
                    <template #prepend>
                      <Camera :size="16" />
                    </template>
                    Change Photo
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
      <v-list-item
        v-for="item in menuItems"
        :key="item.id"
        :active="activeTab === item.id"
        :value="item.id"
        rounded="lg"
        class="mb-2"
        @click="emit('tab-change', item.id)"
      >
        <template #prepend>
          <component :is="item.icon" :size="20" class="text-white" />
        </template>
        <v-list-item-title class="text-body-2 text-white ml-2">{{ item.label }}</v-list-item-title>
      </v-list-item>
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
</style>
