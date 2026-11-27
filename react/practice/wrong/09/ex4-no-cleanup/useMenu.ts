import { useCallback, useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>
type Result = { key: string; products: Product[]; error: Error | null }
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

// 錯在：effect 沒有清理函式：請求不會取消，過期的回應也照收
export function useMenu(api: MenuApi, keyword: string) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const key = `${version}:${keyword}`

  useEffect(() => {
    const controller = new AbortController()
    api.search(keyword, { signal: controller.signal }).then(
      products => setResult({ key, products, error: null }),
      (e: unknown) => setResult({ key, products: [], error: toError(e) }),
    )
  }, [api, keyword, key])

  const reload = useCallback(() => setVersion(v => v + 1), [])
  const current = result?.key === key ? result : null
  return { products: current?.products ?? [], loading: current === null, error: current?.error ?? null, reload }
}
