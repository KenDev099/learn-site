import { Injectable, NotFoundException } from '@nestjs/common'
import { ProductsRepository, type Product } from './products.repository.js'

@Injectable()
export class ProductsService {
  constructor(private readonly repo: ProductsRepository) {}

  findAll(): Product[] {
    return this.repo.findAll()
  }

  findOne(id: number): Product {
    const product = this.repo.findById(id)
    if (!product) throw new NotFoundException(`找不到商品 ${id}`)
    return product
  }

  create(data: { name: string; price: number }): Product {
    return this.repo.insert(data)
  }
}
