import { Controller, Get } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'

// 門口的電子看板每 2 秒來拿一次菜單
@SkipThrottle()
@Controller('menu')
export class MenuController {
  @Get()
  findAll() {
    return [
      { name: '美式咖啡', price: 80 },
      { name: '拿鐵', price: 110 },
      { name: '卡布奇諾', price: 110 },
      { name: '伯爵紅茶', price: 90 },
      { name: '可頌', price: 70 },
      { name: '起司蛋糕', price: 120 },
    ]
  }
}
