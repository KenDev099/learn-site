import { useCallback, useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>

// 結果連同「它是哪一次請求的」一起存：render 時比對 key，就知道手上的結果還算不算數
type Result = { key: string; products: Product[]; error: Error | null }

export function useMenu(api: MenuApi, keyword: string) {
  const [version, setVersion] = useState(0)            // reload() 讓它加 1，effect 就會重跑
  const [result, setResult] = useState<Result | null>(null)
  const key = `${version}:${keyword}`

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    api.search(keyword, { signal }).then(
      products => { if (!signal.aborted) setResult({ key, products, error: null }) },
      (e: unknown) => { if (!signal.aborted) setResult({ key, products: [], error: e instanceof Error ? e : new Error(String(e)) }) },
    )
    return () => controller.abort()
  }, [api, keyword, key])

  const reload = useCallback(() => setVersion(v => v + 1), [])

  const current = result?.key === key ? result : null   // 衍生值：結果屬於目前這次請求才採用
  return { products: current?.products ?? [], loading: current === null, error: current?.error ?? null, reload }
}
