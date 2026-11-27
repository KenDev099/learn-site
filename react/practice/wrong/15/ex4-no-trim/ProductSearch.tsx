import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export type SearchApi = Pick<FakeMenuApi, 'search'>

// 錯在：沒有去掉前後空白，'  茶 ' 和 '茶' 變成兩次搜尋
export function ProductSearch({ api, keyword }: { api: SearchApi; keyword: string }) {
  const q = keyword
  const { data, error, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: ['products', 'list', q],
    queryFn: ({ signal }) => api.search(q, { signal }),
    enabled: q.trim() !== '',
    placeholderData: keepPreviousData,
  })

  if (q.trim() === '') return <p>輸入關鍵字開始搜尋</p>
  if (isPending) return <p>搜尋中…</p>
  if (isError) return <p role="alert">{error.message}</p>
  return (
    <section>
      {isPlaceholderData && <p role="status">更新中…</p>}
      {data.length === 0
        ? <p>沒有符合的商品</p>
        : <ul>{data.map(p => <li key={p.id}>{p.name}</li>)}</ul>}
    </section>
  )
}
