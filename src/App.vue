<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const { isAuthenticated, forcedLogoutReason } = storeToRefs(userStore)

// Auto-redirect when a user is force-logged-out (e.g. deactivated by admin)
watch(isAuthenticated, (authed) => {
  if (!authed && router.currentRoute.value.meta.requiresAuth) {
    const reason = forcedLogoutReason.value
    forcedLogoutReason.value = null
    router.push(reason === 'deactivated' ? { path: '/', query: { reason: 'deactivated' } } : '/')
  }
})
</script>

<template>
  <v-app>
    <router-view />
  </v-app>
</template>
