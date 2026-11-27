import { Injectable } from '@nestjs/common'

export type Drink = { name: string; price: number }

// 模擬「從外部載入菜單」：真實專案可能是讀檔案、呼叫別的服務。要花一點時間，所以是 async
@Injectable()
export class MenuSource {
  async load(): Promise<Drink[]> {
    await new Promise(resolve => setTimeout(resolve, 50))
    return [
      { name: '美式咖啡', price: 80 },
      { name: '拿鐵', price: 110 },
      { name: '卡布奇諾', price: 110 },
    ]
  }

  // 關機時要釋放的資源（真實專案可能是檔案、連線）
  async close(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
