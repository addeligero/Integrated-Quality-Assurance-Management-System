import { createRouter, createWebHistory } from 'vue-router'
import LoginForm from '@/views/Auth/LoginForm.vue'
import ViewLayout from '@/layouts/ViewLayout.vue'
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
      component: ViewLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/Dashboard.vue'),
        },
        {
          path: 'upload',
          name: 'upload',
          component: () => import('@/views/Upload.vue'),
        },
        {
          path: 'repository',
          name: 'repository',
          component: () => import('@/views/Repository.vue'),
        },
        {
          path: 'compliance',
          name: 'compliance',
          component: () => import('@/views/Compliance.vue'),
        },
        {
          path: 'classification',
          name: 'classification',
          component: () => import('@/views/Classification.vue'),
        },
        {
          path: 'admin',
          name: 'admin',
          component: () => import('@/views/Admin.vue'),
        },
      ],
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
