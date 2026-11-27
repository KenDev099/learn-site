// 練習 2：商品資訊面板 ProductPanel（Suspense ＋ use）
// 問題：點商品後，ProductDetail 在 effect 裡抓資料、自己管「載入中」。點太快時舊的回應會蓋掉新的，
//   每個要抓資料的元件也都要重寫一次 loading 的判斷。
// 要求：
//   1. ProductDetail 改成接收 productPromise（Promise<Product>），用 use() 讀出商品，
//      在 <p className="name"> 顯示「品名 $價格」，例如「拿鐵 $110」；自己不管載入中，等待時顯示最近的 Suspense 的 fallback
//   2. ProductPanel 在「點商品按鈕」的事件處理函式裡呼叫 api.getProduct(id)，把拿到的 Promise 存進 state，
//      每點一次只呼叫一次；重新 render 不能再呼叫
//   3. 還沒選商品時顯示 <p>請選擇商品</p>
//   4. 用 <Suspense fallback={<p role="status">載入商品中…</p>}> 只包住 ProductDetail：
//      載入時標題「商品資訊」和商品按鈕要留在畫面上
//   5. 連點兩個商品，不管哪個回應先回來，最後顯示的都是最後點的商品
// 不能做的事：在 render 的過程中呼叫 api.getProduct（包括 useMemo 裡）；在 ProductDetail 裡用 useEffect 抓資料
import { Suspense, use, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

type Api = { getProduct(id: number): Promise<Product> }

export function ProductDetail({ productPromise }: { productPromise: Promise<Product> }) {
  const product = use(productPromise)   // 還沒好：交給最近的 Suspense 顯示 fallback；好了：直接拿到值
  return <p className="name">{product.name} ${product.price}</p>
}

export function ProductPanel({ api, products }: { api: Api; products: Pick<Product, 'id' | 'name'>[] }) {
  // 存的是「這一次點擊的請求」本身：換一個 Promise，畫面就只等新的那個，舊的回來也沒人讀
  const [productPromise, setProductPromise] = useState<Promise<Product> | null>(null)
  return (
    <Suspense fallback={<p role="status">載入商品中…</p>}>
    <section>
      <h2>商品資訊</h2>
      {products.map(p => (
        <button key={p.id} type="button" onClick={() => setProductPromise(api.getProduct(p.id))}>{p.name}</button>
      ))}
      {productPromise === null ? <p>請選擇商品</p> : <ProductDetail productPromise={productPromise} />}
    </section>
    </Suspense>
  )
}
