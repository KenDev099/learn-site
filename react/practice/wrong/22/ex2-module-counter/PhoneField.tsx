let next = 0   // 錯：模組層級的計數器，伺服器上被所有請求共用，瀏覽器從頭數

export function PhoneField({ label }: { label: string }) {
  const id = `phone-${++next}`

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="tel" name="phone" aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`}>格式：0912-345-678</p>
    </div>
  )
}
