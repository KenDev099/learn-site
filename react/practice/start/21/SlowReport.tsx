// 很慢的報表（想像有好幾張圖表，每換一次區間都要重算上千筆訂單）。這個檔案不用改
export type Range = 'today' | 'week' | 'month'
export const RANGES: readonly { value: Range; label: string }[] = [
  { value: 'today', label: '今日' },
  { value: 'week', label: '本週' },
  { value: 'month', label: '本月' },
]

export function SlowReport({ range }: { range: Range }) {
  const label = RANGES.find(r => r.value === range)?.label
  return (
    <section aria-label="報表">
      <h3>{label}的銷售報表</h3>
    </section>
  )
}
