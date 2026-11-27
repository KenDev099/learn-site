import { Controller, Get, ParseEnumPipe, Query } from '@nestjs/common'
import { Category } from './menu.categories.js'
import { MenuService } from './menu.service.js'

@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  // GET /menu：所有販售中的商品；GET /menu?category=coffee：只看一個分類
  @Get()
  getMenu(@Query('category', new ParseEnumPipe(Category, { optional: true })) category?: Category) {
    return this.menu.getMenu(category)
  }
}
