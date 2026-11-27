// 錯誤寫法：handle 除了 focus 還順手交出 input 節點。父元件又能直接改 DOM 了
import { useImperativeHandle, useRef, type Ref } from 'react'

export type PhoneFieldHandle = { focus(): void }

type Props = {
  ref?: Ref<PhoneFieldHandle>
  value: string
  onChange: (value: string) => void
}

export function PhoneField({ ref, value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({
    focus() { input.current?.focus() },
    input: input.current,
  }), [])

  return (
    <label>
      手機號碼
      <input ref={input} type="tel" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
