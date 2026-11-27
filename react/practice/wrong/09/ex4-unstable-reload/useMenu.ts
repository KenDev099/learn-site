import { useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>
type Result = { key: string; products: Product[]; error: Error | null }
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

// 錯在：reload 每次 render 都是新的函式
export function useMenu(api: MenuApi, keyword: string) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const key = `${version}:${keyword}`

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    api.search(keyword, { signal }).then(
      products => { if (!signal.aborted) setResult({ key, products, error: null }) },
      (e: unknown) => { if (!signal.aborted) setResult({ key, products: [], error: toError(e) }) },
    )
    return () => controller.abort()
  }, [api, keyword, key])

  const reload = () => setVersion(v => v + 1)
  const current = result?.key === key ? result : null
  return { products: current?.products ?? [], loading: current === null, error: current?.error ?? null, reload }
}
