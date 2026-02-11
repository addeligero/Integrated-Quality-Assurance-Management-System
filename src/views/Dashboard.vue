<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from '@/components/Sidebar.vue'
import Header from '@/components/Header.vue'
import type { User, TabType } from '@/types/user'
import supabase from '@/lib/supabase'

const router = useRouter()
const user = ref<User | null>(null)
const activeTab = ref<TabType>('overview')
const loading = ref(true)

onMounted(async () => {
  await loadUserProfile()
})

const loadUserProfile = async () => {
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      router.push('/')
      return
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (error || !profile) {
      console.error('Error loading profile:', error)
      router.push('/')
      return
    }

    user.value = {
      id: profile.id,
      f_name: profile.f_name,
      l_name: profile.l_name,
      email: authUser.email || '',
      role: profile.role,
      department: profile.department,
      status: profile.status,
      avatar: profile.avatar,
    }
  } catch (error) {
    console.error('Error:', error)
    router.push('/')
  } finally {
    loading.value = false
  }
}

const handleTabChange = (tab: TabType) => {
  activeTab.value = tab
}

const handleLogout = () => {
  user.value = null
  router.push('/')
}

const handleUpdateUser = async (updatedUser: User) => {
  if (!user.value) return

  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        avatar: updatedUser.avatar,
        f_name: updatedUser.f_name,
        l_name: updatedUser.l_name,
      })
      .eq('id', updatedUser.id)

    if (!error) {
      user.value = updatedUser
    }
  } catch (error) {
    console.error('Error updating user:', error)
  }
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
        :active-tab="activeTab"
        @tab-change="handleTabChange"
        @logout="handleLogout"
        @update-user="handleUpdateUser"
      />

      <Header />

      <v-main>
        <v-container fluid class="pa-6">
          <!-- Overview Tab -->
          <div v-if="activeTab === 'overview'">
            <h1 class="text-h4 font-weight-bold mb-4">Dashboard</h1>
            <v-card>
              <v-card-text>
                <p class="text-h6">Welcome, {{ user.f_name }} {{ user.l_name }}!</p>
                <p class="text-body-1 mt-2">This is your dashboard overview.</p>
              </v-card-text>
            </v-card>
          </div>

          <!-- Upload Tab -->
          <div v-else-if="activeTab === 'upload'">
            <h1 class="text-h4 font-weight-bold mb-4">Upload Documents</h1>
            <v-card>
              <v-card-text>
                <p>Upload your documents here.</p>
              </v-card-text>
            </v-card>
          </div>

          <!-- Repository Tab -->
          <div v-else-if="activeTab === 'repository'">
            <h1 class="text-h4 font-weight-bold mb-4">Document Repository</h1>
            <v-card>
              <v-card-text>
                <p>Browse and search documents.</p>
              </v-card-text>
            </v-card>
          </div>

          <!-- Compliance Tab -->
          <div v-else-if="activeTab === 'compliance'">
            <h1 class="text-h4 font-weight-bold mb-4">Compliance Matrix</h1>
            <v-card>
              <v-card-text>
                <p>View compliance status and requirements.</p>
              </v-card-text>
            </v-card>
          </div>

          <!-- Classification Tab -->
          <div v-else-if="activeTab === 'classification'">
            <h1 class="text-h4 font-weight-bold mb-4">Classification</h1>
            <v-card>
              <v-card-text>
                <p>Classify and categorize documents.</p>
              </v-card-text>
            </v-card>
          </div>

          <!-- Admin Tab -->
          <div v-else-if="activeTab === 'admin'">
            <h1 class="text-h4 font-weight-bold mb-4">Administration</h1>
            <v-card>
              <v-card-text>
                <p>Manage system settings and users.</p>
              </v-card-text>
            </v-card>
          </div>
        </v-container>
      </v-main>
    </template>
  </v-app>
</template>
