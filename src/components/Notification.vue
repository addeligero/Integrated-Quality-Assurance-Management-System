<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, Check, Info, AlertTriangle, X, CheckCheck } from 'lucide-vue-next'
import { useNotificationStore } from '@/stores/notification'
import { storeToRefs } from 'pinia'
import type { RealtimeChannel } from '@supabase/supabase-js'

const router = useRouter()
const store = useNotificationStore()
const { notifications, unreadCount } = storeToRefs(store)

let channel: RealtimeChannel | undefined

onMounted(async () => {
  await store.fetchNotifications()
  channel = store.subscribeToNotifications()
})

onUnmounted(() => {
  channel?.unsubscribe()
})

const handleNotificationClick = async (item: (typeof notifications.value)[0]) => {
  await store.markAsRead(item.id)
  if (item.link) router.push(item.link)
}

const getIconColor = (type: string) => {
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

const getIconBg = (type: string) => {
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

const formatTime = (dateString: string) => {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
</script>

<template>
  <v-menu :close-on-content-click="false" location="bottom end" offset="8">
    <template #activator="{ props: menuProps }">
      <v-btn v-bind="menuProps" icon variant="text" color="grey-darken-1" size="small">
        <v-badge
          v-if="unreadCount > 0"
          :content="unreadCount > 9 ? '9+' : unreadCount"
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

    <v-card width="360" rounded="lg" elevation="8">
      <!-- Header -->
      <div class="d-flex align-center justify-space-between px-4 py-3 border-b">
        <span class="text-subtitle-2 font-weight-bold">
          Notifications
          <v-chip v-if="unreadCount > 0" size="x-small" color="red" class="ml-1">
            {{ unreadCount }}
          </v-chip>
        </span>
        <v-btn
          v-if="unreadCount > 0"
          variant="text"
          size="x-small"
          color="deep-orange-darken-2"
          class="text-none text-caption"
          @click="store.markAllAsRead"
        >
          <CheckCheck :size="14" class="mr-1" />
          Mark all read
        </v-btn>
      </div>

      <!-- List -->
      <v-virtual-scroll
        :items="notifications"
        :height="notifications.length > 0 ? 320 : 120"
        item-height="92"
      >
        <template #default="{ item }">
          <div
            class="px-4 py-3 border-b notification-item cursor-pointer d-flex ga-3"
            :class="{ 'unread-bg': !item.read }"
            @click="handleNotificationClick(item)"
          >
            <!-- Icon -->
            <v-avatar size="32" :class="getIconBg(item.type)" class="mt-1 flex-shrink-0">
              <Check v-if="item.type === 'success'" :size="16" :color="getIconColor(item.type)" />
              <AlertTriangle
                v-else-if="item.type === 'warning'"
                :size="16"
                :color="getIconColor(item.type)"
              />
              <X v-else-if="item.type === 'error'" :size="16" :color="getIconColor(item.type)" />
              <Info v-else :size="16" :color="getIconColor(item.type)" />
            </v-avatar>

            <!-- Content -->
            <div class="flex-grow-1 overflow-hidden">
              <div class="d-flex align-start justify-space-between">
                <span
                  class="text-body-2"
                  :class="
                    !item.read ? 'font-weight-medium text-grey-darken-4' : 'text-grey-darken-1'
                  "
                >
                  {{ item.title }}
                </span>
                <span class="text-caption text-grey ml-2 flex-shrink-0">
                  {{ formatTime(item.created_at) }}
                </span>
              </div>
              <p class="text-caption text-grey mt-1 notification-message">{{ item.message }}</p>
            </div>

            <!-- Unread dot + delete -->
            <div class="d-flex flex-column align-center ga-1 flex-shrink-0">
              <div v-if="!item.read" class="unread-dot" />
              <v-btn
                icon
                size="x-small"
                variant="text"
                color="grey"
                @click.stop="store.deleteNotification(item.id)"
              >
                <X :size="12" />
              </v-btn>
            </div>
          </div>
        </template>
      </v-virtual-scroll>

      <!-- Empty state -->
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
</template>

<style scoped>
.border-b {
  border-bottom: 1px solid rgb(229, 231, 235) !important;
}
.border-t {
  border-top: 1px solid rgb(229, 231, 235) !important;
}
.notification-item:hover {
  background-color: rgb(249, 250, 251);
}
.unread-bg {
  background-color: rgba(255, 237, 213, 0.4);
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
