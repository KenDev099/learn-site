/*
練習 2：商品頁改用 loader 抓資料，錯誤交給路由的 ErrorBoundary
問題：ProductPage 在 effect 裡抓資料：先畫出「載入中…」再換成商品；網址是 /menu/abc 也照樣打 API；
      商品不存在時畫面一直停在「載入中…」。
要求：productRoute(api) 回傳這條路由的 { loader, Component, ErrorBoundary }（path 由外面決定，例如 'menu/:id'）
  1. loader 從 params.id 讀商品編號：不是純數字（例如 'abc'、'-1'、'2.5'）時不呼叫 API，
     直接 throw data('找不到商品', { status: 404 })
  2. 呼叫 api.getProduct(編號, { signal: request.signal })：signal 用 loader 收到的 request.signal，
     客人還沒等到就換到別的商品時，舊的請求會被取消
  3. API 丟出 NotFoundError（商品不存在）時，一樣 throw data('找不到商品', { status: 404 })；
     其他錯誤（例如網路斷線）原樣丟出去，不要全部當成 404
  4. Component 用 useLoaderData 讀商品，顯示 <h1>品名</h1> 和「$價格」，例如 <h1>拿鐵</h1> $110；
     元件裡不再抓資料（loader 抓完才顯示頁面）
  5. ErrorBoundary 用 useRouteError 讀錯誤，顯示 role="alert"：
       404（isRouteErrorResponse 而且 status 是 404）→「找不到商品」
       其他錯誤 → 「載入失敗：錯誤訊息」，例如「載入失敗：網路連線中斷」
     錯誤畫面裡放一個連到 /menu 的「回菜單」連結。錯誤只換掉商品頁這一塊，外層的頁首要還在
*/
import { useEffect, useState } from 'react'
import { useParams, type RouteObject } from 'react-router'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type ProductApi = Pick<FakeMenuApi, 'getProduct'>

export function productRoute(api: ProductApi): RouteObject {
  function ProductPage() {
    const { id } = useParams()
    const [product, setProduct] = useState<Product | null>(null)
    useEffect(() => {
      api.getProduct(Number(id)).then(setProduct)
    }, [id])
    if (!product) return <p>載入中…</p>
    return (
      <article>
        <h1>{product.name}</h1>
        <p>${product.price}</p>
      </article>
    )
  }
  return { Component: ProductPage }
}
