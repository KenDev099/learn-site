import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export type Sweetness = 'normal' | 'half' | 'none'
export type Draft = { productId: number; quantity: string; sweetness: Sweetness; takeout: boolean; note: string }

export const SWEETNESS: readonly { value: Sweetness; label: string }[] = [
  { value: 'normal', label: '正常甜' },
  { value: 'half', label: '半糖' },
  { value: 'none', label: '無糖' },
]

// 摘要是衍生值：每次 render 由 draft 算出來，不另外存 state
function summarize(draft: Draft, products: readonly Product[]): string {
  const product = products.find(p => p.id === draft.productId)
  if (!product) return '請選擇商品'
  const quantity = Number(draft.quantity)
  if (draft.quantity.trim() === '' || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return '數量要是 1～20 的整數'
  const sweetness = SWEETNESS.find(s => s.value === draft.sweetness)!.label
  const note = draft.note.trim()
  return `${product.name} × ${quantity}，${sweetness}，${draft.takeout ? '外帶' : '內用'}，共 $${product.price * quantity}${note ? `，備註：${note}` : ''}`
}

export function DrinkForm({ products, initial }: { products: readonly Product[]; initial: Draft }) {
  const [draft, setDraft] = useState(initial)

  // 一個函式更新任何欄位：K 把「哪個欄位」和「值的型別」綁在一起
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ [key]: value } as Draft)
  }

  return (
    <form>
      <label>
        商品
        <select name="productId" value={draft.productId} onChange={e => set('productId', Number(e.target.value))}>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>
        數量
        <input type="number" name="quantity" min={1} max={20} value={draft.quantity} onChange={e => set('quantity', e.target.value)} />
      </label>
      <fieldset>
        <legend>甜度</legend>
        {SWEETNESS.map(s => (
          <label key={s.value}>
            <input type="radio" name="sweetness" value={s.value} checked={draft.sweetness === s.value} onChange={() => set('sweetness', s.value)} />
            {s.label}
          </label>
        ))}
      </fieldset>
      <label>
        <input type="checkbox" name="takeout" checked={draft.takeout} onChange={e => set('takeout', e.target.checked)} />
        外帶
      </label>
      <label>
        備註
        <textarea name="note" value={draft.note} onChange={e => set('note', e.target.value)} />
      </label>
      <button type="button" onClick={() => setDraft(initial)}>重設</button>
      <p role="status">{summarize(draft, products)}</p>
    </form>
  )
}
