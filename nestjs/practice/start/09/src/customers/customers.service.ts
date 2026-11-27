import { Injectable } from '@nestjs/common'

// phone：取餐簡訊要用；internalNote：只給店員看的備註。兩個都是內部資料，留在 service 裡，不能送給客戶端
export type Customer = { id: number, name: string, stamps: number, phone: string, internalNote: string }

@Injectable()
export class CustomersService {
  private customers: Customer[] = [
    { id: 1, name: '王小明', stamps: 7, phone: '0912-345-678', internalNote: '常客，上次反映冰拿鐵太淡' },
    { id: 2, name: '陳美華', stamps: 2, phone: '0922-111-222', internalNote: '' },
    { id: 3, name: '林志豪', stamps: 0, phone: '0933-222-333', internalNote: '曾經惡意退款，退款要店長核准' },
    { id: 4, name: '張雅婷', stamps: 9, phone: '0944-333-444', internalNote: '' },
    { id: 5, name: '李建國', stamps: 4, phone: '0955-444-555', internalNote: '對堅果過敏' },
    { id: 6, name: '黃淑芬', stamps: 1, phone: '0966-555-666', internalNote: '' },
  ]

  find(id: number) {
    return this.customers.find(c => c.id === id)
  }
}
