import { createRouter, createWebHistory } from 'vue-router'
import LoginForm from '@/views/Auth/LoginForm.vue'
import ViewLayout from '@/layouts/ViewLayout.vue'
import { useUserStore } from '@/stores/user'

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
          component: () => import('@/views/upload.vue'),
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
          meta: { requiresValidationAccess: true },
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

router.beforeEach(async (to, _from, next) => {
  const userStore = useUserStore()

  // Initialize the store once
  if (!userStore.initialized) {
    await userStore.initialize()
  }

  const isLoggedIn = userStore.isAuthenticated

  if (to.meta.requiresAuth && !isLoggedIn) {
    next('/')
  } else if (to.meta.requiresGuest && isLoggedIn) {
    next('/dashboard')
  } else if (to.meta.requiresValidationAccess && !userStore.hasValidationAccess) {
    if (typeof window !== 'undefined') {
      window.alert('Access denied: You are not authorized to open Classification.')
    }
    next('/dashboard')
  } else {
    next()
  }
})

export default router
