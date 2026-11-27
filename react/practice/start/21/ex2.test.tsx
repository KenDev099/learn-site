import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportTabs } from './ReportTabs.tsx'
import { commitLog } from './test-utils.tsx'

const pressed = () => screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent).join('、')
// 每次 commit 記下：選中的按鈕、狀態列、報表標題
const snapshot = () => ({
  pressed: pressed(),
  status: screen.queryByRole('status')?.textContent ?? null,
  report: screen.queryByRole('heading')?.textContent ?? null,
})

function setup() {
  const user = userEvent.setup()
  const commits = commitLog(snapshot)
  render(<commits.Recorder><ReportTabs /></commits.Recorder>)
  commits.clear()
  return { user, commits }
}

describe('練習 2：useTransition 讓按鈕馬上有反應、舊報表留著', () => {
  test('一開始是今日的報表，沒有「切換中…」', () => {
    setup()
    expect(snapshot()).toEqual({ pressed: '今日', status: null, report: '今日的銷售報表' })
  })

  test('按「本月」：先 commit「切換中…」，舊報表還在', async () => {
    const { user, commits } = setup()
    await user.click(screen.getByRole('button', { name: '本月' }))
    const [first] = commits.log
    expect(first, '按下之後沒有任何 commit').toBeDefined()
    expect(
      first.status,
      '按下之後第一次 commit 就要顯示 <p role="status">切換中…</p>：用 useTransition，isPending 在 startTransition 之後立刻是 true',
    ).toBe('切換中…')
    expect(first.report, '切換中時舊的報表要留在畫面上，不要用 isPending 把報表換掉').toBe('今日的銷售報表')
    expect(first.pressed, '切換中時選中的按鈕要跟畫面上的報表一致（還是「今日」）：setRange 要放在 startTransition 裡').toBe('今日')
  })

  test('換好之後：新的報表、新的按鈕、切換中消失', async () => {
    const { user, commits } = setup()
    await user.click(screen.getByRole('button', { name: '本月' }))
    expect(commits.log.at(-1)).toEqual({ pressed: '本月', status: null, report: '本月的銷售報表' })
    expect(commits.log.length, '一次切換應該剛好兩次 commit：先顯示切換中，再換報表').toBe(2)
    await user.click(screen.getByRole('button', { name: '本週' }))
    expect(snapshot()).toEqual({ pressed: '本週', status: null, report: '本週的銷售報表' })
  })
})
