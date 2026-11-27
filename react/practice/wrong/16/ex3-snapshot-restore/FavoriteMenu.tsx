import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PRODUCTS, type ShopApi } from './shop-api.ts'

type Vars = { productId: number; on: boolean }
const favoriteKey = ['favorite']

// 只改一個商品：其他商品（包括別的請求樂觀改上去的）原封不動
function setOne(list: number[], productId: number, on: boolean) {
  if (on) return list.includes(productId) ? list : [...list, productId]
  return list.filter(id => id !== productId)
}

// 錯在：失敗時還原整份快取：同時進行的其他收藏也一起被還原
export function FavoriteMenu({ api }: { api: ShopApi }) {
  const queryClient = useQueryClient()
  const { data: favorites } = useQuery({ queryKey: ['favorites'], queryFn: () => api.getFavorites() })
  const mutation = useMutation({
    mutationKey: favoriteKey,
    mutationFn: ({ productId, on }: Vars) => api.setFavorite(productId, on),
    onMutate: async ({ productId, on }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] })
      const previous = queryClient.getQueryData<number[]>(['favorites'])
      queryClient.setQueryData<number[]>(['favorites'], old => old && setOne(old, productId, on))
      return { previous }
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(['favorites'], context?.previous)
    },
    onSettled: () => {
      // 自己還算在 isMutating 裡：等於 1 代表這是最後一個
      if (queryClient.isMutating({ mutationKey: favoriteKey }) === 1) {
        void queryClient.invalidateQueries({ queryKey: ['favorites'] })
      }
    },
  })

  if (!favorites) return <p>載入中…</p>
  return (
    <ul aria-label="菜單">
      {PRODUCTS.map(p => {
        const on = favorites.includes(p.id)
        return (
          <li key={p.id}>
            <button type="button" aria-pressed={on} onClick={() => mutation.mutate({ productId: p.id, on: !on })}>
              {on ? '♥' : '♡'} 收藏{p.name}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
