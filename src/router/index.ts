import { createRouter, createWebHistory } from 'vue-router'
import LoginForm from '@/views/Auth/LoginForm.vue'
import Dashboard from '@/views/Dashboard.vue'
import supabase from '@/lib/supabase'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginForm,
      meta: { requiresGuest: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: Dashboard,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to, from, next) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (to.meta.requiresAuth && !session) {
    next('/')
  } else if (to.meta.requiresGuest && session) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
