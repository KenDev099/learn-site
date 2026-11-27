// 錯誤：依賴對了，但沒有清理：舊回應會蓋掉新的，也沒有取消請求
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function ProductDetail({ productId, api }: { productId: number; api: FakeMenuApi }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setProduct(null)
    setError(null)
    api.getProduct(productId).then(setProduct, (e: unknown) => setError(e instanceof Error ? e.message : '載入失敗'))
  }, [productId, api])

  if (error) return <p role="alert">{error}</p>
  if (!product) return <p>載入中…</p>
  return <p className="name">{product.name} ${product.price}</p>
}
