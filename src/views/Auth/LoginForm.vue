<script setup lang="ts">
import { ref } from 'vue'
import { Lock, Eye, EyeOff } from 'lucide-vue-next'
import type { User, UserRole } from '@/types/user'
import logoImage from '@/assets/img/logo/Quams-logo.png'

const emit = defineEmits<{
  login: [user: User]
}>()

const email = ref('')
const password = ref('')
const selectedRole = ref<UserRole>('faculty')
const showPassword = ref(false)

const roles = [
  {
    value: 'dean' as UserRole,
    label: 'Dean',
    description: 'Full system configuration rights',
  },
  {
    value: 'quams_coordinator' as UserRole,
    label: 'QuAMS Coordinator',
    description: 'Full system configuration rights',
  },
  {
    value: 'associate_dean' as UserRole,
    label: 'Associate Dean',
    description: 'Validation authority',
  },
  {
    value: 'department' as UserRole,
    label: 'Department Head',
    description: 'Validation authority',
  },
  {
    value: 'faculty' as UserRole,
    label: 'Faculty Member',
    description: 'Upload and view assigned documents',
  },
  {
    value: 'staff' as UserRole,
    label: 'Staff',
    description: 'Upload and view assigned documents',
  },
]

const handleSubmit = () => {
  const user: User = {
    id: Math.random().toString(36).substring(2, 11),
    name: email.value.split('@')[0],
    role: selectedRole.value,
    email: email.value,
  }

  emit('login', user)
}

const getSelectedRoleDescription = () => {
  return roles.find((r) => r.value === selectedRole.value)?.description
}
</script>

<template>
  <div class="login-container">
    <!-- Left Side - Image/Branding (visible on large screens) -->
    <div class="branding-section">
      <div class="branding-overlay"></div>

      <!-- Decorative elements -->
      <div class="decorative-elements">
        <div class="decorative-circle decorative-circle-1"></div>
        <div class="decorative-circle decorative-circle-2"></div>
      </div>

      <div class="branding-content">
        <img :src="logoImage" alt="CSU CCIS QuAMS Logo" class="branding-logo" />
        <h1 class="branding-title">
          Integrated Quality Assurance Management System
        </h1>
        <div class="branding-divider"></div>
        <p class="branding-description">
          Advancing institutional excellence through streamlined quality assurance,
          intelligent classification, and secure document management.
        </p>
      </div>
    </div>

    <!-- Right Side - Login Form -->
    <div class="form-section">
      <div class="form-wrapper">
        <!-- Mobile-only header -->
        <div class="mobile-header">
          <img :src="logoImage" alt="CSU CCIS QuAMS Logo" class="mobile-logo" />
          <h1 class="mobile-title">
            Integrated Quality Assurance Management System
          </h1>
        </div>

        <div class="form-card">
          <div class="form-header">
            <h2 class="form-title">Sign In</h2>
            <p class="form-subtitle">Enter your credentials to access the system</p>
          </div>

          <form @submit.prevent="handleSubmit" class="login-form">
            <div class="form-group">
              <label for="email" class="form-label">Email Address</label>
              <input
                type="email"
                id="email"
                v-model="email"
                class="form-input"
                placeholder="name@institution.edu"
                required
              />
            </div>

            <div class="form-group">
              <label for="password" class="form-label">Password</label>
              <div class="password-wrapper">
                <input
                  :type="showPassword ? 'text' : 'password'"
                  id="password"
                  v-model="password"
                  class="form-input"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="password-toggle"
                >
                  <EyeOff v-if="showPassword" :size="20" />
                  <Eye v-else :size="20" />
                </button>
              </div>
            </div>

            <div class="form-group">
              <label for="role" class="form-label">Authentication Role</label>
              <select id="role" v-model="selectedRole" class="form-select">
                <option v-for="role in roles" :key="role.value" :value="role.value">
                  {{ role.label }}
                </option>
              </select>
              <div class="role-description">
                <p class="role-description-text">
                  <span class="role-description-label">Role Access:</span>
                  {{ getSelectedRoleDescription() }}
                </p>
              </div>
            </div>

            <button type="submit" class="submit-button">
              <Lock :size="20" />
              Secure Login
            </button>
          </form>

          <div class="form-footer">
            <div class="footer-divider">
              <div class="footer-line"></div>
              <span class="footer-text">Official Access Only</span>
              <div class="footer-line"></div>
            </div>
            <p class="footer-notice">
              This system is protected by multi-factor authentication protocols.
              Unauthorized access attempts are logged and reported to the IT department.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  height: 100vh;
  width: 100%;
  display: flex;
  overflow: hidden;
}

/* Branding Section - Left Side */
.branding-section {
  display: none;
  background-color: rgb(124, 45, 18);
  align-items: center;
  justify-content: center;
  padding: 3rem;
  position: relative;
}

