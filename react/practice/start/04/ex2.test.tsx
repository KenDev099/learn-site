import { describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PickupForm, type Pickup } from './PickupForm.tsx'
import { deferred } from '../../helpers/deferred.ts'

const NAME_ERROR = '請輸入姓名'
const PHONE_ERROR = '手機要是 09 開頭的 10 碼數字'
const FAILED = '送出失敗，請再試一次'

function setup(impl: (data: Pickup) => Promise<void> = () => Promise.resolve()) {
  const user = userEvent.setup()
  const onSubmit = vi.fn(impl)
  render(<PickupForm onSubmit={onSubmit} />)
  const hint = '每個欄位都要有對應的 <label>：用 htmlFor 指到 input 的 id，或用 <label> 把 input 包起來'
  const find = (label: string) => {
    const el = screen.queryByLabelText<HTMLInputElement>(label)
    if (!el) throw new Error(`找不到標籤是「${label}」的輸入框。${hint}`)
    return el
  }
  const button = screen.getByRole<HTMLButtonElement>('button')
  return {
    user, onSubmit, button,
    name: find('姓名'),
    phone: find('手機'),
    form: button.closest('form')!,
    alerts: () => screen.queryAllByRole('alert').map(el => el.textContent),
  }
}
type Form = ReturnType<typeof setup>

async function fill(f: Form, name: string, phone: string) {
  await f.user.clear(f.name)
  if (name) await f.user.type(f.name, name)
  await f.user.clear(f.phone)
  if (phone) await f.user.type(f.phone, phone)
}

