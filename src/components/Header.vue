<script setup lang="ts">
import { ref } from 'vue'
import { Menu, X } from 'lucide-vue-next'
import logoImage from '@/assets/img/logo/Quams-logo.png'
import Notification from '@/components/Notification.vue'

interface Props {
  isMobile: boolean
}

interface Emits {
  (e: 'toggle-drawer'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const showLogoPreview = ref(false)
</script>

<template>
  <v-app-bar flat color="white" class="border-b px-2 px-sm-4" :height="isMobile ? 64 : 72">
    <v-btn
      v-if="isMobile"
      icon
      variant="text"
      color="grey-darken-3"
      class="mr-1"
      @click="emit('toggle-drawer')"
    >
      <Menu :size="20" />
    </v-btn>

    <!-- Title -->
    <div class="header-title" :class="isMobile ? 'ml-1' : 'ml-2'">
      <h1
        class="font-weight-bold text-grey-darken-4"
        :class="isMobile ? 'text-caption' : 'text-body-1'"
      >
        {{ isMobile ? 'QuAMS' : 'Integrated Quality Assurance Management System' }}
      </h1>
      <p v-if="!isMobile" class="text-caption text-grey">Manage your quality assurance documents</p>
    </div>

    <v-spacer />

    <div class="d-flex align-center ga-1 mr-1 mr-sm-2">
      <!-- Replace old bell menu with: -->
      <Notification />

      <!-- Logo -->
      <div class="d-flex align-center ml-1 ml-sm-2">
        <v-avatar
          :size="isMobile ? 40 : 48"
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

.header-title {
  min-width: 0;
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
