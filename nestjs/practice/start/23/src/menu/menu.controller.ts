import { Controller, Get } from '@nestjs/common'
import { ProductsService } from '../products/products.service.js'

// 練習 3：Vue 前台和 iOS App 都在用 GET /menu。新版前台想要「依分類分組」的形狀
@Controller('menu')
export class MenuController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list() {
    return this.products.list().map(({ id, name, price, category }) => ({ id, name, price, category }))
  }
}
