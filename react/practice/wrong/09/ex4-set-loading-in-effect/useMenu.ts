import { useCallback, useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>
type Result = { key: string; products: Product[]; error: Error | null }
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

// 錯在：在 effect 裡 setLoading(true)：keyword 換了的那次畫面，loading 還是 false、products 還是舊的
export function useMenu(api: MenuApi, keyword: string) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)
    setError(null)
    api.search(keyword, { signal }).then(
      list => { if (!signal.aborted) { setProducts(list); setLoading(false) } },
      (e: unknown) => { if (!signal.aborted) { setError(toError(e)); setLoading(false) } },
    )
    return () => controller.abort()
  }, [api, keyword, version])

  const reload = useCallback(() => setVersion(v => v + 1), [])
  return { products, loading, error, reload }
}
