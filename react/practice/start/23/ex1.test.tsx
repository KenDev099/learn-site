import { describe, expect, test } from 'vitest'
import { useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import { cleanup } from '@testing-library/react'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { PreorderForm, type PreorderFormProps } from './PreorderForm.tsx'
import { checkPreorderForm } from './ex1.checks.tsx'

// 正確版本 B：非受控（送出時用 FormData 讀）、label 包住欄位、沒有 class、沒有 placeholder、沒有 data-testid、錯誤文字不同
// 改動旗標的預設值就是某一種錯誤版本；名稱都叫 PreorderForm，看名字分不出來
function variant({
  checkTrimmed = true, sendTrimmed = true, quantityAsNumber = true, readProduct = true, alertRole = true,
  realButton = true, labels = true, rejectZero = true, blockInvalid = true,
} = {}): ComponentType<PreorderFormProps> {
  return function PreorderForm({ onSubmit }: PreorderFormProps) {
    const form = useRef<HTMLFormElement>(null)
    const [error, setError] = useState<string | null>(null)

    function send() {
      const data = new FormData(form.current!)
      const raw = String(data.get('name') ?? '')
      const text = String(data.get('quantity') ?? '')
      const quantity = Number(text)
      const nameOk = (checkTrimmed ? raw.trim() : raw) !== ''
      const quantityOk = Number.isInteger(quantity) && quantity >= (rejectZero ? 1 : 0)
      setError(!nameOk ? '姓名必填' : !quantityOk ? '數量要是正整數' : null)
      if ((nameOk && quantityOk) || !blockInvalid) {
        onSubmit({
          name: sendTrimmed ? raw.trim() : raw,
          productId: readProduct ? Number(data.get('product')) : PRODUCTS[0].id,
          quantity: quantityAsNumber ? quantity : (text as unknown as number),
        })
      }
    }
    const field = (label: string, control: ReactNode) =>
      labels ? <label>{label} {control}</label> : <div><span>{label}</span> {control}</div>

    return (
      <form ref={form} onSubmit={(e: FormEvent) => { e.preventDefault(); send() }}>
        <fieldset>
          <legend>外帶預訂</legend>
          {field('姓名', <input name="name" />)}
          {field('品項', <select name="product" defaultValue={PRODUCTS[0].id}>{PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>)}
          {field('數量', <input name="quantity" type="number" defaultValue="1" />)}
        </fieldset>
        {error !== null && <div {...(alertRole ? { role: 'alert' } : {})}><strong>無法送出：</strong>{error}</div>}
        {realButton ? <button>送出預訂</button> : <div className="btn" onClick={send}>送出預訂</div>}
      </form>
    )
  }
}

const WRONG: [string, ComponentType<PreorderFormProps>][] = [
  ['姓名只有空白也能送出', variant({ checkTrimmed: false })],
  ['送出的姓名沒有去掉前後空白', variant({ sendTrimmed: false })],
  ['送出的數量是字串 "2"', variant({ quantityAsNumber: false })],
  ['不管選什麼品項都送出美式咖啡', variant({ readProduct: false })],
  ['錯誤訊息沒有 role="alert"', variant({ alertRole: false })],
  ['「送出預訂」是 <div onClick>，不是按鈕', variant({ realButton: false })],
  ['欄位沒有 label（文字和欄位沒有關聯）', variant({ labels: false })],
  ['數量 0 也能送出', variant({ rejectZero: false })],
  ['有顯示錯誤，但還是呼叫了 onSubmit', variant({ blockInvalid: false })],
]

async function run(Form: ComponentType<PreorderFormProps>) {
  try {
    await checkPreorderForm(Form)
    return null
  } catch (e) {
    return e instanceof Error ? e.message.split('\n')[0] : String(e)
  } finally {
    cleanup()
  }
}

describe('練習 1：預訂表單的檢查', () => {
  test('正確版本 A（PreorderForm.tsx）要通過', async () => {
    const error = await run(PreorderForm)
    expect(error, `你的檢查在正確版本 A 上丟錯：${error}`).toBeNull()
  })

  test('正確版本 B（非受控、沒有 class／placeholder／data-testid、錯誤文字不同）要通過', async () => {
    const error = await run(variant())
    expect(error, `你的檢查在正確版本 B 上丟錯：${error}。只能依賴規格：label 文字、按鈕的 role 和名稱、role="alert"、onSubmit 的參數`).toBeNull()
  })

  test.each(WRONG)('錯誤版本「%s」要被抓到', async (name, Form) => {
    const error = await run(Form)
    expect(error, `錯誤版本「${name}」通過了你的檢查：補上能抓到這個問題的 expect`).not.toBeNull()
  })
})