@media (min-width: 1024px) {
  .branding-section {
    display: flex;
    width: 50%;
  }
}

.branding-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom right, rgb(67, 20, 7), rgb(154, 52, 18));
  opacity: 0.9;
}

.decorative-elements {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.decorative-circle {
  position: absolute;
  border-radius: 9999px;
  opacity: 0.1;
  filter: blur(48px);
}

.decorative-circle-1 {
  top: -6rem;
  left: -6rem;
  width: 24rem;
  height: 24rem;
  background-color: rgb(249, 115, 22);
}

.decorative-circle-2 {
  bottom: 0;
  right: 0;
  width: 16rem;
  height: 16rem;
  background-color: rgb(251, 146, 60);
}

.branding-content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 32rem;
}

.branding-logo {
  width: 20rem;
  height: auto;
  margin-bottom: 2.5rem;
  filter: drop-shadow(0 25px 25px rgb(0 0 0 / 0.15));
}

.branding-title {
  font-size: 2.25rem;
  font-weight: 700;
  color: white;
  margin-bottom: 1.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1.25;
}

.branding-divider {
  height: 0.25rem;
  width: 6rem;
  background-color: rgb(251, 146, 60);
  margin-bottom: 1.5rem;
}

.branding-description {
  color: rgb(254, 215, 170);
  font-size: 1.125rem;
  line-height: 1.75rem;
}

/* Form Section - Right Side */
.form-section {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgb(249, 250, 251);
  padding: 1.5rem;
  overflow-y: auto;
}

@media (min-width: 1024px) {
  .form-section {
    width: 50%;
    padding: 3rem;
  }
}

.form-wrapper {
  width: 100%;
  max-width: 28rem;
}

/* Mobile Header */
.mobile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 2.5rem;
  text-align: center;
}

@media (min-width: 1024px) {
  .mobile-header {
    display: none;
  }
}

.mobile-logo {
  width: 8rem;
  height: auto;
  margin-bottom: 1rem;
}

.mobile-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: rgb(17, 24, 39);
  text-transform: uppercase;
  letter-spacing: -0.025em;
}

/* Form Card */
.form-card {
  background-color: white;
  border-radius: 1rem;
  box-shadow:
    0 20px 25px -5px rgb(0 0 0 / 0.1),
    0 8px 10px -6px rgb(0 0 0 / 0.1);
  padding: 2rem;
  border: 1px solid rgb(243, 244, 246);
}

.form-header {
  margin-bottom: 2rem;
}

.form-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: rgb(17, 24, 39);
}

.form-subtitle {
  color: rgb(107, 114, 128);
  margin-top: 0.5rem;
}

/* Form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(55, 65, 81);
  margin-bottom: 0.5rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid rgb(209, 213, 219);
  border-radius: 0.75rem;
  outline: none;
  transition: all 0.15s;
  background-color: rgb(249, 250, 251);
}

.form-input:focus {
  ring: 2px solid rgb(249, 115, 22);
  border-color: rgb(249, 115, 22);
  background-color: white;
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.2);
}

.password-wrapper {
  position: relative;
}

.password-wrapper .form-input {
  padding-right: 3rem;
}

.password-toggle {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: rgb(156, 163, 175);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.password-toggle:hover {
  color: rgb(234, 88, 12);
}

.form-select {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid rgb(209, 213, 219);
  border-radius: 0.75rem;
  outline: none;
  transition: all 0.15s;
  background-color: rgb(249, 250, 251);
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 0.5rem center;
  background-repeat: no-repeat;
  background-size: 1.5em 1.5em;
  padding-right: 2.5rem;
}

.form-select:focus {
  ring: 2px solid rgb(249, 115, 22);
  border-color: rgb(249, 115, 22);
  background-color: white;
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.2);
}

.role-description {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background-color: rgb(255, 247, 237);
  border-radius: 0.5rem;
}

.role-description-text {
  font-size: 0.75rem;
  color: rgb(154, 52, 18);
  line-height: 1.25;
}

.role-description-label {
  font-weight: 700;
}

.submit-button {
  width: 100%;
  background-color: rgb(234, 88, 12);
  color: white;
  font-weight: 700;
  padding: 1rem;
  border-radius: 0.75rem;
  box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.2);
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  border: none;
  cursor: pointer;
}

.submit-button:hover {
  background-color: rgb(194, 65, 12);
}

.submit-button:active {
  transform: scale(0.98);
}

/* Form Footer */
.form-footer {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgb(243, 244, 246);
}

.footer-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: rgb(156, 163, 175);
}

.footer-line {
  flex: 1;
  height: 1px;
  background-color: rgb(243, 244, 246);
}

.footer-text {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
}

.footer-notice {
  margin-top: 0.5rem;
  font-size: 0.6875rem;
  color: rgb(156, 163, 175);
  text-align: center;
  line-height: 1.75;
}
</style>
