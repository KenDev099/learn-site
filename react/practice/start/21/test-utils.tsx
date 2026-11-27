// 測試共用：記錄每一次 commit 當下畫面長什麼樣子
// React 把一次更新拆成兩次 commit 時（先顯示急的、再補上不急的），這裡會看到兩筆，可以檢查「中間那一刻」的畫面
import { Profiler, type ReactNode } from 'react'

export function commitLog<T>(snapshot: () => T) {
  const log: T[] = []
  function Recorder({ children }: { children: ReactNode }) {
    // onRender 在 commit 時呼叫，這時 DOM 已經是這次 commit 的結果
    return <Profiler id="recorder" onRender={() => log.push(snapshot())}>{children}</Profiler>
  }
  return { log, Recorder, clear: () => { log.length = 0 } }
}

/** Suspense 藏起已經顯示過的內容時，會加上 display: none；藏起來的不算看得到 */
export function shown(el: HTMLElement | null): boolean {
  for (let e = el; e; e = e.parentElement) if (e.style.display === 'none') return false
  return el !== null
}
