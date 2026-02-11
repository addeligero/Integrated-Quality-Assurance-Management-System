<script setup lang="ts">
import { ref, onMounted, provide } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from '@/components/Sidebar.vue'
import Header from '@/components/Header.vue'
import type { User } from '@/types/user'
import supabase from '@/lib/supabase'

const router = useRouter()
const user = ref<User | null>(null)
const loading = ref(true)

// Provide user to child components
provide('user', user)

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
      <Sidebar :user="user" @logout="handleLogout" @update-user="handleUpdateUser" />

      <Header />

      <v-main>
        <v-container fluid class="pa-6">
          <router-view />
        </v-container>
      </v-main>
    </template>
  </v-app>
</template>
