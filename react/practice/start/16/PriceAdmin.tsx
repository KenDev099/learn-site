/*
練習 1：店長後台改價：useMutation ＋ invalidateQueries
畫面：上面是菜單列表（queryKey ['products', 'list']），中間是目前商品的售價（queryKey ['products', 'detail', productId]），
      下面是改價表單 PriceEditor。ProductList、ProductPrice 已經寫好，只要改 PriceEditor。
問題：PriceEditor 直接 await api.updatePrice()：
      - 存好之後列表和售價還是舊的（快取不知道伺服器改了）
      - 送出期間按鈕還能再按，店長連按兩下就送出兩次
      - 失敗時什麼都沒顯示
要求：
  1. 用 useMutation，mutationFn 呼叫 api.updatePrice(productId, 價格)（價格是輸入框的數字）
  2. 送出中：按鈕 disabled，文字是「儲存中…」；這段期間不會再送出
  3. 成功後讓 ['products'] 開頭的 query 全部失效（列表和售價都要重抓），
     而且要等重抓完成才算存好：重抓完成之前按鈕仍是「儲存中…」（把 invalidateQueries 的 Promise 回傳出去）
  4. 失敗時顯示 <p role="alert">儲存失敗：錯誤訊息</p>；再送出一次、成功之後訊息要消失
  5. 送出之前不要讓快取失效（伺服器還沒改，重抓只會拿到舊價格）
*/
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ShopApi } from './shop-api.ts'

type Props = { api: ShopApi; productId: number }

export function ProductList({ api }: { api: ShopApi }) {
  const { data } = useQuery({ queryKey: ['products', 'list'], queryFn: () => api.getProducts() })
  if (!data) return <p>菜單載入中…</p>
  return (
    <ul aria-label="菜單">
      {data.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}
    </ul>
  )
}

export function ProductPrice({ api, productId }: Props) {
  const { data } = useQuery({ queryKey: ['products', 'detail', productId], queryFn: () => api.getProduct(productId) })
  return <p aria-label="目前售價">{data ? `${data.name} 目前售價 $${data.price}` : '載入中…'}</p>
}

export function PriceEditor({ api, productId }: Props) {
  const [price, setPrice] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await api.updatePrice(productId, Number(price))
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        新價格
        <input type="number" value={price} onChange={e => setPrice(e.target.value)} />
      </label>
      <button type="submit">儲存</button>
    </form>
  )
}

export function PriceAdmin({ api, productId }: Props) {
  return (
    <>
      <ProductList api={api} />
      <ProductPrice api={api} productId={productId} />
      <PriceEditor api={api} productId={productId} />
    </>
  )
}
