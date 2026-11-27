// 錯誤寫法：useImperativeHandle 回傳 input 節點本身，等於沒有限制
import { useImperativeHandle, useRef, type Ref } from 'react'

export type PhoneFieldHandle = { focus(): void }

type Props = {
  ref?: Ref<PhoneFieldHandle>
  value: string
  onChange: (value: string) => void
}

export function PhoneField({ ref, value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => input.current!, [])

  return (
    <label>
      手機號碼
      <input ref={input} type="tel" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
