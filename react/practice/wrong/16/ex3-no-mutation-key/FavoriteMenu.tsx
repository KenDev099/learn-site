import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PRODUCTS, type ShopApi } from './shop-api.ts'

type Vars = { productId: number; on: boolean }
const favoriteKey = ['favorite']

// 只改一個商品：其他商品（包括別的請求樂觀改上去的）原封不動
function setOne(list: number[], productId: number, on: boolean) {
  if (on) return list.includes(productId) ? list : [...list, productId]
  return list.filter(id => id !== productId)
}

// 錯在：useMutation 沒有設 mutationKey：isMutating({ mutationKey }) 數不到它，永遠是 0，不會重抓
export function FavoriteMenu({ api }: { api: ShopApi }) {
  const queryClient = useQueryClient()
  const { data: favorites } = useQuery({ queryKey: ['favorites'], queryFn: () => api.getFavorites() })
  const mutation = useMutation({
    mutationFn: ({ productId, on }: Vars) => api.setFavorite(productId, on),
    onMutate: async ({ productId, on }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] })
      queryClient.setQueryData<number[]>(['favorites'], old => old && setOne(old, productId, on))
    },
    onError: (_error, { productId, on }) => {
      queryClient.setQueryData<number[]>(['favorites'], old => old && setOne(old, productId, !on))
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
