import { useState, type MouseEvent } from 'react'

export type Pickup = { name: string; phone: string }
type Errors = Partial<Record<keyof Pickup, string>>

const EMPTY: Pickup = { name: '', phone: '' }

// 驗證是純函式：同樣的欄位值一定得到同樣的錯誤
function validate(form: Pickup): Errors {
  const errors: Errors = {}
  if (form.name.trim() === '') errors.name = '請輸入姓名'
  if (!/^09\d{8}$/.test(form.phone)) errors.phone = '手機要是 09 開頭的 10 碼數字'
  return errors
}

export function PickupForm({ onSubmit }: { onSubmit: (data: Pickup) => Promise<void> }) {
  const [form, setForm] = useState(EMPTY)
  const [tried, setTried] = useState(false)   // 按過送出了沒：決定錯誤要不要顯示
  const [status, setStatus] = useState<'idle' | 'submitting' | 'failed'>('idle')

  const errors = validate(form)               // 衍生值：每次 render 重新算，永遠跟欄位一致
  const submitting = status === 'submitting'

  async function handleSubmit(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    if (submitting) return
    setTried(true)
    if (errors.name || errors.phone) return
    setStatus('submitting')
    try {
      await onSubmit({ name: form.name.trim(), phone: form.phone })
      setForm(EMPTY)
      setTried(false)
      setStatus('idle')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <form noValidate>
      <div>
        <label htmlFor="pickup-name">姓名</label>
        <input id="pickup-name" name="name" autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        {tried && errors.name && <p role="alert">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="pickup-phone">手機</label>
        <input id="pickup-phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        {tried && errors.phone && <p role="alert">{errors.phone}</p>}
      </div>
      {status === 'failed' && <p role="alert">送出失敗，請再試一次</p>}
      <button type="submit" disabled={submitting} onClick={handleSubmit}>{submitting ? '送出中…' : '送出'}</button>
    </form>
  )
}
