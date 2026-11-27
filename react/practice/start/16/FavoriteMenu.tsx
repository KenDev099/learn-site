/*
練習 3：菜單上連續收藏好幾個商品：同時進行的樂觀更新
畫面：整份菜單，每個商品一個收藏按鈕，共用一個 useMutation。
下面是練習 2 的寫法（官方文件的範例也是這樣）：改之前存整份快取，失敗時整份還原；每次結束都重抓。
只按一個沒問題，客人連續按兩個就出事：
  - 先按拿鐵、再按可頌（兩個都還沒回應），拿鐵失敗了：還原「按拿鐵之前的整份快取」，可頌的收藏也一起不見了
  - 拿鐵成功、可頌還在等：拿鐵結束就重抓，伺服器那時還沒有可頌，可頌的愛心閃掉，等可頌成功又亮回來
要求：
  1. 失敗時只改回「這一次」改的那個商品（用 onError 收到的 variables），不要整份還原
  2. 給這個 mutation 一個 mutationKey（例如 ['favorite']）；onSettled 裡用 queryClient.isMutating({ mutationKey })
     算還有幾個收藏請求在進行（onSettled 執行時，自己還算在裡面）：只有最後一個結束時才讓 ['favorites'] 失效、重抓
  3. 保留練習 2 已經做對的事：按下去立刻改快取、改之前 cancelQueries、不就地修改陣列、最後一個結束時一定重抓
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PRODUCTS, type ShopApi } from './shop-api.ts'

type Vars = { productId: number; on: boolean }

export function FavoriteMenu({ api }: { api: ShopApi }) {
  const queryClient = useQueryClient()
  const { data: favorites } = useQuery({ queryKey: ['favorites'], queryFn: () => api.getFavorites() })
  const mutation = useMutation({
    mutationFn: ({ productId, on }: Vars) => api.setFavorite(productId, on),
    onMutate: async ({ productId, on }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] })
      const previous = queryClient.getQueryData<number[]>(['favorites'])
      queryClient.setQueryData<number[]>(['favorites'], old =>
        old && (on ? [...old, productId] : old.filter(id => id !== productId)))
      return { previous }
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(['favorites'], context?.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] })
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
