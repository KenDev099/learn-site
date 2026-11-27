import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ShopApi } from './shop-api.ts'

type Props = { api: ShopApi; productId: number; name: string }

// 錯在：沒有樂觀更新：等伺服器回應、重抓完才變色
export function FavoriteButton({ api, productId, name }: Props) {
  const queryClient = useQueryClient()
  const { data: favorites } = useQuery({ queryKey: ['favorites'], queryFn: () => api.getFavorites() })
  const mutation = useMutation({
    mutationFn: (on: boolean) => api.setFavorite(productId, on),
    onMutate: async on => {
      const previous = undefined

      return { previous }                                            // 傳給 onError、onSettled
    },
    onError: (_error, _on, context) => {
      queryClient.setQueryData(['favorites'], context?.previous)
    },
    // 不回傳 Promise：畫面已經先更新了，不需要等重抓完才結束（回傳的話，錯誤要等重抓完才顯示）
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })

  if (!favorites) return <button type="button" disabled>載入中…</button>
  const on = favorites.includes(productId)
  return (
    <>
      <button type="button" aria-pressed={on} onClick={() => mutation.mutate(!on)}>
        {on ? '♥' : '♡'} 收藏{name}
      </button>
      {mutation.isError && <p role="alert">收藏失敗，請再試一次</p>}
    </>
  )
}
