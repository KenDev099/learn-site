import { Controller, Get } from '@nestjs/common'

@Controller('menu')
export class MenuController {
  @Get()
  findAll() {
    return [
      { name: '美式咖啡', price: 80 },
      { name: '拿鐵', price: 110 },
      { name: '卡布奇諾', price: 110 },
    ]
  }
}
