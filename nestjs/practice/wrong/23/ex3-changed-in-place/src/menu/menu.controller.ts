import { Controller, Get, Header, Version, VERSION_NEUTRAL } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ProductsService, type Category } from '../products/products.service.js'

type MenuItem = { id: number, name: string, price: number }

@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly products: ProductsService) {}

  // 舊版：形狀一個字都不改，只加上淘汰的標頭（RFC 9745 的 Deprecation、RFC 8594 的 Sunset）
  // VERSION_NEUTRAL：還沒改網址的客戶端繼續打 /menu；拿掉它等於刪掉一個端點
  @Get()
  @Version([VERSION_NEUTRAL, '1'])
  @ApiOperation({ deprecated: true, summary: '請改用 GET /v2/menu，2027-07-01 停用' })
  @Header('Deprecation', '@1798761600')
  @Header('Sunset', 'Thu, 01 Jul 2027 00:00:00 GMT')
  listV1() {
    return this.listV2()
  }

  // 新版：依分類分組
  @Get()
  @Version('2')
  listV2() {
    const groups = new Map<Category, MenuItem[]>()
    for (const { id, name, price, category } of this.products.list()) {
      const items = groups.get(category) ?? []
      items.push({ id, name, price })
      groups.set(category, items)
    }
    return [...groups].map(([category, items]) => ({ category, items }))
  }
}
