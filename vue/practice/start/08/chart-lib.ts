// 練習 3 用的假圖表套件：當成 node_modules 裡的第三方套件，不要改這個檔案
// 跟真的圖表套件一樣：createChart(canvas, data) 建立圖表，update(data) 換資料，destroy() 釋放資源
// getChart(canvas) 取得某個 canvas 上的圖表（Chart.js 也有同名的函式），測試用它檢查圖表的狀態
export type Point = { label: string; value: number }

const charts = new WeakMap<HTMLCanvasElement, Chart>()

export class Chart {
  #data: Point[]
  #updates = 0
  #destroyed = false

  constructor(data: Point[]) {
    this.#data = data
  }

  update(data: Point[]) {
    if (this.#destroyed) throw new Error('圖表已經 destroy，不能再 update')
    this.#data = data
    this.#updates++
  }

  destroy() {
    this.#destroyed = true
  }

  get data() { return this.#data }
  get updateCount() { return this.#updates }
  get destroyed() { return this.#destroyed }
}

export function createChart(canvas: HTMLCanvasElement, data: Point[]) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError(`createChart：第一個參數要是 <canvas> 元素，收到的是 ${String(canvas)}`)
  }
  const chart = new Chart(data)
  charts.set(canvas, chart)
  return chart
}

export function getChart(canvas: HTMLCanvasElement) {
  return charts.get(canvas)
}
