import { beforeEach, describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, render, screen, within } from '@testing-library/react'
import { WaitingList, type WaitingOrder } from './WaitingList.tsx'
import { renderCounter } from '../../helpers/render-count.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'

// 假計時器連時鐘一起假：Date.now() 停在 setSystemTime 設定的時間，advanceTimersByTime 才會往前走
const T0 = new Date('2026-11-06T09:10:00+08:00').getTime()
const MIN = 60_000
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const rows = () => within(screen.getByRole('list', { name: '等候中' })).getAllByRole('listitem').map(li => li.textContent)

const orders: WaitingOrder[] = [
  { id: 1, customer: '王小明', placedAt: T0 - 3 * MIN },
  { id: 2, customer: '陳美華', placedAt: T0 - 30_000 },
  { id: 3, customer: '林志豪', placedAt: T0 - 12 * MIN - 59_000 },
]

describe('練習 2：WaitingList 的時間放進 state', () => {
  test('掛上時顯示已等幾分鐘（無條件捨去）', () => {
    render(<WaitingList orders={orders} />)
    expect(rows()).toEqual(['王小明：已等 3 分鐘', '陳美華：已等 0 分鐘', '林志豪：已等 12 分鐘'])
  })

  test('換一批訂單也算得對（不能寫死）', () => {
    render(<WaitingList orders={[{ id: 9, customer: '張雅婷', placedAt: T0 - 45 * MIN - 1 }]} />)
    expect(rows()).toEqual(['張雅婷：已等 45 分鐘'])
  })

  test('沒有人重新 render，分鐘數也會每分鐘更新', () => {
    render(<WaitingList orders={orders} />)
    tick(MIN)
    expect(rows(), '過了 1 分鐘畫面還沒變：沒有人重新 render，寫在 render 裡的 Date.now() 不會再被呼叫。把現在時間放進 state，用 setInterval 每 60 秒 setNow(Date.now())').toEqual(
      ['王小明：已等 4 分鐘', '陳美華：已等 1 分鐘', '林志豪：已等 13 分鐘'])
    tick(2 * MIN)
    expect(rows()).toEqual(['王小明：已等 6 分鐘', '陳美華：已等 3 分鐘', '林志豪：已等 15 分鐘'])
  })

  test('同樣的 props 和 state，重新 render 結果一樣', () => {
    const view = render(<WaitingList orders={orders} />)
    tick(50_000)
    view.rerender(<WaitingList orders={orders.map(o => ({ ...o }))} />)
    expect(rows(), '父元件在兩次更新之間重新 render，分鐘數就變了：render 裡讀了時鐘（Date.now()、new Date()）。畫面只能用 state 裡的時間算').toEqual(
      ['王小明：已等 3 分鐘', '陳美華：已等 0 分鐘', '林志豪：已等 12 分鐘'])
  })

  test('整張清單共用一個計時器，一分鐘只 render 一次', () => {
    const counter = renderCounter()
    render(<counter.Profile id="list"><WaitingList orders={orders} /></counter.Profile>)
    expect(vi.getTimerCount(), '整張清單只能有一個計時器（不要每一列各開一個）').toBe(1)
    for (let s = 0; s < 60; s++) tick(1000)   // 一秒一秒往前走，每秒的更新才不會被合併成一次
    expect(counter.commits('list'), '一分鐘裡只能重新 render 1 次：計時器間隔用 60 秒，分鐘數沒變就不要更新 state').toBe(1)
  })

  test('卸載時清掉計時器', () => {
    const view = render(<WaitingList orders={orders} />)
    view.unmount()
    expect(vi.getTimerCount(), '卸載後計時器還在：effect 要回傳清理函式 clearInterval').toBe(0)
  })

  test('render 裡不呼叫時鐘，也不關掉 lint 規則', async () => {
    vi.useRealTimers()
    const file = join(import.meta.dirname, 'WaitingList.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉規則').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file, { 'react-hooks/purity': 'error' }), 'render 過程中不能呼叫 Date.now()、new Date()（useState(Date.now()) 也算，要寫成初始值函式 useState(() => Date.now())）').toEqual([])
  }, 20000)
})
