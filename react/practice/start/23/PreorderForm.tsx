/*
  練習 1 的受測元件（已經寫好，不用改）：外帶預訂表單
  規格（你的檢查只能依賴這裡寫的東西；判分時會換成內部寫法、class、錯誤文字、欄位標記都不同的另一個正確版本）：
  - props：onSubmit(order: { name: string; productId: number; quantity: number })
  - 三個欄位，各有 label：「姓名」（文字）、「品項」（下拉選單，選項文字是商品名稱，預設美式咖啡）、「數量」（數字，預設 1）
  - 一顆「送出預訂」按鈕（真的 <button>）
  - 姓名去掉前後空白後是空的，或數量不是 1 以上的整數：顯示 role="alert" 的錯誤訊息（文字不固定），不呼叫 onSubmit
  - 都正確：呼叫 onSubmit 一次，參數是 { name: 去掉前後空白的姓名, productId: 選中商品的 id, quantity: 數量（數字） }，
    錯誤訊息消失
  商品的 id 見 helpers/fake-api.ts 的 PRODUCTS（美式咖啡 1、拿鐵 2、卡布奇諾 3……）
*/
import { useId, useState, type FormEvent } from 'react'
import { PRODUCTS } from '../../helpers/fake-api.ts'

export type Preorder = { name: string; productId: number; quantity: number }
export type PreorderFormProps = { onSubmit: (order: Preorder) => void }

export function PreorderForm({ onSubmit }: PreorderFormProps) {
  const id = useId()
  const [name, setName] = useState('')
  const [productId, setProductId] = useState(PRODUCTS[0].id)
  const [quantity, setQuantity] = useState('1')
  const [error, setError] = useState('')

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = Number(quantity)
    if (!name.trim()) {
      setError('請輸入姓名')
      return
    }
    if (!Number.isInteger(n) || n < 1) {
      setError('數量至少 1 杯')
      return
    }
    setError('')
    onSubmit({ name: name.trim(), productId, quantity: n })
  }

  return (
    <form className="preorder" onSubmit={submit}>
      <div className="preorder__row">
        <label htmlFor={`${id}-name`}>姓名</label>
        <input id={`${id}-name`} className="preorder__name" placeholder="例：王小明" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="preorder__row">
        <label htmlFor={`${id}-product`}>品項</label>
        <select id={`${id}-product`} value={productId} onChange={e => setProductId(Number(e.target.value))}>
          {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="preorder__row">
        <label htmlFor={`${id}-qty`}>數量</label>
        <input id={`${id}-qty`} type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
      </div>
      {error && <p role="alert" className="preorder__error" data-testid="preorder-error">{error}</p>}
      <button type="submit" className="preorder__submit" data-testid="preorder-submit">送出預訂</button>
    </form>
  )
}
