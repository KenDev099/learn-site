// 錯誤寫法：自己在 effect 裡對 ref.current 賦值。父元件傳 ref callback 時沒有作用，卸載後也沒清回 null
import { useEffect, useRef, type Ref } from 'react'

export type PhoneFieldHandle = { focus(): void }

type Props = {
  ref?: Ref<PhoneFieldHandle>
  value: string
  onChange: (value: string) => void
}

export function PhoneField({ ref, value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref && typeof ref === 'object') ref.current = { focus: () => input.current?.focus() }
  }, [ref])

  return (
    <label>
      手機號碼
      <input ref={input} type="tel" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
