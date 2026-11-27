import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { typecheck } from '../../helpers/typecheck.ts'
import { useQuantityField } from './useQuantityField.ts'

// 使用這個 hook 的表單
function QuantityForm({ onSubmit }: { onSubmit: (quantity: number) => void }) {
  const field = useQuantityField(onSubmit)
  return (
    <form aria-label="加入購物車" onSubmit={field.handleSubmit}>
      <label>數量 <input ref={field.inputRef} inputMode="numeric" value={field.text ?? ''} onChange={field.handleChange} /></label>
      {field.error !== null && <p role="alert">{field.error}</p>}
      <button type="submit">加入</button>
    </form>
  )
}

function setup() {
  const onSubmit = vi.fn()
  const { unmount } = render(<QuantityForm onSubmit={onSubmit} />)
  return { onSubmit, unmount, user: userEvent.setup(), input: screen.getByRole('textbox', { name: '數量' }), submit: screen.getByRole('button', { name: '加入' }) }
}

describe('練習 3：useQuantityField 的事件、ref、state 都有型別', () => {
  test('型別：回傳的東西接得上 <input> 與 <form>，接錯元素、把 null 當字串都要報錯', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex3.usage.tsx': [
        "import type { SubmitEvent } from 'react'",
        "import { useQuantityField } from './useQuantityField.ts'",
        '',
        'type Field = ReturnType<typeof useQuantityField>',
        'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false',
        '',
        'export function Ok() {',
        '  const field = useQuantityField((quantity: number) => console.log(quantity.toFixed(0)))',
        '  const error: string | null = field.error',
        '  const quantity: number | null = field.quantity',
        '  return (',
        '    <form onSubmit={field.handleSubmit}>',
        '      <input ref={field.inputRef} value={field.text} onChange={field.handleChange} />',
        '      <p>{error}{quantity}</p>',
        '    </form>',
        '  )',
        '}',
        '',
        '// handleSubmit 的參數要是 submit 事件自己的型別（不是 deprecated 的 FormEvent）',
        "export const submitEvent: Equal<Parameters<Field['handleSubmit']>[0], SubmitEvent<HTMLFormElement>> = true",
        '',
        'export function bad(field: Field) {',
        '  // @ts-expect-error onSubmit 收到的是 number',
        '  useQuantityField((quantity: string) => console.log(quantity))',
        '  // @ts-expect-error error 可能是 null，不能直接當 string',
        '  const message: string = field.error',
        '  // @ts-expect-error 掛上去之前 inputRef.current 是 null',
        '  field.inputRef.current.focus()',
        '  return [',
        '    message,',
        '    // @ts-expect-error handleChange 是 <input> 的處理函式，不能接到 <select>',
        '    <select onChange={field.handleChange} />,',
        '    // @ts-expect-error inputRef 指向 <input>，不能放到 <textarea>',
        '    <textarea ref={field.inputRef} />,',
        '    // @ts-expect-error handleSubmit 是 submit 事件的處理函式，不能接到 onClick',
        '    <button onClick={field.handleSubmit}>加入</button>,',
        '  ]',
        '}',
        '',
      ].join('\n'),
    })
    expect(errors,
      '型別檢查沒過。TS2578（Unused \'@ts-expect-error\' directive）代表那一行還是 any 或型別太寬：' +
      'onSubmit 是 (quantity: number) => void、error 是 useState<string | null>(null)、inputRef 是 useRef<HTMLInputElement>(null)、' +
      'handleChange 的參數是 ChangeEvent<HTMLInputElement>。submitEvent 那一行報錯代表 handleSubmit 的參數不是 SubmitEvent<HTMLFormElement>。' +
      'useQuantityField.ts 裡的錯誤是換上型別之後 TypeScript 找到的 bug，照訊息修：\n' + errors).toBe('')
  }, 30_000)

  test('輸入框一開始是 1，打字之後內容跟著變', async () => {
    const { user, input } = setup()
    expect(input, '一開始的數量是 1').toHaveValue('1')
    await user.clear(input)
    await user.type(input, '12')
    expect(input, '打字之後輸入框要顯示打的內容：handleChange 要把 e.target.value 存進 text（起始檔這裡打錯字了）').toHaveValue('12')
  })

  test('數量合法：onSubmit 收到數字', async () => {
    const { user, input, submit, onSubmit } = setup()
    await user.clear(input)
    await user.type(input, '3')
    await user.click(submit)
    expect(onSubmit, '輸入 3 再送出，要呼叫 onSubmit(3)：參數是數字 3，不是字串').toHaveBeenCalledExactlyOnceWith(3)
    expect(screen.queryByRole('alert'), '合法時不該有錯誤訊息').toBeNull()
  })

  test('數量不合法：不呼叫 onSubmit、顯示錯誤、焦點回到輸入框', async () => {
    for (const bad of ['', 'abc', '0', '21', '2.5']) {
      const { user, input, submit, onSubmit, unmount } = setup()
      await user.clear(input)
      if (bad) await user.type(input, bad)
      await user.click(submit)
      expect(onSubmit, `輸入「${bad}」不合法，不能呼叫 onSubmit`).not.toHaveBeenCalled()
      expect(screen.getByRole('alert'), `輸入「${bad}」送出後要顯示錯誤訊息`).toHaveTextContent('數量要是 1 到 20 的整數')
      expect(input, '不合法時要把焦點移回輸入框：inputRef.current?.focus()').toHaveFocus()
      await user.type(input, '1')
      expect(screen.queryByRole('alert'), '重新打字後錯誤訊息要消失（error 回到 null）').toBeNull()
      unmount()
    }
  })

  test('沒有用 any、as 或 ! 斷言', () => {
    // 去掉註解再檢查：說明文字裡出現 any 不算
    const code = readFileSync(join(import.meta.dirname, 'useQuantityField.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code, '還有 any：每個 any 都要換成真正的型別').not.toMatch(/\bany\b/)
    expect(code, '不要用 as 斷言：型別寫對了就不需要它').not.toMatch(/\bas\s+(?!const\b)[\w{([]/)
    expect(code, '不要用 ! 斷言 null 不會發生：inputRef.current 在掛上去之前是 null，用 ?. 處理').not.toMatch(/[\w)\]]!(?=[.[(])/)
  })

  test('送出時有呼叫 preventDefault', () => {
    setup()
    const form = screen.getByRole('form', { name: '加入購物車' })
    const event = createEvent.submit(form)
    fireEvent(form, event)
    expect(event.defaultPrevented, 'handleSubmit 要呼叫 e.preventDefault()，不然瀏覽器會重新載入頁面').toBe(true)
  })
})
