import { useQuery } from '@tanstack/react-query'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export type ProductApi = Pick<FakeMenuApi, 'getProduct'>

// 錯在：用「沒有 data」判斷載入中，失敗時永遠停在「載入中…」
export function ProductCard({ api, id }: { api: ProductApi; id: number }) {
  const { data, error, isPending, isError, refetch } = useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: ({ signal }) => api.getProduct(id, { signal }),
  })

  if (!data) return <p>載入中…</p>
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
