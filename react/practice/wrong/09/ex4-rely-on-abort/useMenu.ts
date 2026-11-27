import { useCallback, useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>
type Result = { key: string; products: Product[]; error: Error | null }
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

// 錯在：有 abort，但收到回應時沒檢查過不過期：API 不理會 signal 時，舊的回應會蓋掉新的
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
    return () => controller.abort()
  }, [api, keyword, key])

  const reload = useCallback(() => setVersion(v => v + 1), [])
  const current = result?.key === key ? result : null
  return { products: current?.products ?? [], loading: current === null, error: current?.error ?? null, reload }
}
