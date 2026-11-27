import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionProvider, useSession } from './SessionProvider.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

const counter = renderCounter()
beforeEach(() => counter.reset())

function StaffName() {
  counter.track('StaffName')
  const { staff } = useSession()
  return <p>店員：{staff ?? '未登入'}</p>
}
function LoginButton({ name }: { name: string }) {
  counter.track('LoginButton')
  const { login } = useSession()
  return <button type="button" onClick={() => login(name)}>{name}登入</button>
}
function LogoutButton() {
  counter.track('LogoutButton')
  const { logout } = useSession()
  return <button type="button" onClick={logout}>登出</button>
}
// 同一個 element：外層重新 render 時 React 會跳過它，只有 context 的 value 變了，裡面讀 context 的元件才會重新 render
const page = (
  <main>
    <StaffName />
    <LoginButton name="王小明" />
    <LogoutButton />
  </main>
)
const calls = () => [counter.calls('StaffName'), counter.calls('LoginButton'), counter.calls('LogoutButton')]

describe('練習 2：SessionProvider 的 value 要穩定', () => {
  test('login、logout 之後，讀 session 的元件拿到新的 staff', async () => {
    const user = userEvent.setup()
    render(<SessionProvider>{page}<LoginButton name="陳美華" /></SessionProvider>)
    expect(screen.getByText(/店員/)).toHaveTextContent('店員：未登入')
    await user.click(screen.getByRole('button', { name: '王小明登入' }))
    expect(screen.getByText(/店員/), 'login("王小明") 之後 staff 要是王小明：value 要跟著 staff 更新（staff 要在 useMemo 的依賴陣列裡；不能把 value 放在 ref 裡改）').toHaveTextContent('店員：王小明')
    await user.click(screen.getByRole('button', { name: '陳美華登入' }))
    expect(screen.getByText(/店員/), '換陳美華登入之後 staff 要是陳美華').toHaveTextContent('店員：陳美華')
    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(screen.getByText(/店員/), 'logout() 之後 staff 要回到 null').toHaveTextContent('店員：未登入')
  })

  test('關閉公告：公告消失，讀 session 的元件不重新 render', async () => {
    const user = userEvent.setup()
    render(<SessionProvider>{page}</SessionProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('本週可頌買一送一')
    expect(calls()).toEqual([1, 1, 1])
    await user.click(screen.getByRole('button', { name: '關閉公告' }))
    expect(screen.queryByRole('status'), '按「關閉公告」之後公告要消失').not.toBeInTheDocument()
    expect(calls(), '關閉公告只改了 noticeOpen，staff 沒變：value 要是同一個物件（用 useMemo，依賴只有 staff），呼叫 useSession() 的三個元件都不該重新 render。陣列是 [StaffName, LoginButton, LogoutButton] 的 render 次數').toEqual([1, 1, 1])
  })

  test('外層重新 render（staff 沒變）：讀 session 的元件不重新 render', () => {
    const { rerender } = render(<SessionProvider>{page}</SessionProvider>)
    rerender(<SessionProvider>{page}</SessionProvider>)
    rerender(<SessionProvider>{page}</SessionProvider>)
    expect(calls(), 'SessionProvider 因為外層而重新 render 時，staff 沒變，value 就要是同一個物件：不能在 JSX 裡直接寫 value={{ … }}。陣列是 [StaffName, LoginButton, LogoutButton] 的 render 次數').toEqual([1, 1, 1])
  })

  test('登入之後，每個讀 session 的元件各重新 render 一次', async () => {
    const user = userEvent.setup()
    render(<SessionProvider>{page}</SessionProvider>)
    await user.click(screen.getByRole('button', { name: '王小明登入' }))
    expect(screen.getByText(/店員/)).toHaveTextContent('店員：王小明')
    expect(calls(), 'staff 變了，value 換成新的物件，三個讀 session 的元件各重新 render 一次（共 2 次）').toEqual([2, 2, 2])
    await user.click(screen.getByRole('button', { name: '關閉公告' }))
    expect(calls(), '登入之後再關閉公告，一樣不能重新 render').toEqual([2, 2, 2])
  })

  test('兩個 SessionProvider 各自獨立', async () => {
    const user = userEvent.setup()
    render(
      <>
        <section aria-label="櫃檯"><SessionProvider><StaffName /><LoginButton name="王小明" /></SessionProvider></section>
        <section aria-label="吧台"><SessionProvider><StaffName /><LoginButton name="陳美華" /></SessionProvider></section>
      </>,
    )
    await user.click(screen.getByRole('button', { name: '陳美華登入' }))
    expect(within(screen.getByRole('region', { name: '吧台' })).getByText(/店員/)).toHaveTextContent('店員：陳美華')
    expect(within(screen.getByRole('region', { name: '櫃檯' })).getByText(/店員/), '吧台登入，櫃檯不能跟著變：state 要留在 SessionProvider 元件裡，不能搬到模組層級的變數').toHaveTextContent('店員：未登入')
  })

  test('上面沒有 SessionProvider 時 useSession() 要丟錯', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<StaffName />), '保留原本的檢查：沒有 Provider 就丟錯').toThrow('useSession() 必須在 <SessionProvider> 之下使用')
  })

  test('依賴陣列沒有違反 react-hooks 的規則，也沒有用 eslint-disable', async () => {
    const file = join(import.meta.dirname, 'SessionProvider.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 蓋掉警告：把用到的值列進依賴陣列').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file), 'useMemo 裡用到的響應值（staff）都要列在依賴陣列').toEqual([])
  }, 20000)
})
