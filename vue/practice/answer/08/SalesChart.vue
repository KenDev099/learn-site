<!--
  練習 3：今日銷量圖表（包裝第三方圖表套件）
  問題：起始程式在 setup 就呼叫 createChart，那時 <canvas> 還不存在；圖表物件放進 ref()；
        資料改變時圖表不會更新；元件卸載時也沒有 destroy，圖表的資源一直留著。
  要求：
  - 元件掛載後，用真正的 <canvas> 元素和 props.data 呼叫 createChart（從 ./chart-lib.ts 匯入）
  - props.data 換成新陣列時，呼叫一次 chart.update(新資料)
  - 元件卸載時呼叫 chart.destroy()
  - Chart 有 #private 欄位：不要把圖表物件放進 ref() 或 reactive()（會被包成 proxy，呼叫方法時丟 TypeError），
    用普通變數或 shallowRef 存
  - 不要改 chart-lib.ts
-->
<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { createChart, type Chart, type Point } from './chart-lib.ts'

const props = defineProps<{ data: Point[] }>()
const canvasEl = useTemplateRef<HTMLCanvasElement>('canvas')

let chart: Chart | undefined   // 第三方實例：普通變數，不讓 Vue 包成 proxy

onMounted(() => {
  chart = createChart(canvasEl.value!, props.data)
})

watch(() => props.data, data => chart?.update(data))

onUnmounted(() => chart?.destroy())
</script>

<template>
  <canvas ref="canvas" width="320" height="160"></canvas>
</template>
