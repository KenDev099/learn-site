// 錯誤：只有 abort、沒有 ignore：被取消的請求以 AbortError 失敗，被當成錯誤顯示
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function ProductDetail({ productId, api }: { productId: number; api: FakeMenuApi }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setProduct(null)
    setError(null)
    api.getProduct(productId, { signal: controller.signal }).then(setProduct, (e: unknown) => setError(e instanceof Error ? e.message : '載入失敗'))
    return () => controller.abort()
  }, [productId, api])

  if (error) return <p role="alert">{error}</p>
  if (!product) return <p>載入中…</p>
  return <p className="name">{product.name} ${product.price}</p>
}
