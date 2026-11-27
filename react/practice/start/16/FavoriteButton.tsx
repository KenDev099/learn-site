/*
練習 2：收藏按鈕的樂觀更新：onMutate、onError、onSettled
畫面：收藏清單是 useQuery(['favorites'])，資料是已收藏的商品 id 陣列，例如 [2, 5]。
問題：現在按下去要等伺服器回應、重抓完才變色，網路慢時客人以為沒按到又按一次；失敗時什麼都沒顯示。
要求：
  1. 按下去立刻反轉 aria-pressed（不等伺服器）：在 onMutate 裡用 queryClient.setQueryData 改 ['favorites'] 的快取
     快取裡的陣列是凍結的，要建立新陣列（[...old, id]、old.filter(…)），不能 push 或 splice
  2. 改快取之前先 await queryClient.cancelQueries({ queryKey: ['favorites'] })：
     正在進行中的重抓（拿的是舊資料）晚一點回來時，不能蓋掉你剛寫進去的值
  3. 改之前把原本的快取存起來，從 onMutate 回傳；失敗時（onError）用它把快取改回去，
     並顯示 <p role="alert">收藏失敗，請再試一次</p>
  4. 不管成功或失敗（onSettled）都讓 ['favorites'] 失效、重抓一次，跟伺服器對齊
  5. api.setFavorite(productId, on) 的 on 是按下去之後要變成的狀態（true 收藏、false 取消）
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ShopApi } from './shop-api.ts'

type Props = { api: ShopApi; productId: number; name: string }

export function FavoriteButton({ api, productId, name }: Props) {
  const queryClient = useQueryClient()
  const { data: favorites } = useQuery({ queryKey: ['favorites'], queryFn: () => api.getFavorites() })
  const mutation = useMutation({
    mutationFn: (on: boolean) => api.setFavorite(productId, on),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  })

  if (!favorites) return <button type="button" disabled>載入中…</button>
  const on = favorites.includes(productId)
  return (
    <>
      <button type="button" aria-pressed={on} onClick={() => mutation.mutate(!on)}>
        {on ? '♥' : '♡'} 收藏{name}
      </button>
    </>
  )
}
