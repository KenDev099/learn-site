export function PhoneField({ label }: { label: string }) {
  const id = 'phone'   // 錯：兩邊一致，但同一頁放兩個就重複

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="tel" name="phone" aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`}>格式：0912-345-678</p>
    </div>
  )
}
