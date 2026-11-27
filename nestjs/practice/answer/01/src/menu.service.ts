import { Injectable } from '@nestjs/common'

export type Drink = { name: string; price: number }

@Injectable()
export class MenuService {
  private readonly drinks: Drink[] = [
    { name: '美式咖啡', price: 80 },
    { name: '拿鐵', price: 110 },
    { name: '卡布奇諾', price: 110 },
  ]

  findAll(): Drink[] {
    return this.drinks
  }
}
