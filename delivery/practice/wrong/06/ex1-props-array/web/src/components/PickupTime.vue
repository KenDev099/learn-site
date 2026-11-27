<script setup lang="ts">
import { computed } from 'vue'

// 訂單頁的取餐時間，用台北時間顯示，例如「11/04 07:30」（CAFE-21）
// at 跟契約一樣是 ISO 8601 字串（OrderResponse.pickupAt）：JSON 裡沒有 Date，收到的一定是字串
const props = defineProps(['at'])

const taipei = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const text = computed(() => taipei.format(new Date(props.at)))
</script>

<template>
  <time :datetime="at">{{ text }}</time>
</template>
