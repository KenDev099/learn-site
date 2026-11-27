import { useCallback, useEffect, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>
type Result = { key: string; products: Product[]; error: Error | null }
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

// 錯在：只用旗標丟掉過期的結果，沒有把 signal 傳給 api，請求沒有真的取消
export function useMenu(api: MenuApi, keyword: string) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const key = `${version}:${keyword}`

  useEffect(() => {
    let ignore = false
    api.search(keyword).then(
      products => { if (!ignore) setResult({ key, products, error: null }) },
      (e: unknown) => { if (!ignore) setResult({ key, products: [], error: toError(e) }) },
    )
    return () => { ignore = true }
  }, [api, keyword, key])

  const reload = useCallback(() => setVersion(v => v + 1), [])
  const current = result?.key === key ? result : null
  return { products: current?.products ?? [], loading: current === null, error: current?.error ?? null, reload }
}
