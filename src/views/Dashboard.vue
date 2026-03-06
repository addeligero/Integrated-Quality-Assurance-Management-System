<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { FileText, CheckCircle, Clock, TrendingUp, Upload, FolderOpen } from 'lucide-vue-next'
import { useDashboardStore } from '@/stores/dashboard'

const router = useRouter()
const store = useDashboardStore()
const {
  loading,
  initialized,
  stats,
  categoryDistribution,
  recentActivity,
  approvalRate,
  rejectionRate,
  approvedDocs,
  rejectedDocs,
  classifiedDocs,
} = storeToRefs(store)

const statIcons = { FileText, CheckCircle, Clock, TrendingUp }

const statColors: Record<string, string> = {
  'orange-darken-2': 'bg-orange',
  'green-darken-2': 'bg-green',
  'yellow-darken-2': 'bg-yellow',
  'amber-darken-2': 'bg-amber',
}

const statusChipColor = (status: string) => {
  if (status === 'validated') return 'orange-lighten-4'
  if (status === 'completed') return 'green-lighten-4'
  if (status === 'rejected') return 'red-lighten-4'
  return 'yellow-lighten-4'
}

const statusTextColor = (status: string) => {
  if (status === 'validated') return 'orange-darken-3'
  if (status === 'completed') return 'green-darken-3'
  if (status === 'rejected') return 'red-darken-3'
  return 'yellow-darken-4'
}

