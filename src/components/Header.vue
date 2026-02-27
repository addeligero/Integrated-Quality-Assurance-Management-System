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

const showNotifications = ref(false)

const notifications = ref<Notification[]>([
  {
    id: '1',
    title: 'Document Approved',
    message: 'Your syllabus for CS101 has been approved by the Dean.',
    time: '2 hours ago',
    read: false,
    type: 'success',
  },
  {
    id: '2',
    title: 'Pending Review',
    message: 'Faculty load report needs your attention.',
    time: '5 hours ago',
    read: false,
    type: 'warning',
  },
  {
    id: '3',
    title: 'System Maintenance',
    message: 'Scheduled maintenance on Saturday at 10:00 PM.',
    time: '1 day ago',
    read: true,
    type: 'info',
  },
  {
    id: '4',
    title: 'Upload Failed',
    message: 'Failed to process accreditation-report.pdf. Please try again.',
    time: '2 days ago',
    read: true,
    type: 'error',
  },
])

const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)

const markAsRead = (id: string) => {
  const n = notifications.value.find((n) => n.id === id)
  if (n) n.read = true
}

const markAllAsRead = () => {
  notifications.value.forEach((n) => (n.read = true))
}

const clearNotification = (id: string) => {
  notifications.value = notifications.value.filter((n) => n.id !== id)
}

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
        <v-avatar size="48" rounded="0" class="border pa-1" color="white">
          <v-img :src="logoImage" alt="CSU CCIS QuAMS Logo" contain />
        </v-avatar>
      </div>
    </div>
  </v-app-bar>
</template>

<style scoped>
.border-b {
  border-bottom: 1px solid rgb(229, 231, 235) !important;
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
