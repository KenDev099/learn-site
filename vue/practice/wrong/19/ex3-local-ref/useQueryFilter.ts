// 錯誤寫法：進入頁面時從網址讀一次，之後存在本地 ref，網址改變時不會跟著變
import { computed, ref, type WritableComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useQueryFilter<T extends string>(
  key: string,
  options: { allowed: readonly T[]; fallback: T },
): WritableComputedRef<T> {
  const route = useRoute()
  const router = useRouter()
  const raw = route.query[key]
  const local = ref(typeof raw === 'string' && (options.allowed as readonly string[]).includes(raw) ? raw : options.fallback)
  return computed({
    get: () => local.value as T,
    set(value) {
      local.value = value
      router.replace({ query: { ...route.query, [key]: value } })
    },
  })
}