onMounted(() => {
  if (!initialized.value) store.initialize()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <h2 class="text-h5 text-grey-darken-3 mb-2 font-weight-medium">Dashboard Overview</h2>
      <p class="text-body-2 text-grey-darken-1">
        Monitor document processing and classification status
      </p>
    </div>

    <!-- Stats Grid -->
    <v-row class="mb-6">
      <v-col v-for="(stat, i) in stats" :key="i" cols="12" sm="6" lg="3">
        <v-card elevation="1" height="100%">
          <v-card-text class="pa-6">
            <div class="d-flex align-start justify-space-between">
              <div>
                <p class="text-body-2 text-grey-darken-1 mb-1">{{ stat.label }}</p>
                <p class="text-h5 font-weight-bold text-grey-darken-3">
                  <v-skeleton-loader v-if="loading" type="text" width="60" />
                  <span v-else>{{ stat.value }}</span>
                </p>
              </div>
              <v-avatar :color="stat.color" size="48" rounded="lg">
                <component
                  :is="statIcons[stat.icon as keyof typeof statIcons]"
                  :size="24"
                  class="text-white"
                />
              </v-avatar>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Distribution + Quick Actions -->
    <v-row class="mb-6">
      <!-- Category Distribution -->
      <v-col cols="12" lg="8">
        <v-card elevation="1" height="100%">
          <v-card-text class="pa-6">
            <div class="d-flex align-center justify-space-between mb-6">
              <h3 class="text-h6 text-grey-darken-3">Document Classification Distribution</h3>
            </div>

            <div v-if="loading" class="d-flex flex-column ga-4">
              <v-skeleton-loader v-for="n in 4" :key="n" type="text" />
            </div>

            <div v-else-if="categoryDistribution.length === 0" class="text-center py-8 text-grey">
              No classified documents yet
            </div>

            <div v-else class="d-flex flex-column ga-5">
              <div v-for="cat in categoryDistribution" :key="cat.name">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-body-2 text-grey-darken-2 font-weight-medium">{{
                    cat.name
                  }}</span>
                  <span class="text-body-2 text-grey-darken-1">
                    {{ cat.count }} document{{ cat.count !== 1 ? 's' : '' }} ({{ cat.percentage }}%)
                  </span>
                </div>

                <v-progress-linear
                  :model-value="cat.percentage"
                  :color="cat.color"
                  bg-color="grey-lighten-3"
                  height="10"
                  rounded
                />
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Quick Actions -->
      <v-col cols="12" lg="4">
        <v-card elevation="1" height="100%">
          <v-card-text class="pa-6">
            <h3 class="text-h6 text-grey-darken-3 mb-4">Quick Actions</h3>

            <div class="d-flex flex-column ga-3">
              <v-btn
                block
                color="orange-darken-2"
                size="large"
                class="text-none justify-start"
                @click="router.push('/dashboard/upload')"
              >
                <template #prepend>
                  <Upload :size="20" />
                </template>
                Upload Document
              </v-btn>

              <v-btn
                block
                color="grey-lighten-3"
                size="large"
                class="text-none justify-start text-grey-darken-2"
                @click="router.push('/dashboard/repository')"
              >
                <template #prepend>
                  <FolderOpen :size="20" />
                </template>
                Browse Repository
              </v-btn>
            </div>

            <!-- Approval / Rejection Rate -->
            <div class="mt-6 d-flex flex-column ga-4">
              <div>
                <div class="d-flex align-center justify-space-between mb-1">
                  <span class="text-body-2 text-grey-darken-2 font-weight-medium">Approved</span>
                  <span class="text-body-2 text-green-darken-2 font-weight-bold">
                    <v-skeleton-loader v-if="loading" type="text" width="40" />
                    <span v-else>{{ approvalRate }}% ({{ approvedDocs }})</span>
                  </span>
                </div>
                <v-progress-linear
                  :model-value="approvalRate"
                  color="green-darken-2"
                  bg-color="grey-lighten-3"
                  height="8"
                  rounded
                />
              </div>

              <div>
                <div class="d-flex align-center justify-space-between mb-1">
                  <span class="text-body-2 text-grey-darken-2 font-weight-medium">Rejected</span>
                  <span class="text-body-2 text-red-darken-2 font-weight-bold">
                    <v-skeleton-loader v-if="loading" type="text" width="40" />
                    <span v-else>{{ rejectionRate }}% ({{ rejectedDocs }})</span>
                  </span>
                </div>
                <v-progress-linear
                  :model-value="rejectionRate"
                  color="red-darken-2"
                  bg-color="grey-lighten-3"
                  height="8"
                  rounded
                />
              </div>

              <p class="text-caption text-grey text-center">
                Based on {{ classifiedDocs }} classified document{{
                  classifiedDocs !== 1 ? 's' : ''
                }}
              </p>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Recent Activity -->
    <v-card elevation="1">
      <v-card-title class="pa-6 border-b text-h6 text-grey-darken-3">Recent Activity</v-card-title>
      <v-divider />

      <div v-if="loading">
        <div v-for="n in 4" :key="n" class="pa-6 border-b">
          <v-skeleton-loader type="list-item-two-line" />
        </div>
      </div>

      <div v-else-if="recentActivity.length === 0" class="pa-12 text-center text-grey">
        No recent activity
      </div>

      <div
        v-else
        v-for="activity in recentActivity"
        :key="activity.id"
        class="pa-6 activity-row"
        style="border-bottom: 1px solid rgb(224, 224, 224)"
      >
        <div class="d-flex align-start justify-space-between">
          <div class="flex-grow-1">
            <div class="d-flex align-center ga-3 mb-1 flex-wrap">
              <span class="text-body-1 text-grey-darken-3 font-weight-medium">
                {{ activity.action }}
              </span>
              <v-chip
                :color="statusChipColor(activity.status)"
                size="x-small"
                variant="flat"
                class="text-caption font-weight-medium"
                :style="`color: rgb(var(--v-theme-${statusTextColor(activity.status)}))`"
              >
                {{ activity.status }}
              </v-chip>
            </div>
            <p class="text-body-2 text-grey-darken-1 mb-1">{{ activity.file }}</p>
            <p class="text-caption text-grey">by {{ activity.user }}</p>
          </div>
          <span class="text-caption text-grey ml-4 text-no-wrap">{{ activity.time }}</span>
        </div>
      </div>
    </v-card>
  </div>
</template>

<style scoped>
.activity-row:last-child {
  border-bottom: none !important;
}

.border-b {
  border-bottom: 1px solid rgb(224, 224, 224);
}
</style>
