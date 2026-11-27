<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ label: string; url: string }>()
// 用正規表示式當白名單，沒有 try/catch：'https://' 這種解析不了的網址會讓 new URL 丟錯
const safeHref = computed(() => (/^https?:/i.test(props.url.trim()) ? new URL(props.url).href : null))
</script>

<template>
  <a v-if="safeHref" :href="safeHref" target="_blank" rel="noopener noreferrer">{{ label }}</a>
  <span v-else>{{ label }}（{{ url }}）</span>
</template>
