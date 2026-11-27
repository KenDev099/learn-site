<!-- 練習 3 的管理報表頁（不用改）：data-page 的字串是測試用來在打包結果裡找到這個元件的記號 -->
<script lang="ts">
export const REPORT_TITLE = '管理報表'
</script>

<script setup lang="ts">
const marker = 'ADMIN_REPORTS_MARKER'
</script>

<template>
  <section :data-page="marker">
    <h1>{{ REPORT_TITLE }}</h1>
    <p>本月營收、各門市銷售排行</p>
  </section>
</template>
