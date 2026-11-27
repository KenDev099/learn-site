/*
練習 4（下半）：MenuCount 改用 useApi()
要求：
  1. 不再 import realClient：用 api-context.tsx 的 useApi() 拿 api
  2. 其他行為不變：載入中顯示「載入中…」，成功顯示「共 N 項商品」，失敗顯示 role="alert" 的「載入失敗」，
     卸載或重新載入時取消上一個請求（第 5 課的 AbortController），被取消的請求不能再改 state
  3. effect 用到了 api，依賴陣列要列出來：ApiProvider 換了 api，要用新的 api 重新載入
不能做的事：不能用 eslint-disable 蓋掉 react-hooks/exhaustive-deps
*/
import { useEffect, useState } from 'react'
import { realClient } from './real-client.ts'

type State = { status: 'loading' } | { status: 'ok'; count: number } | { status: 'error' }

export function MenuCount() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    realClient.getMenu({ signal: controller.signal }).then(
      menu => { if (!controller.signal.aborted) setState({ status: 'ok', count: menu.length }) },
      () => { if (!controller.signal.aborted) setState({ status: 'error' }) },
    )
    return () => controller.abort()
  }, [])

  if (state.status === 'loading') return <p>載入中…</p>
  if (state.status === 'error') return <p role="alert">載入失敗</p>
  return <p>共 {state.count} 項商品</p>
}
