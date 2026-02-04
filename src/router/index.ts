import { createRouter, createWebHistory } from 'vue-router'
import LoginForm from '@/views/Auth/LoginForm.vue'
import AllDashboard from '@/views/Auth/public/AllDashboard.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginForm,
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: AllDashboard,
    },
  ],
})

export default router
