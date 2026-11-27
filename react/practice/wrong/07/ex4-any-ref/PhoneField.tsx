// 錯誤寫法：把 ref 的型別改成 any。執行起來正常，但父元件的 ref 失去型別檢查
import { useImperativeHandle, useRef } from 'react'

export type PhoneFieldHandle = { focus(): void }

type Props = {
  ref?: any
  value: string
  onChange: (value: string) => void
}

export function PhoneField({ ref, value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({
    focus() { input.current?.focus() },
  }), [])

  return (
    <label>
      手機號碼
      <input ref={input} type="tel" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
