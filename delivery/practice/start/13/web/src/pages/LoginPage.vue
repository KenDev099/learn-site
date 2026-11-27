<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '../api/auth.ts'

const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')

async function submit() {
  error.value = ''
  try {
    await login(username.value, password.value)
    // 從哪一頁被帶來登入，就回到哪一頁（只接受站內路徑）
    const back = typeof route.query.back === 'string' && route.query.back.startsWith('/') && !route.query.back.startsWith('//') ? route.query.back : '/'
    await router.push(back)
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <h1>登入</h1>
  <form @submit.prevent="submit">
    <label>帳號 <input v-model="username" autocomplete="username" required></label>
    <label>密碼 <input v-model="password" type="password" autocomplete="current-password" required></label>
    <button>登入</button>
  </form>
  <p v-if="error" role="alert">{{ error }}</p>
</template>
