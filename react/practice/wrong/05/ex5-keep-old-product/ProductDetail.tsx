// 錯誤：換商品時沒有清掉上一個商品，載入期間畫面還是舊的
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function ProductDetail({ productId, api }: { productId: number; api: FakeMenuApi }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let ignore = false
    setError(null)
    api.getProduct(productId, { signal: controller.signal }).then(
      p => { if (!ignore) setProduct(p) },
      (e: unknown) => { if (!ignore) setError(e instanceof Error ? e.message : '載入失敗') },
    )
    return () => { ignore = true; controller.abort() }
  }, [productId, api])

  if (error) return <p role="alert">{error}</p>
  if (!product) return <p>載入中…</p>
  return <p className="name">{product.name} ${product.price}</p>
}
