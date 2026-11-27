import { Injectable } from '@nestjs/common'
import type { Response } from 'express'
import type { CreateProductInput, Product, UpdateProductInput } from './product.js'

@Injectable()
export class ProductsService {
  private products: Product[] = [
    { id: 1, name: '美式咖啡', price: 80, category: 'coffee' },
    { id: 2, name: '拿鐵', price: 110, category: 'coffee' },
    { id: 3, name: '卡布奇諾', price: 110, category: 'coffee' },
    { id: 4, name: '伯爵紅茶', price: 90, category: 'tea' },
    { id: 5, name: '可頌', price: 70, category: 'food' },
    { id: 6, name: '起司蛋糕', price: 120, category: 'food' },
  ]
  private nextId = 7

  findAll(category?: string): Product[] {
    return category ? this.products.filter(p => p.category === category) : this.products
  }

  findOne(id: number, res?: Response): Product {
    const product = this.products.find(p => p.id === id)
    if (!product) res!.status(404).json({ message: `找不到商品 ${id}` })
    return product!
  }

  create(input: CreateProductInput): Product {
    const product = { id: this.nextId++, ...input }
    this.products.push(product)
    return product
  }

  update(id: number, input: UpdateProductInput): Product {
    return Object.assign(this.findOne(id), input)
  }

  remove(id: number): void {
    this.findOne(id)
    this.products = this.products.filter(p => p.id !== id)
  }
}
