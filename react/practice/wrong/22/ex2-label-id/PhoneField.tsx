export function PhoneField({ label }: { label: string }) {
  const id = `phone-${label}`   // 錯：label 一樣的兩個欄位 id 重複

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="tel" name="phone" aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`}>格式：0912-345-678</p>
    </div>
  )
}
