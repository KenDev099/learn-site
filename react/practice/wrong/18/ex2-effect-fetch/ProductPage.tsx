import { useEffect, useState } from 'react'
import { Link, useParams, type RouteObject } from 'react-router'
import { NotFoundError, type FakeMenuApi, type Product } from '../../helpers/fake-api.ts'

export type ProductApi = Pick<FakeMenuApi, 'getProduct'>

// 錯誤寫法：還是在 effect 裡抓，沒有 loader
export function productRoute(api: ProductApi): RouteObject {
  function ProductPage() {
    const { id = '' } = useParams()
    const [product, setProduct] = useState<Product | null>(null)
    const [error, setError] = useState<string | null>(null)
    useEffect(() => {
      if (!/^\d+$/.test(id)) { setError('找不到商品'); return }
      const controller = new AbortController()
      api.getProduct(Number(id), { signal: controller.signal }).then(setProduct, e => {
        if (!controller.signal.aborted) setError(e instanceof NotFoundError ? '找不到商品' : `載入失敗：${e.message}`)
      })
      return () => controller.abort()
    }, [id])
    if (error) return <div role="alert"><p>{error}</p><Link to="/menu">回菜單</Link></div>
    if (!product) return <p>載入中…</p>
    return <article><h1>{product.name}</h1><p>${product.price}</p></article>
  }
  return { Component: ProductPage }
}
