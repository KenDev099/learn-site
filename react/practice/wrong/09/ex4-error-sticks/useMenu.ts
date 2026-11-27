import { useCallback, useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>
type Result = { key: string; products: Product[]; error: Error | null }
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

// 錯在：錯誤另外存，重新載入、換 keyword 之後沒有清掉
export function useMenu(api: MenuApi, keyword: string) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const key = `${version}:${keyword}`

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    api.search(keyword, { signal }).then(
      products => { if (!signal.aborted) setResult({ key, products, error: null }) },
      (e: unknown) => { if (!signal.aborted) { setError(toError(e)); setResult({ key, products: [], error: null }) } },
    )
    return () => controller.abort()
  }, [api, keyword, key])

  const reload = useCallback(() => setVersion(v => v + 1), [])
  const current = result?.key === key ? result : null
  return { products: current?.products ?? [], loading: current === null, error, reload }
}
