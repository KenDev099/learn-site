import { useEffect, useState } from 'react'
import { useApi } from './api-context.tsx'

type State = { status: 'loading' } | { status: 'ok'; count: number } | { status: 'error' }

export function MenuCount() {
  const api = useApi()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    api.getMenu({ signal: controller.signal }).then(
      menu => { if (!controller.signal.aborted) setState({ status: 'ok', count: menu.length }) },
      () => { if (!controller.signal.aborted) setState({ status: 'error' }) },
    )
    return () => controller.abort()
  }, [api])

  if (state.status === 'loading') return <p>載入中…</p>
  if (state.status === 'error') return <p role="alert">載入失敗</p>
  return <p>共 {state.count} 項商品</p>
}
