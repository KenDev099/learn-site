import { useCallback, useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>
type Result = { key: string; products: Product[]; error: Error | null }
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

// 錯在：reload 什麼都沒做
export function useMenu(api: MenuApi, keyword: string) {
  const [result, setResult] = useState<Result | null>(null)
  const key = keyword

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    api.search(keyword, { signal }).then(
      products => { if (!signal.aborted) setResult({ key, products, error: null }) },
      (e: unknown) => { if (!signal.aborted) setResult({ key, products: [], error: toError(e) }) },
    )
    return () => controller.abort()
  }, [api, keyword, key])

  const reload = useCallback(() => {}, [])
  const current = result?.key === key ? result : null
  return { products: current?.products ?? [], loading: current === null, error: current?.error ?? null, reload }
}
