import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrewTimer } from './BrewTimer.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

// 用假計時器，不等真實時間。假計時器開著的時候 userEvent 會卡住，所以這一題用 fireEvent.click
beforeEach(() => { vi.useFakeTimers() })
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const press = (name: string, scope = screen) => fireEvent.click(scope.getByRole('button', { name }))
const shown = (scope = screen) => scope.getByRole('timer').textContent

describe('練習 1：BrewTimer 把計時器 id 放在 ref', () => {
  test('按「開始」後每秒加 1', () => {
    render(<BrewTimer />)
    expect(shown(), '一開始顯示「已沖煮 0 秒」').toBe('已沖煮 0 秒')
    press('開始')
    tick(3000)
    expect(shown(), '按「開始」後過 3 秒要顯示「已沖煮 3 秒」：秒數是畫面要顯示的東西，要放 state，並用 setSeconds(s => s + 1) 累加').toBe('已沖煮 3 秒')
  })

  test('按「停止」後不再增加', () => {
    render(<BrewTimer />)
    press('開始')
    tick(2000)
    press('停止')
    tick(5000)
    expect(shown(), '停止之後秒數不能再動：stop() 要拿得到當初 setInterval 回傳的 id。一般變數每次 render 都重新宣告，id 要放在 useRef 的 current 裡').toBe('已沖煮 2 秒')
    expect(vi.getTimerCount(), '停止之後不能還有計時器在跑').toBe(0)
  })

  test('已經在計時時再按「開始」，不能多開一個計時器', () => {
    render(<BrewTimer />)
    press('開始')
    press('開始')
    tick(2000)
    expect(shown(), '連按兩次「開始」再過 2 秒應該是 2 秒，不是 4 秒：ref 裡已經有 id 就不要再 setInterval').toBe('已沖煮 2 秒')
    press('停止')
    tick(3000)
    expect(shown(), '停止之後還在加：第一個計時器的 id 被第二個蓋掉，再也清不到了').toBe('已沖煮 2 秒')
  })

  test('停止之後可以再開始，從原本的秒數繼續', () => {
    render(<BrewTimer />)
    press('開始')
    tick(2000)
    press('停止')
    tick(5000)
    press('開始')
    tick(1000)
    expect(shown(), '停止後再按「開始」要繼續計時：clearInterval 之後把 ref.current 設回 null，「已經在跑」的判斷才會放行').toBe('已沖煮 3 秒')
  })

  test('按「開始」「停止」本身不造成重新 render', () => {
    const counter = renderCounter()
    render(<counter.Profile id="timer"><BrewTimer /></counter.Profile>)
    press('開始')
    expect(counter.commits('timer'), '按「開始」畫面沒有變，不該重新 render：計時器 id 畫面用不到，放 ref 不放 state').toBe(0)
    tick(1000)
    tick(1000)
    expect(counter.commits('timer'), '過 2 秒應該剛好重新 render 2 次（每秒一次）').toBe(2)
    press('停止')
    expect(counter.commits('timer'), '按「停止」畫面沒有變，不該重新 render').toBe(2)
  })

  test('卸載時清掉還在跑的計時器', () => {
    const view = render(<BrewTimer />)
    press('開始')
    tick(1000)
    view.unmount()
    expect(vi.getTimerCount(), '元件卸載後計時器還在跑：用 useEffect 回傳清理函式，在卸載時 clearInterval').toBe(0)
  })

  test('兩個 BrewTimer 各自計時', () => {
    render(<><div data-testid="a"><BrewTimer /></div><div data-testid="b"><BrewTimer /></div></>)
    const a = within(screen.getByTestId('a')), b = within(screen.getByTestId('b'))
    press('開始', a)
    tick(1000)
    press('開始', b)
    tick(2000)
    press('停止', a)
    tick(2000)
    expect(shown(a), '第一個：開始後 3 秒按停止，應該停在 3 秒').toBe('已沖煮 3 秒')
    expect(shown(b), '第二個：晚 1 秒開始，一共跑了 4 秒。id 放在元件外面的變數會被所有 BrewTimer 共用；useRef 是每個元件各一份').toBe('已沖煮 4 秒')
  })

  test('不在 render 過程中讀寫 ref，也不關掉 lint 規則', async () => {
    const file = join(import.meta.dirname, 'BrewTimer.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉規則').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file, { 'react-hooks/refs': 'error' }), 'ref.current 只能在事件處理函式或 effect 裡讀寫，不能在 render 過程中（元件函式本體、JSX 裡）').toEqual([])
  }, 20000)
})
