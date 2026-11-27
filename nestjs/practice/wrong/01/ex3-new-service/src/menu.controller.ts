import { Controller, Get } from '@nestjs/common'
import { MenuService } from './menu.service.js'

@Controller('menu')
export class MenuController {
  private readonly menuService = new MenuService()

  @Get()
  findAll() {
    return this.menuService.findAll()
  }
}
