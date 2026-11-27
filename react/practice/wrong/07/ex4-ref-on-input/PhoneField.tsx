// 錯誤寫法：把 ref 直接放在 <input> 上（還要用型別斷言騙過檢查）。父元件拿到整個 DOM 節點，想改 value、style 都可以
import { type Ref } from 'react'

export type PhoneFieldHandle = { focus(): void }

type Props = {
  ref?: Ref<PhoneFieldHandle>
  value: string
  onChange: (value: string) => void
}

export function PhoneField({ ref, value, onChange }: Props) {

  return (
    <label>
      手機號碼
      <input ref={ref as unknown as Ref<HTMLInputElement>} type="tel" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
