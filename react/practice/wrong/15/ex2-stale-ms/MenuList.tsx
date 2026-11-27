import { useQuery } from '@tanstack/react-query'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'getMenu'>

// 錯在：staleTime 的單位是毫秒，60 只有 0.06 秒
export function MenuList({ api }: { api: MenuApi }) {
  const { data, error, isPending, isError, isFetching } = useQuery({
    queryKey: ['products', 'menu'],
    queryFn: ({ signal }) => api.getMenu({ signal }),
    staleTime: 60,
  })

  // 還沒有任何資料：第一次載入中，或第一次就失敗
  if (isPending) return <p>載入中…</p>
  if (isError && !data) return <p role="alert">{error.message}</p>
  // 有資料：背景重抓中或背景重抓失敗都保留清單
  return (
    <section>
      {isFetching && <p role="status">更新中…</p>}
      {isError && <p role="alert">{error.message}</p>}
      <ul>
        {data.map(p => <li key={p.id}>{p.name}</li>)}
      </ul>
    </section>
  )
}
