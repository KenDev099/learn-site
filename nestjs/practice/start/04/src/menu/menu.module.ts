import { Module } from '@nestjs/common'
import { MenuController } from './menu.controller.js'
import { MenuService } from './menu.service.js'
import { MenuSource } from './menu.source.js'

@Module({
  controllers: [MenuController],
  providers: [MenuService, MenuSource],
})
export class MenuModule {}
