import { Module } from '@nestjs/common'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { MenuService } from './menu.service'
import { MenuController } from './menu.controller.js'

@Module({
  imports: [],
  controllers: [AppController, MenuController],
  providers: [AppService, MenuService],
})
export class AppModule {}
