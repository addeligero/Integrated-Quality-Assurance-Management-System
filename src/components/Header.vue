<script setup lang="ts">
import { ref, computed } from 'vue'
import { Bell, Check, Info, AlertTriangle, X } from 'lucide-vue-next'
import logoImage from '@/assets/img/logo/Quams-logo.png'
import Notification from '@/components/Notification.vue'

interface Notification {
  id: string
  title: string
  message: string
  time: string
  read: boolean
  type: 'info' | 'success' | 'warning' | 'error'
}

const showLogoPreview = ref(false)

const getIconColor = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return 'green'
    case 'warning':
      return 'amber'
    case 'error':
      return 'red'
    default:
      return 'orange'
  }
}

const getIconBg = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return 'bg-green-lighten-5'
    case 'warning':
      return 'bg-amber-lighten-5'
    case 'error':
      return 'bg-red-lighten-5'
    default:
      return 'bg-orange-lighten-5'
  }
}
</script>

<template>
  <v-app-bar flat color="white" class="border-b" height="72">
    <!-- Title -->
    <div class="ml-4">
      <h1 class="text-body-1 font-weight-bold text-grey-darken-4">
        Integrated Quality Assurance Management System
      </h1>
      <p class="text-caption text-grey">Manage your quality assurance documents</p>
    </div>

    <v-spacer />

    <div class="d-flex align-center ga-1 mr-2">
      <!-- Replace old bell menu with: -->
      <Notification />

      <!-- Logo -->
      <div class="d-flex align-center ml-2">
        <v-avatar
          size="48"
          rounded="0"
          class="border pa-1 logo-clickable"
          color="white"
          @click="showLogoPreview = true"
        >
          <v-img :src="logoImage" alt="CSU CCIS QuAMS Logo" contain />
        </v-avatar>
      </div>
    </div>
  </v-app-bar>

  <!-- Logo Preview Dialog -->
  <v-dialog v-model="showLogoPreview" max-width="400" scrollable>
    <v-card rounded="xl" class="pa-2">
      <v-card-title class="d-flex align-center justify-space-between pb-0">
        <span class="text-subtitle-2 font-weight-bold text-grey-darken-3">CSU CCIS QuAMS</span>
        <v-btn icon variant="text" size="small" color="grey" @click="showLogoPreview = false">
          <X :size="18" />
        </v-btn>
      </v-card-title>
      <v-card-text class="d-flex justify-center align-center pa-6">
        <v-img
          :src="logoImage"
          alt="CSU CCIS QuAMS Logo"
          max-width="300"
          max-height="300"
          contain
        />
      </v-card-text>
      <v-card-subtitle class="text-center text-caption text-grey pb-4">
        Integrated Quality Assurance Management System
      </v-card-subtitle>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.border-b {
  border-bottom: 1px solid rgb(229, 231, 235) !important;
}

.logo-clickable {
  cursor: pointer;
  transition:
    opacity 0.2s,
    box-shadow 0.2s;
}

.logo-clickable:hover {
  opacity: 0.85;
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.35);
}

.notification-item:hover {
  background-color: rgb(249, 250, 251);
}

.unread-bg {
  background-color: rgba(255, 237, 213, 0.3);
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: rgb(249, 115, 22);
}

.notification-message {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notification-pulse :deep(.v-badge__badge) {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
