// 練習 2 的兩個頁面。這個檔案不用改
import { useSearchParams } from 'react-router'
import { Page } from './Page.tsx'

export function MenuPage() {
  const [params, setParams] = useSearchParams()
  return (
    <Page title="菜單">
      <label>
        搜尋品名
        <input value={params.get('q') ?? ''} onChange={e => setParams({ q: e.target.value })} />
      </label>
    </Page>
  )
}

export function CartPage() {
  return (
    <Page title="購物車">
      <p>拿鐵 × 1</p>
    </Page>
  )
}
