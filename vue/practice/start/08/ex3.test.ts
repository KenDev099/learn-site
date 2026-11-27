import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { getChart, type Point } from './chart-lib.ts'
import SalesChart from './SalesChart.vue'

const today: Point[] = [{ label: '美式咖啡', value: 12 }, { label: '拿鐵', value: 20 }]
const later: Point[] = [{ label: '美式咖啡', value: 15 }, { label: '拿鐵', value: 26 }, { label: '可頌', value: 4 }]

// 收集元件執行中丟出的錯誤（例如透過 proxy 呼叫有 #private 欄位的方法）
function setup() {
  const errors: unknown[] = []
  const wrapper = mount(SalesChart, {
    props: { data: today },
    global: { config: { errorHandler: err => { errors.push(err) } } },
  })
  const canvas = wrapper.find('canvas')
  const chart = canvas.exists() ? getChart(canvas.element as HTMLCanvasElement) : undefined
  return { wrapper, chart, errors }
}

const show = (errors: unknown[]) => errors.map(e => String(e)).join('；')

describe('練習 3：第三方圖表的建立、更新與清理', () => {
  test('掛載後用真正的 <canvas> 建立圖表', () => {
    const { chart, errors } = setup()
    expect(show(errors), '元件執行時出錯：在 setup 呼叫 createChart 時 canvas 還是 null，要等 onMounted').toBe('')
    expect(chart, '這個 <canvas> 上沒有圖表：要在 onMounted 裡用 template ref 拿到的 canvas 呼叫 createChart').toBeDefined()
    expect(chart!.data).toEqual(today)
  })

  test('props.data 換成新陣列時，update 一次', async () => {
    const { wrapper, chart, errors } = setup()
    await wrapper.setProps({ data: later })
    expect(show(errors),
      '呼叫 chart 的方法時出錯：圖表物件放進 ref() 會被包成 proxy，方法裡讀 #private 欄位就丟 TypeError。用普通變數或 shallowRef 存').toBe('')
    expect(chart?.updateCount, '資料改變後要呼叫 chart.update(新資料) 一次：用 watch(() => props.data, …)').toBe(1)
    expect(chart?.data).toEqual(later)
  })

  test('卸載時 destroy 圖表', () => {
    const { wrapper, chart, errors } = setup()
    wrapper.unmount()
    expect(show(errors), '卸載時出錯：圖表物件不要放進 ref()，用普通變數或 shallowRef').toBe('')
    expect(chart?.destroyed, '卸載後圖表沒有 destroy：在 onUnmounted 呼叫 chart.destroy()').toBe(true)
  })
})
