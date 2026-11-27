// 練習 1：登入狀態（auth 的內部檔案，不用改）
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useSession = defineStore('session', () => {
  const userName = ref<string | null>(null)
  const loggedIn = computed(() => userName.value !== null)
  function login(name: string) {
    userName.value = name
  }
  function logout() {
    userName.value = null
  }
  return { userName, loggedIn, login, logout }
})
