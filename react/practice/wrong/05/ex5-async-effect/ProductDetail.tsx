// 錯誤：effect 的函式寫成 async：回傳的是 Promise，清理函式永遠不會被呼叫
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function ProductDetail({ productId, api }: { productId: number; api: FakeMenuApi }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  // @ts-expect-error effect 不能回傳 Promise
  useEffect(async () => {
    const controller = new AbortController()
    let ignore = false
    setProduct(null)
    setError(null)
    try {
      const p = await api.getProduct(productId, { signal: controller.signal })
      if (!ignore) setProduct(p)
    } catch (e) {
      if (!ignore) setError(e instanceof Error ? e.message : '載入失敗')
    }
    return () => { ignore = true; controller.abort() }
  }, [productId, api])

  if (error) return <p role="alert">{error}</p>
  if (!product) return <p>載入中…</p>
  return <p className="name">{product.name} ${product.price}</p>
}
