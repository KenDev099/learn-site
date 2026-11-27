import { Injectable, NotFoundException } from '@nestjs/common'
import type { CreateProductDto } from './create-product.dto.js'
import type { UpdateProductDto } from './update-product.dto.js'

export type Product = { id: number, name: string, price: number }

@Injectable()
export class ProductsService {
  private products: Product[] = [
    { id: 1, name: '美式咖啡', price: 80 },
    { id: 2, name: '拿鐵', price: 110 },
    { id: 3, name: '卡布奇諾', price: 110 },
    { id: 4, name: '伯爵紅茶', price: 90 },
    { id: 5, name: '可頌', price: 70 },
    { id: 6, name: '起司蛋糕', price: 120 },
  ]

  findOne(id: number) {
    const product = this.products.find(p => p.id === id)
    if (!product) throw new NotFoundException(`找不到商品 ${id}`)
    return product
  }

  create(dto: CreateProductDto) {
    const product = { id: Math.max(...this.products.map(p => p.id)) + 1, name: dto.name, price: dto.price }
    this.products.push(product)
    return product
  }

  // 前提：patch 已經被 ValidationPipe 驗證過，只含有傳進來的欄位
  update(id: number, patch: UpdateProductDto) {
    return Object.assign(this.findOne(id), patch)
  }
}
