import { useDeferredValue, useState } from 'react'
import { RANGES, SlowReport, type Range } from './SlowReport.tsx'

// 錯誤：按鈕立刻換成新分頁，報表用延後的值，畫面上兩者不一致，也沒有切換中的提示
export function ReportTabs() {
  const [range, setRange] = useState<Range>('today')
  const deferredRange = useDeferredValue(range)
  return (
    <div>
      <div>
        {RANGES.map(r => (
          <button key={r.value} type="button" aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
            {r.label}
          </button>
        ))}
      </div>
      <SlowReport range={deferredRange} />
    </div>
  )
}
