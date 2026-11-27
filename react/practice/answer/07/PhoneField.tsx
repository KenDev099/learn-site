// 練習 4：手機號碼欄位 PhoneField（ref 是 prop，只開放 focus）
import { useImperativeHandle, useRef, type Ref } from 'react'

export type PhoneFieldHandle = { focus(): void }

type Props = {
  ref?: Ref<PhoneFieldHandle>
  value: string
  onChange: (value: string) => void
}

export function PhoneField({ ref, value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)   // 真正的 DOM 節點留在元件裡面

  // 父元件的 ref 拿到的是這個物件，不是 input 本身
  useImperativeHandle(ref, () => ({
    focus() {
      input.current?.focus()
    },
  }), [])

  return (
    <label>
      手機號碼
      <input ref={input} type="tel" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
