import type { QueryClient } from '@tanstack/react-query'

// 由大到小：['products'] → ['products', 'list'] → ['products', 'list', keyword]
// 錯在：removeQueries 只是把快取刪掉，畫面上的 query 不會重抓
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (keyword: string) => [...productKeys.lists(), keyword] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: number) => [...productKeys.details(), id] as const,
}

export function onPriceChanged(queryClient: QueryClient, productId: number): Promise<unknown> {
  // invalidateQueries 預設只重抓畫面上正在用的（refetchType: 'active'），其他的標成過期，下次使用時重抓
  queryClient.removeQueries({ queryKey: productKeys.lists() })
  queryClient.removeQueries({ queryKey: productKeys.detail(productId) })
  return Promise.resolve()
}
