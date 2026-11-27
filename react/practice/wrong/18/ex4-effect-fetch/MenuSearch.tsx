import { useEffect, useState } from 'react'
import { Form, useSearchParams, type RouteObject } from 'react-router'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'getMenu' | 'search'>

// 錯誤寫法：q 放在網址了，但還是在 effect 裡抓（沒有 loader）
export function menuRoute(api: MenuApi): RouteObject {
  function MenuSearch() {
    const [params] = useSearchParams()
    const q = (params.get('q') ?? '').trim()
    const [products, setProducts] = useState<Product[] | null>(null)
    useEffect(() => {
      const controller = new AbortController()
      ;(q ? api.search(q, { signal: controller.signal }) : api.getMenu({ signal: controller.signal })).then(setProducts, () => {})
      return () => controller.abort()
    }, [q])
    return (
      <section>
        <Form role="search">
          <input key={q} name="q" aria-label="搜尋商品" defaultValue={q} />
          <button>搜尋</button>
        </Form>
        {products === null && <p role="status">更新中…</p>}
        {products && (products.length === 0
          ? <p>沒有符合的商品</p>
          : <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>)}
      </section>
    )
  }
  return { Component: MenuSearch }
}
