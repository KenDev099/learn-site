import { Controller, Get } from '@nestjs/common'
import { MenuService } from './menu.service.js'

@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  findAll() {
    return this.menu.findAll()
  }
}
