import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function ProductDetail({ productId, api }: { productId: number; api: FakeMenuApi }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let ignore = false   // 這一次 effect 自己的旗標：被清理之後，它的回應就過期了
    setProduct(null)
    setError(null)
    api.getProduct(productId, { signal: controller.signal }).then(
      p => { if (!ignore) setProduct(p) },
      (e: unknown) => { if (!ignore) setError(e instanceof Error ? e.message : '載入失敗') },
    )
    return () => {
      ignore = true        // 先標記過期：之後不管成功、失敗、被取消，都不再改 state
      controller.abort()   // 再取消請求，省下網路與伺服器的工作
    }
  }, [productId, api])

  if (error) return <p role="alert">{error}</p>
  if (!product) return <p>載入中…</p>
  return <p className="name">{product.name} ${product.price}</p>
}
