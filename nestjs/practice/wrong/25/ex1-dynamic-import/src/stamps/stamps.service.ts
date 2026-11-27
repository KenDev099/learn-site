import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'

// 錯誤寫法：改用動態 import 躲過靜態的 import 檢查，StampsService 還是回頭問 OrdersService（循環還在）
@Injectable()
export class StampsService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async count(customer: string) {
    const { OrdersService } = await import('../orders/orders.service.js')
    return this.moduleRef.get(OrdersService, { strict: false }).countFor(customer)
  }
}
