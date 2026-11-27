<script setup lang="ts">
import { computed } from 'vue'

// 訂單頁的取餐時間，用台北時間顯示，例如「11/04 07:30」（CAFE-21）
const props = defineProps<{ at: Date }>()

const taipei = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
// 一開始寫 taipei.format(props.at) 畫面會壞掉，包一層 new Date() 就好了
const text = computed(() => taipei.format(new Date(props.at)))
</script>

<template>
  <time :datetime="String(at)">{{ text }}</time>
</template>
