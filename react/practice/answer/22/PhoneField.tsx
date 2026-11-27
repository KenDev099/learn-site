import { useId } from 'react'

export function PhoneField({ label }: { label: string }) {
  const id = useId()   // 依元件在樹裡的位置產生，伺服器和瀏覽器一樣

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="tel" name="phone" aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`}>格式：0912-345-678</p>
    </div>
  )
}
