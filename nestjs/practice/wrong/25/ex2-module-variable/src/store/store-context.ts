import { Injectable } from '@nestjs/common'

// 錯誤寫法：所有請求共用同一個變數，後到的請求會蓋掉前面的
let current = 1

@Injectable()
export class StoreContext {
  run<T>(storeId: number, fn: () => T): T {
    current = storeId
    return fn()
  }

  get storeId(): number {
    return current
  }
}
