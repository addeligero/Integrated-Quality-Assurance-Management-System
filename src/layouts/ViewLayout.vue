<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import Sidebar from '@/components/Sidebar.vue'
import Header from '@/components/Header.vue'
import type { User } from '@/types/user'
import { useUserStore } from '@/stores/user'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import { useClassificationStore } from '@/stores/classification'
import { useRepositoryStore } from '@/stores/repository'

const router = useRouter()
const userStore = useUserStore()
const { user, loading } = storeToRefs(userStore)
const dashboardStore = useDashboardStore()
const classificationStore = useClassificationStore()
const repositoryStore = useRepositoryStore()
const { smAndDown, mdAndDown } = useDisplay()

const isMobile = computed(() => smAndDown.value)
const drawerOpen = ref(true)

watch(
  mdAndDown,
  (isCompact) => {
    drawerOpen.value = !isCompact
  },
  { immediate: true },
)

onMounted(async () => {
  if (!userStore.initialized) {
    await userStore.initialize()
  }
  if (!userStore.isAuthenticated) {
    router.push('/')
  }
  // Start realtime subscription app-wide so it works from any page
  dashboardStore.subscribe()
  classificationStore.subscribe()
  repositoryStore.subscribe()
})

onUnmounted(() => {
  dashboardStore.unsubscribe()
  classificationStore.unsubscribe()
  repositoryStore.unsubscribe()
})

const handleLogout = async () => {
  await userStore.logout()
  router.push('/')
}

const handleUpdateUser = async (updatedUser: User) => {
  await userStore.updateUser(updatedUser)
}

const toggleDrawer = () => {
  drawerOpen.value = !drawerOpen.value
}

const setDrawerState = (value: boolean) => {
  drawerOpen.value = value
}
</script>

<template>
  <v-app>
    <template v-if="loading">
      <v-container class="fill-height d-flex align-center justify-center">
        <v-progress-circular indeterminate color="orange-darken-2" size="64" />
      </v-container>
    </template>

    <template v-else-if="user">
      <Sidebar
        :user="user"
        :model-value="drawerOpen"
        :is-mobile="isMobile"
        @update:model-value="setDrawerState"
        @logout="handleLogout"
        @update-user="handleUpdateUser"
      />

      <Header :is-mobile="isMobile" @toggle-drawer="toggleDrawer" />

      <v-main class="main-content">
        <v-container fluid class="content-container">
          <router-view />
        </v-container>
      </v-main>
    </template>
  </v-app>
</template>

<style scoped>
.main-content {
  min-height: 100vh;
  overflow-y: auto;
}

.content-container {
  padding: 24px;
}

@media (max-width: 959px) {
  .content-container {
    padding: 16px;
  }
}

@media (max-width: 599px) {
  .content-container {
    padding: 12px;
  }
}
</style>
