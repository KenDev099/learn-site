import { useQuery } from '@tanstack/react-query'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export type ProductApi = Pick<FakeMenuApi, 'getProduct'>

// 錯在：用 isFetching 判斷載入中：換回看過的商品、背景重抓時，快取裡的資料被「載入中…」蓋掉
export function ProductCard({ api, id }: { api: ProductApi; id: number }) {
  const { data, error, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: ({ signal }) => api.getProduct(id, { signal }),
  })

  if (isPending || isFetching) return <p>載入中…</p>
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
