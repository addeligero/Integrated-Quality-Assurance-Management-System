<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from '@/components/Sidebar.vue'
import Header from '@/components/Header.vue'
import type { User } from '@/types/user'
import { useUserStore } from '@/stores/user'
import { storeToRefs } from 'pinia'

const router = useRouter()
const userStore = useUserStore()
const { user, loading } = storeToRefs(userStore)

onMounted(async () => {
  if (!userStore.initialized) {
    await userStore.initialize()
  }
  if (!userStore.isAuthenticated) {
    router.push('/')
  }
})

const handleLogout = async () => {
  await userStore.logout()
  router.push('/')
}

const handleUpdateUser = async (updatedUser: User) => {
  await userStore.updateUser(updatedUser)
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
      <Sidebar :user="user" @logout="handleLogout" @update-user="handleUpdateUser" />

      <Header />

      <v-main class="main-content">
        <v-container fluid class="pa-6">
          <router-view />
        </v-container>
      </v-main>
    </template>
  </v-app>
</template>

<style scoped>
.main-content {
  height: 100vh;
  overflow-y: auto;
}
</style>