describe('練習 2：PickupForm 的 label、驗證與送出', () => {
  test('欄位有 label、是受控的，一進頁面不顯示錯誤', async () => {
    const f = setup()
    expect(f.alerts(), '還沒按過「送出」就不該顯示錯誤').toEqual([])
    expect(f.button).toBeEnabled()
    expect(f.button).toHaveTextContent('送出')
    await f.user.click(screen.getByText('姓名'))
    expect(f.name, '點「姓名」這兩個字要能聚焦到輸入框：文字要放在 <label> 裡').toHaveFocus()
  })

  test('送出時要 preventDefault，欄位有錯就不呼叫 onSubmit', async () => {
    const f = setup()
    let prevented: boolean | undefined
    const spy = (e: Event) => { prevented = e.defaultPrevented }
    document.addEventListener('submit', spy)
    await f.user.click(f.button)
    document.removeEventListener('submit', spy)
    expect(prevented, '在 <form> 的 onSubmit 裡呼叫 e.preventDefault()，不然瀏覽器會重新載入頁面（處理函式要掛在 form 的 onSubmit，不是按鈕的 onClick）').toBe(true)
    expect(f.onSubmit, '欄位有錯誤時不能呼叫 onSubmit').not.toHaveBeenCalled()
    expect(f.alerts(), '按過送出後，兩個欄位的錯誤都要顯示（各一個 role="alert"）').toEqual([NAME_ERROR, PHONE_ERROR])
  })

  test('錯誤訊息跟著輸入更新，不用再按送出', async () => {
    const f = setup()
    await f.user.click(f.button)
    await f.user.type(f.name, '王')
    expect(f.alerts(), '姓名填了之後，「請輸入姓名」要立刻消失：錯誤訊息在 render 時由欄位的值算出來，不要存成 state').toEqual([PHONE_ERROR])
    await f.user.type(f.phone, '091234567')
    expect(f.alerts(), '手機只有 9 碼，錯誤還在').toEqual([PHONE_ERROR])
    await f.user.type(f.phone, '8')
    expect(f.alerts(), '手機補到 10 碼後錯誤要立刻消失（不能慢一拍：用最新的欄位值驗證）').toEqual([])
    await f.user.clear(f.name)
    expect(f.alerts(), '把姓名清空，錯誤要再出現').toEqual([NAME_ERROR])
  })

  test('驗證規則：姓名不能只有空白，手機要是 09 開頭的 10 碼數字', async () => {
    const f = setup()
    await f.user.click(f.button)
    for (const [name, phone, expected] of [
      ['   ', '0912345678', [NAME_ERROR]],
      ['王小明', '0812345678', [PHONE_ERROR]],
      ['王小明', '09123456789', [PHONE_ERROR]],
      ['王小明', '09abcdefgh', [PHONE_ERROR]],
      ['王小明', '0912 345678', [PHONE_ERROR]],
      ['王小明', '0912345678', []],
    ] as const) {
      await fill(f, name, phone)
      expect(f.alerts(), `姓名「${name}」、手機「${phone}」時的錯誤不對`).toEqual(expected)
    }
    expect(f.onSubmit, '只是打字，不能呼叫 onSubmit').not.toHaveBeenCalled()
  })

  test('沒有錯誤時呼叫 onSubmit 一次，姓名去掉頭尾空白', async () => {
    const f = setup()
    await fill(f, ' 陳美華 ', '0987654321')
    await f.user.click(f.button)
    expect(f.onSubmit.mock.calls, 'onSubmit 要收到 { name, phone }，姓名要 trim').toEqual([[{ name: '陳美華', phone: '0987654321' }]])
  })

  test('在輸入框按 Enter 也能送出', async () => {
    const f = setup()
    await fill(f, '林志豪', '0911222333')
    await f.user.type(f.phone, '{Enter}')
    expect(f.onSubmit.mock.calls, '表單裡按 Enter 會觸發 form 的 submit 事件：處理函式要掛在 <form onSubmit>，不是按鈕的 onClick').toEqual([[{ name: '林志豪', phone: '0911222333' }]])
  })

  test('送出中：按鈕 disabled、顯示「送出中…」，再觸發送出也不會重複呼叫', async () => {
    const pending = deferred()
    const f = setup(() => pending.promise)
    await fill(f, '王小明', '0912345678')
    await f.user.click(f.button)
    expect(f.button, '等 onSubmit 的 Promise 完成前，按鈕要 disabled').toBeDisabled()
    expect(f.button, '送出中按鈕的文字要是「送出中…」').toHaveTextContent('送出中…')
    fireEvent.submit(f.form)
    fireEvent.submit(f.form)
    expect(f.onSubmit, '送出中又觸發 submit，不能再呼叫 onSubmit：處理函式開頭自己檢查「是不是正在送出」，不要只靠按鈕的 disabled').toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve())
    expect(f.button, '成功後按鈕要恢復').toBeEnabled()
    expect(f.button).toHaveTextContent('送出')
  })

  test('成功後清空欄位，而且不顯示錯誤', async () => {
    const f = setup()
    await f.user.click(f.button)                 // 先按一次，讓錯誤進入「會顯示」的狀態
    await fill(f, '王小明', '0912345678')
    await f.user.click(f.button)
    expect(f.onSubmit).toHaveBeenCalledTimes(1)
    expect(f.name, '成功後姓名要清空').toHaveValue('')
    expect(f.phone, '成功後手機要清空').toHaveValue('')
    expect(f.alerts(), '成功後回到「還沒按過送出」的狀態：欄位雖然是空的，也不該顯示錯誤').toEqual([])
  })

  test('失敗：顯示訊息、保留輸入、按鈕恢復，可以再送一次', async () => {
    const first = deferred()
    const second = deferred()
    const results = [first.promise, second.promise]
    const f = setup(() => results.shift()!)
    await fill(f, '王小明', '0912345678')
    await f.user.click(f.button)
    await act(async () => first.reject(new Error('503')))
    expect(f.alerts(), 'onSubmit 的 Promise reject 時，要顯示 role="alert" 的「送出失敗，請再試一次」（用 try／catch 接住）').toEqual([FAILED])
    expect(f.name, '失敗時要保留使用者輸入的內容').toHaveValue('王小明')
    expect(f.phone, '失敗時要保留使用者輸入的內容').toHaveValue('0912345678')
    expect(f.button, '失敗後按鈕要恢復可以按，不然使用者只能重新整理').toBeEnabled()
    expect(f.button).toHaveTextContent('送出')

    await f.user.click(f.button)
    expect(f.onSubmit, '失敗後再按送出，要再呼叫一次 onSubmit').toHaveBeenCalledTimes(2)
    expect(f.alerts(), '重新送出時，上一次的失敗訊息要消失').toEqual([])
    await act(async () => second.resolve())
    expect(f.name).toHaveValue('')
    expect(f.alerts()).toEqual([])
  })
})
