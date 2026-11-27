// 練習 2：MenuList（staleTime 與背景更新）
// 菜單頁顯示所有商品：<MenuList api={api} />。菜單一天才改幾次，客人在菜單頁和商品頁之間來回切換，
// 下面的版本每次回到菜單頁都重抓，而且重抓時整份清單消失、換成「載入中…」。要求：
//   1. 菜單抓回來後 60 秒內算新鮮：這段時間內再回到菜單頁，直接顯示快取，不送請求
//   2. 超過 60 秒算過期：回到菜單頁時先顯示快取裡的清單，同時在背景重抓，
//      背景重抓時清單保留，另外顯示 role="status" 的「更新中…」；抓完後清單換成新的，「更新中…」消失
//   3. 第一次載入（還沒有任何資料）只顯示「載入中…」，不顯示「更新中…」
//   4. 背景重抓失敗時，清單保留，另外顯示 role="alert" 的錯誤訊息；
//      完全沒有資料時失敗，只顯示 role="alert" 的錯誤訊息
// 清單是 <ul>，每個商品一個 <li>，內容是品名。
import { useQuery } from '@tanstack/react-query'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'getMenu'>

export function MenuList({ api }: { api: MenuApi }) {
  const { data, error, isError, isFetching } = useQuery({
    queryKey: ['products', 'menu'],
    queryFn: ({ signal }) => api.getMenu({ signal }),
  })

  if (isError) return <p role="alert">{error.message}</p>
  if (isFetching || !data) return <p>載入中…</p>
  return (
    <ul>
      {data.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  )
}
