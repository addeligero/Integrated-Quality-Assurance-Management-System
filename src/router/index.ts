import { createRouter, createWebHistory } from 'vue-router'
import LoginForm from '@/views/Auth/LoginForm.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginForm,
    },
  ],
})

export default router
