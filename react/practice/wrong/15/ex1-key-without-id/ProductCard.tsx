import { useQuery } from '@tanstack/react-query'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export type ProductApi = Pick<FakeMenuApi, 'getProduct'>

// 錯在：queryKey 沒有包含 id，換商品時 TanStack Query 以為是同一份資料
export function ProductCard({ api, id }: { api: ProductApi; id: number }) {
  const { data, error, isPending, isError, refetch } = useQuery({
    queryKey: ['products', 'detail'],
    queryFn: ({ signal }) => api.getProduct(id, { signal }),
  })

  if (isPending) return <p>載入中…</p>
  if (isError) {
    return (
      <div role="alert">
        <p>{error.message}</p>
        <button type="button" onClick={() => refetch()}>重試</button>
      </div>
    )
  }
  return <p>{data.name} ${data.price}</p>
}
