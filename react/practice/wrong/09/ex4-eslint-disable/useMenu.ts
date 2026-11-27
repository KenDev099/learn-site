import { useCallback, useEffect, useRef, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'search'>
type Result = { key: string; products: Product[]; error: Error | null }
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

// 錯在：為了「讀最新的 api」把依賴拿掉，用 eslint-disable 蓋掉警告
export function useMenu(api: MenuApi, keyword: string) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const key = `${version}:${keyword}`
  const apiRef = useRef(api)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    apiRef.current.search(keyword, { signal }).then(
      products => { if (!signal.aborted) setResult({ key, products, error: null }) },
      (e: unknown) => { if (!signal.aborted) setResult({ key, products: [], error: toError(e) }) },
    )
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const reload = useCallback(() => setVersion(v => v + 1), [])
  const current = result?.key === key ? result : null
  return { products: current?.products ?? [], loading: current === null, error: current?.error ?? null, reload }
}
