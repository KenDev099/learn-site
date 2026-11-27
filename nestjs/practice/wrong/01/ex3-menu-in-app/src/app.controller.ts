import { Controller, Get } from '@nestjs/common'
import { AppService } from './app.service.js'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello()
  }

  @Get('menu')
  menu() {
    return [
      { name: '美式咖啡', price: 80 },
      { name: '拿鐵', price: 110 },
      { name: '卡布奇諾', price: 110 },
    ]
  }

  @Get('health')
  health() {
    return { status: 'ok' }
  }
}
