import { useState } from 'react'

export function PhoneField({ label }: { label: string }) {
  // 錯：初始值函式在伺服器跑一次、hydration 時在瀏覽器又跑一次，兩個亂數不同
  const [id] = useState(() => `phone-${crypto.randomUUID()}`)

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="tel" name="phone" aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`}>格式：0912-345-678</p>
    </div>
  )
}
