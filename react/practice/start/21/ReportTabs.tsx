/*
練習 2：切換分頁：useTransition 讓按鈕馬上有反應、舊報表留著
問題：
  店長後台的報表分頁（今日／本週／本月）。SlowReport 很慢，按下「本月」之後，
  整個頁面要等報表算完才有反應，店長以為沒按到，又多按了好幾次。
要求：
  1. 按下分頁按鈕：先 commit 一次「舊的報表還在、顯示 <p role="status">切換中…</p>」，
     再 commit 一次「新的報表、切換中消失」。用 useTransition，把換分頁的 setState 放進 startTransition
  2. 切換中時，選中的按鈕（aria-pressed="true"）仍然是舊的分頁，跟畫面上的報表一致；換好了才換成新的
  3. 切換中不能把報表換掉或藏起來：舊報表一直顯示到新報表好了為止
  4. 不要改 SlowReport.tsx
*/
import { useState } from 'react'
import { RANGES, SlowReport, type Range } from './SlowReport.tsx'

export function ReportTabs() {
  const [range, setRange] = useState<Range>('today')

  return (
    <div>
      <div>
        {RANGES.map(r => (
          <button key={r.value} type="button" aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
            {r.label}
          </button>
        ))}
      </div>
      <SlowReport range={range} />
    </div>
  )
}
