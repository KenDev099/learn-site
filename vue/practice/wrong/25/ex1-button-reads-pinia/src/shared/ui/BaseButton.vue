<script setup lang="ts">
// 繞過 import 檢查：不 import auth，直接從 Pinia 讀 session store
import { computed } from 'vue'
import { getActivePinia } from 'pinia'

const props = defineProps<{ disabled?: boolean }>()
const pinia = getActivePinia() as unknown as { state: { value: Record<string, { userName?: string | null }> } } | undefined
const loggedIn = computed(() => Boolean(pinia?.state.value.session?.userName))
</script>

<template>
  <button type="button" :disabled="props.disabled || !loggedIn"><slot /></button>
</template>
