// 正式環境用的 API 用戶端：真的會連到後端。這個檔案不用改
// 測試裡沒有後端，所以只要有人呼叫它就失敗
import type { Product } from '../../helpers/fake-api.ts'

export type MenuApi = {
  getMenu(opts?: { signal?: AbortSignal }): Promise<Product[]>
}

export const realClient: MenuApi = {
  async getMenu() {
    throw new Error('測試裡不能連真的後端：元件要用 useApi() 拿到 ApiProvider 提供的 api')
  },
}
