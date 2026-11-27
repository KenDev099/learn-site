import { Exclude } from 'class-transformer'

// @Exclude 只對 class 實例有效；service 回傳的是一般物件，這個 class 根本沒被用到
export class CustomerEntity {
  id: number
  name: string
  stamps: number
  @Exclude() phone: string
  @Exclude() internalNote: string
}
