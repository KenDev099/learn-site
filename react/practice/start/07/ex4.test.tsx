import { describe, expect, test, vi } from 'vitest'
import { createRef, useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhoneField, type PhoneFieldHandle } from './PhoneField.tsx'
import { typecheck } from '../../helpers/typecheck.ts'

// 結帳表單：送出時手機沒填，就把焦點移到手機欄位
function Checkout() {
  const [phone, setPhone] = useState('')
  const phoneRef = useRef<PhoneFieldHandle>(null)
  return (
    <form onSubmit={e => { e.preventDefault(); if (!phone) phoneRef.current?.focus() }}>
      <PhoneField ref={phoneRef} value={phone} onChange={setPhone} />
      <button type="submit">送出訂單</button>
    </form>
  )
}

describe('練習 4：PhoneField 接收 ref，只開放 focus', () => {
  test('父元件呼叫 ref.current.focus()，輸入框取得焦點', async () => {
    render(<Checkout />)
    const input = screen.getByLabelText('手機號碼')
    await userEvent.setup().click(screen.getByRole('button', { name: '送出訂單' }))
    expect(document.activeElement, '手機沒填就送出，焦點要移到手機號碼的輸入框：PhoneField 要從 props 拿 ref，用 useImperativeHandle 提供 focus()，裡面對自己的 input 呼叫 focus()').toBe(input)
  })

  test('ref.current 只有 focus，不是 DOM 節點', () => {
    const ref = createRef<PhoneFieldHandle>()
    render(<PhoneField ref={ref} value="" onChange={() => {}} />)
    expect(ref.current, '父元件的 ref.current 是 null：PhoneField 沒有處理 ref 這個 prop').not.toBeNull()
    expect(ref.current, '不能把整個 <input> 交給父元件（它就能改 value、style、移除節點）：ref 不要直接放在 <input> 上，用 useImperativeHandle 回傳只有 focus 的物件').not.toBeInstanceOf(Element)
    expect(Object.keys(ref.current!), 'ref.current 只能有 focus 一個方法').toEqual(['focus'])
  })

  test('父元件傳 ref callback 也拿得到', () => {
    const handles: (PhoneFieldHandle | null)[] = []
    const view = render(<PhoneField ref={h => { handles.push(h) }} value="" onChange={() => {}} />)
    expect(handles.length, '父元件可能傳函式當 ref：自己寫 ref.current = … 只支援 ref 物件，useImperativeHandle 兩種都處理').toBe(1)
    expect(Object.keys(handles[0] ?? {})).toEqual(['focus'])
    handles[0]!.focus()
    expect(document.activeElement).toBe(screen.getByLabelText('手機號碼'))
    view.unmount()
    expect(handles.at(-1), '卸載時要用 null 再呼叫一次 ref callback').toBeNull()
  })

  test('卸載後 ref.current 回到 null', () => {
    const ref = createRef<PhoneFieldHandle>()
    const view = render(<PhoneField ref={ref} value="" onChange={() => {}} />)
    view.unmount()
    expect(ref.current, '元件卸載後父元件的 ref.current 要是 null（useImperativeHandle 會處理；自己賦值的話要記得清）').toBeNull()
  })

  test('不傳 ref 也能正常輸入', async () => {
    const onChange = vi.fn()
    render(<PhoneField value="" onChange={onChange} />)
    await userEvent.setup().type(screen.getByLabelText('手機號碼'), '09')
    expect(onChange.mock.calls, '輸入時要呼叫 onChange(輸入框的值)；沒傳 ref 不能出錯').toEqual([['0'], ['9']])
  })

  test('型別：PhoneFieldHandle 只有 focus，ref 的型別是 Ref<PhoneFieldHandle>', () => {
    const errors = typecheck(import.meta.dirname, { '__ex4.usage.tsx': `
import { useRef, type ComponentProps, type Ref } from 'react'
import { PhoneField, type PhoneFieldHandle } from './PhoneField.tsx'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
export const onlyFocus: Equal<keyof PhoneFieldHandle, 'focus'> = true
export const refType: Equal<ComponentProps<typeof PhoneField>['ref'], Ref<PhoneFieldHandle> | undefined> = true

export function Checkout() {
  const phoneRef = useRef<PhoneFieldHandle>(null)
  phoneRef.current?.focus
  // @ts-expect-error 父元件拿不到 input 的 value
  phoneRef.current?.value
  return <PhoneField ref={phoneRef} value="" onChange={() => {}} />
}
` })
    expect(errors, 'PhoneFieldHandle 與 props 的 ref 型別不能改（不能用 any）：ref?: Ref<PhoneFieldHandle>').toBe('')
  }, 60000)
})
