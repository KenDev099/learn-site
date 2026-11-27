/*
  練習 3 的受測元件（已經寫好，不用改）：前台的菜單頁
  規格（你的檢查只能依賴這裡寫的東西；判分時會換成文字、標記、內部寫法都不同的另一個正確版本）：
  - props：api（有 getMenu(): Promise<Product[]>）；掛載時呼叫 api.getMenu() 一次
  - 等待中：顯示 role="status" 的載入訊息（文字不固定）
  - 成功：載入訊息消失，出現名稱為「菜單」的清單（list），每個商品一項（listitem），項目文字含商品名稱
  - 失敗：載入訊息消失，出現 role="alert" 的錯誤訊息（文字不固定）和一顆「重試」按鈕
  - 按「重試」：錯誤訊息消失、回到載入中，再呼叫 api.getMenu() 一次；之後成功就列出菜單
*/
import { useEffect, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export type MenuApi = { getMenu: () => Promise<Product[]> }
export type MenuPageProps = { api: MenuApi }

type State = { status: 'loading' } | { status: 'error' } | { status: 'success'; items: Product[] }

export function MenuPage({ api }: MenuPageProps) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let ignore = false
    api.getMenu().then(
      items => { if (!ignore) setState({ status: 'success', items }) },
      () => { if (!ignore) setState({ status: 'error' }) },
    )
    return () => { ignore = true }
  }, [api, attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt(a => a + 1)
  }

  return (
    <main>
      <h1>菜單</h1>
      {state.status === 'loading' && <p role="status">載入菜單中…</p>}
      {state.status === 'error' && (
        <>
          <p role="alert">菜單載入失敗，請稍後再試</p>
          <button type="button" onClick={retry}>重試</button>
        </>
      )}
      {state.status === 'success' && (
        <ul aria-label="菜單">
          {state.items.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}
        </ul>
      )}
    </main>
  )
}
