import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ShopApi } from './shop-api.ts'

type Props = { api: ShopApi; productId: number; name: string }

// 錯在：失敗時沒有把快取改回去，畫面停在錯的狀態
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
    onError: () => {},
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
