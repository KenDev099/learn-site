// 練習 3：useFavorite
// 問題：商品卡片上的「收藏」愛心，要等 API 回來才變色，網路慢的時候客人以為沒按到，又多按幾下。
// 要求：useFavorite(productId, initial, api) 回傳 { isFavorite, error, toggle }
//   1. 樂觀更新：toggle() 一呼叫，isFavorite 立刻反轉，同時送出 api.setFavorite(productId, 新的值)；error 設回 null
//   2. 失敗回滾：請求失敗時，isFavorite 回到「伺服器最後一次確認過的值」（一開始是 initial，每次請求成功就更新），error 存 Error
//   3. 連點：以最後一次點擊為準。比較早送出的請求失敗時，如果之後還有新的點擊，不能回滾、也不能設定 error
import { ref, shallowRef } from 'vue'

export type FavoriteApi = { setFavorite(productId: number, value: boolean): Promise<void> }

export function useFavorite(productId: number, initial: boolean, api: FavoriteApi) {
  const isFavorite = ref(initial)
  const error = shallowRef<Error | null>(null)

  async function toggle() {
    const next = !isFavorite.value
    try {
      await api.setFavorite(productId, next)
      isFavorite.value = next
    } catch (e) {
      error.value = e as Error
    }
  }

  return { isFavorite, error, toggle }
}
