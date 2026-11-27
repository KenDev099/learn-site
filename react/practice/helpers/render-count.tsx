// 計算某一段畫面 commit（真的更新到 DOM）的次數，用 React 的 <Profiler>（效能課用）
// 用法：const counter = renderCounter(); render(<counter.Profile id="list"><OrderList /></counter.Profile>); counter.commits('list')
// 元件函式被呼叫幾次請自己在元件裡數（測試用 vi.fn 包住 props 的函式或用 counter.track）
import { Profiler, type ReactNode } from 'react'

export function renderCounter() {
  const mounts = new Map<string, number>()
  const updates = new Map<string, number>()
  const calls = new Map<string, number>()
  const bump = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1)
  return {
    Profile({ id, children }: { id: string; children: ReactNode }) {
      return <Profiler id={id} onRender={(pid, phase) => bump(phase === 'mount' ? mounts : updates, pid)}>{children}</Profiler>
    },
    /** 在元件函式開頭呼叫 counter.track('Row')，數這個元件函式被呼叫幾次 */
    track: (id: string) => { bump(calls, id) },
    mounts: (id: string) => mounts.get(id) ?? 0,
    commits: (id: string) => updates.get(id) ?? 0,
    calls: (id: string) => calls.get(id) ?? 0,
    reset() { mounts.clear(); updates.clear(); calls.clear() },
  }
}
