import { Injectable } from '@nestjs/common'

export type Product = { id: number; name: string; price: number; stock: number }

@Injectable()
export class ProductsService {
  private readonly products: Product[] = [
    { id: 1, name: '美式咖啡', price: 80, stock: 20 },
    { id: 2, name: '拿鐵', price: 110, stock: 3 },
    { id: 5, name: '可頌', price: 70, stock: 0 },
  ]

  async findOne(id: number): Promise<Product | undefined> {
    return this.products.find(p => p.id === id)
  }
}
