/*
練習 4：菜單搜尋：網址的 ?q= 交給 loader，送出用 <Form>
問題：搜尋結果放在元件的 state、在 effect 裡抓：搜尋後網址沒變，分享出去看不到結果；
      按上一頁，結果和輸入框都沒有回到上一次的搜尋。
要求：menuRoute(api) 回傳這條路由的 { loader, Component }（path 由外面決定，例如 'menu'）
  1. loader 從網址讀 ?q=，去掉前後空白：空字串時呼叫 api.getMenu({ signal })，
     否則呼叫 api.search(q, { signal })；signal 用 request.signal
  2. 元件用 useLoaderData 讀結果：<ul> 裡每個商品一個 <li>，內容是品名；沒有結果時顯示「沒有符合的商品」
  3. 搜尋表單用 React Router 的 <Form>（GET）：輸入框 name="q"、aria-label="搜尋商品"，按「搜尋」送出，
     網址變成 ?q=…（新增一筆歷史紀錄），loader 重新執行
  4. 新結果還沒回來時，保留目前的清單，另外顯示 role="status" 的「更新中…」（用 useNavigation）；
     回來後「更新中…」消失
  5. 輸入框的值跟著網址：按上一頁回到 ?q=拿，輸入框要顯示「拿」，不是剛剛打的字
  6. 快速搜尋兩次時，第一次還沒回來的請求要被取消
*/
import { useEffect, useState } from 'react'
import type { RouteObject } from 'react-router'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'getMenu' | 'search'>

export function menuRoute(api: MenuApi): RouteObject {
  function MenuSearch() {
    const [draft, setDraft] = useState('')
    const [keyword, setKeyword] = useState('')
    const [products, setProducts] = useState<Product[]>([])
    useEffect(() => {
      const q = keyword.trim()
      ;(q ? api.search(q) : api.getMenu()).then(setProducts)
    }, [keyword])
    return (
      <section>
        <form role="search" onSubmit={e => { e.preventDefault(); setKeyword(draft) }}>
          <input aria-label="搜尋商品" value={draft} onChange={e => setDraft(e.target.value)} />
          <button>搜尋</button>
        </form>
        {products.length === 0
          ? <p>沒有符合的商品</p>
          : <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>}
      </section>
    )
  }
  return { Component: MenuSearch }
}
