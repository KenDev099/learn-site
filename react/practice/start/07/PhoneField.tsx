// 練習 4：手機號碼欄位 PhoneField（ref 是 prop，只開放 focus）
// 問題：結帳表單送出時如果手機沒填，父元件要把游標移到這個欄位：phoneRef.current.focus()。
//       現在 PhoneField 沒有處理 ref 這個 prop，父元件的 phoneRef.current 永遠是 null。
// 要求：
//   1. 父元件傳 ref 進來，ref.current.focus() 會讓輸入框取得焦點
//   2. ref.current 只能有 focus 這一個方法：不能把整個 <input> DOM 節點交出去（父元件不該能改 value、style）
//   3. 父元件傳 ref 物件或 ref callback 都要能用；元件卸載後 ref 物件的 current 回到 null；不傳 ref 也能正常使用
// 不能做的事：改 PhoneFieldHandle 與 ref 的型別（不能用 any）；自己對 ref.current 賦值
import { type Ref } from 'react'

export type PhoneFieldHandle = { focus(): void }

type Props = {
  ref?: Ref<PhoneFieldHandle>
  value: string
  onChange: (value: string) => void
}

export function PhoneField({ value, onChange }: Props) {   // ✗ 沒有用到 ref
  return (
    <label>
      手機號碼
      <input type="tel" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
