import { useId } from 'react'

export function PhoneField({ label }: { label: string }) {
  const id = useId()

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {/* 錯：說明文字沒有 id，aria-describedby 連不到 */}
      <input id={id} type="tel" name="phone" aria-describedby={`${id}-hint`} />
      <p>格式：0912-345-678</p>
    </div>
  )
}
