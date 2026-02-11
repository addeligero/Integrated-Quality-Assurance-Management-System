<script setup lang="ts">
import { inject } from 'vue'
import type { User } from '@/types/user'
import type { Ref } from 'vue'

const user = inject<Ref<User | null>>('user')
</script>

<template>
  <div v-if="user">
    <h1 class="text-h4 font-weight-bold mb-4">Dashboard</h1>
    <v-card>
      <v-card-text>
        <p class="text-h6">Welcome, {{ user.f_name }} {{ user.l_name }}!</p>
        <p class="text-body-1 mt-2">This is your dashboard overview.</p>
      </v-card-text>
    </v-card>
  </div>
</template>
