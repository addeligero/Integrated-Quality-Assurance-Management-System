<script setup lang="ts">
import { ref, computed } from 'vue'
import { Bell, Check, Info, AlertTriangle, X } from 'lucide-vue-next'
import logoImage from '@/assets/img/logo/Quams-logo.png'

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
      <!-- Notification Bell -->
      <v-menu
        v-model="showNotifications"
        :close-on-content-click="false"
        location="bottom end"
        offset="8"
      >
        <template #activator="{ props: menuProps }">
          <v-btn v-bind="menuProps" icon variant="text" color="grey-darken-1" size="small">
            <v-badge
              v-if="unreadCount > 0"
              dot
              color="red"
              offset-x="-2"
              offset-y="-2"
              class="notification-pulse"
            >
              <Bell :size="20" />
            </v-badge>
            <Bell v-else :size="20" />
          </v-btn>
        </template>

        <v-card width="340" rounded="lg" elevation="8">
          <!-- Header -->
          <div class="d-flex align-center justify-space-between px-4 py-3 border-b">
            <span class="text-subtitle-2 font-weight-bold">Notifications</span>
            <v-btn
              v-if="unreadCount > 0"
              variant="text"
              size="x-small"
              color="deep-orange-darken-2"
              class="text-none text-caption"
              @click="markAllAsRead"
            >
              Mark all as read
            </v-btn>
          </div>

          <!-- Notification List -->
          <v-virtual-scroll
            :items="notifications"
            :height="notifications.length > 0 ? 300 : 150"
            item-height="88"
          >
            <template #default="{ item }">
              <div
                class="px-4 py-3 border-b notification-item cursor-pointer"
                :class="{ 'unread-bg': !item.read }"
                @click="markAsRead(item.id)"
              >
                <div class="d-flex ga-3">
                  <!-- Icon -->
                  <v-avatar size="32" :class="getIconBg(item.type)" class="mt-1 flex-shrink-0">
                    <Check
                      v-if="item.type === 'success'"
                      :size="16"
                      :color="getIconColor(item.type)"
                    />
                    <AlertTriangle
                      v-else-if="item.type === 'warning'"
                      :size="16"
                      :color="getIconColor(item.type)"
                    />
                    <X
                      v-else-if="item.type === 'error'"
                      :size="16"
                      :color="getIconColor(item.type)"
                    />
                    <Info v-else :size="16" :color="getIconColor(item.type)" />
                  </v-avatar>

                  <!-- Content -->
                  <div class="flex-grow-1 overflow-hidden">
                    <div class="d-flex align-start justify-space-between">
                      <span
                        class="text-body-2"
                        :class="
                          !item.read
                            ? 'font-weight-medium text-grey-darken-4'
                            : 'text-grey-darken-1'
                        "
                      >
                        {{ item.title }}
                      </span>
                      <span class="text-caption text-grey ml-2 flex-shrink-0">{{ item.time }}</span>
                    </div>
                    <p class="text-caption text-grey mt-1 notification-message">
                      {{ item.message }}
                    </p>
                  </div>

                  <!-- Unread dot -->
                  <div v-if="!item.read" class="d-flex align-center flex-shrink-0">
                    <div class="unread-dot"></div>
                  </div>
                </div>
              </div>
            </template>
          </v-virtual-scroll>

          <!-- Empty State -->
          <div
            v-if="notifications.length === 0"
            class="d-flex flex-column align-center justify-center pa-6 text-grey"
          >
            <Bell :size="32" class="mb-2" style="opacity: 0.2" />
            <span class="text-body-2">No notifications</span>
          </div>

          <!-- Footer -->
          <div class="pa-2 border-t bg-grey-lighten-5 text-center">
            <v-btn variant="text" size="small" block class="text-none text-caption text-grey">
              View all notifications
            </v-btn>
          </div>
        </v-card>
      </v-menu>

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
