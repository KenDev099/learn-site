import { useCallback, useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>
type Result = { key: string; products: Product[]; error: Error | null }
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

// 錯在：被取消的請求（AbortError）也當成錯誤顯示
export function useMenu(api: MenuApi, keyword: string) {
  const [version, setVersion] = useState(0)
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const key = `${version}:${keyword}`
  const [seenKey, setSeenKey] = useState(key)
  if (seenKey !== key) { setSeenKey(key); setProducts(null); setError(null) }

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    api.search(keyword, { signal }).then(
      list => { if (!signal.aborted) setProducts(list) },
      (e: unknown) => setError(toError(e)),
    )
    return () => controller.abort()
  }, [api, keyword, key])

  const reload = useCallback(() => setVersion(v => v + 1), [])
  return { products: products ?? [], loading: products === null && error === null, error, reload }
}
