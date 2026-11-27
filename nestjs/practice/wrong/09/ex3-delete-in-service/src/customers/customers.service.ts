import { Injectable } from '@nestjs/common'

// phone：取餐簡訊要用；internalNote：只給店員看的備註。兩個都是內部資料，留在 service 裡，不能送給客戶端
export type Customer = { id: number, name: string, stamps: number, phone?: string, internalNote?: string }

@Injectable()
export class CustomersService {
  private customers: Customer[] = [
    { id: 1, name: '王小明', stamps: 7 },
    { id: 2, name: '陳美華', stamps: 2 },
    { id: 3, name: '林志豪', stamps: 0 },
    { id: 4, name: '張雅婷', stamps: 9 },
    { id: 5, name: '李建國', stamps: 4 },
    { id: 6, name: '黃淑芬', stamps: 1 },
  ]

  find(id: number) {
    return this.customers.find(c => c.id === id)
  }
}
