import { useQuery } from '@tanstack/react-query'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export type ProductApi = Pick<FakeMenuApi, 'getProduct'>

// 錯在：沒有把 queryFn 收到的 signal 傳給 api，換商品時舊請求取消不了
export function ProductCard({ api, id }: { api: ProductApi; id: number }) {
  const { data, error, isPending, isError, refetch } = useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: () => api.getProduct(id),
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
