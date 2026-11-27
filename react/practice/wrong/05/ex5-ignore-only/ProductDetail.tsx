// 錯誤：只有 ignore、沒有取消請求（畫面是對的，但請求還在跑）
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function ProductDetail({ productId, api }: { productId: number; api: FakeMenuApi }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    setProduct(null)
    setError(null)
    api.getProduct(productId).then(
      p => { if (!ignore) setProduct(p) },
      (e: unknown) => { if (!ignore) setError(e instanceof Error ? e.message : '載入失敗') },
    )
    return () => { ignore = true }
  }, [productId, api])

  if (error) return <p role="alert">{error}</p>
  if (!product) return <p>載入中…</p>
  return <p className="name">{product.name} ${product.price}</p>
}
