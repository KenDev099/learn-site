import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export type ProductApi = Pick<FakeMenuApi, 'getProduct'>

// 錯在：每張卡片自己 new QueryClient，各有各的快取，同一個商品送兩次請求
export function ProductCard(props: { api: ProductApi; id: number }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return <QueryClientProvider client={client}><Card {...props} /></QueryClientProvider>
}

function Card({ api, id }: { api: ProductApi; id: number }) {
  const { data, error, isPending, isError, refetch } = useQuery({
    queryKey: ['products', 'detail', id],
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
