// 錯誤：當成 onMounted，只抓第一次，用 eslint-disable 蓋掉
import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function ProductDetail({ productId, api }: { productId: number; api: FakeMenuApi }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let ignore = false
    api.getProduct(productId, { signal: controller.signal }).then(
      p => { if (!ignore) setProduct(p) },
      (e: unknown) => { if (!ignore) setError(e instanceof Error ? e.message : '載入失敗') },
    )
    return () => { ignore = true; controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) return <p role="alert">{error}</p>
  if (!product) return <p>載入中…</p>
  return <p className="name">{product.name} ${product.price}</p>
}
