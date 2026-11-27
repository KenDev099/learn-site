import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ShopApi } from './shop-api.ts'

type Props = { api: ShopApi; productId: number; name: string }

// 錯在：onSettled 回傳 Promise：mutation 要等重抓完才算失敗，錯誤訊息晚出現
export function FavoriteButton({ api, productId, name }: Props) {
  const queryClient = useQueryClient()
  const { data: favorites } = useQuery({ queryKey: ['favorites'], queryFn: () => api.getFavorites() })
  const mutation = useMutation({
    mutationFn: (on: boolean) => api.setFavorite(productId, on),
    onMutate: async on => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] })   // 進行中的舊重抓不能蓋掉樂觀的值
      const previous = queryClient.getQueryData<number[]>(['favorites'])
      queryClient.setQueryData<number[]>(['favorites'], old =>
        old && (on ? [...old, productId] : old.filter(id => id !== productId)))
      return { previous }                                            // 傳給 onError、onSettled
    },
    onError: (_error, _on, context) => {
      queryClient.setQueryData(['favorites'], context?.previous)
    },
    // 不回傳 Promise：畫面已經先更新了，不需要等重抓完才結束（回傳的話，錯誤要等重抓完才顯示）
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
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
