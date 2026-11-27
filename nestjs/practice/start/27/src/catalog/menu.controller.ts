import { Controller, Get } from '@nestjs/common'
import { MenuService } from './menu.service.js'

@Controller({ path: 'menu', version: '1' })
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  get() {
    return this.menu.getMenu()
  }
}
