// 錯在：MenuCount 還是直接 import realClient，沒有用 useApi()
import { useEffect, useState } from 'react'
import { realClient } from './real-client.ts'

type State = { status: 'loading' } | { status: 'ok'; count: number } | { status: 'error' }

export function MenuCount() {
  const api = realClient
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    api.getMenu({ signal: controller.signal }).then(
      menu => { if (!controller.signal.aborted) setState({ status: 'ok', count: menu.length }) },
      () => { if (!controller.signal.aborted) setState({ status: 'error' }) },
    )
    return () => controller.abort()
  }, [])

  if (state.status === 'loading') return <p>載入中…</p>
  if (state.status === 'error') return <p role="alert">載入失敗</p>
  return <p>共 {state.count} 項商品</p>
}
