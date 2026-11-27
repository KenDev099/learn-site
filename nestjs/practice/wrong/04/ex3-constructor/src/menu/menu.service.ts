import { Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { lifecycleLog } from '../lifecycle-log.js'
import { MenuSource, type Drink } from './menu.source.js'

// 錯：在建構子裡啟動非同步載入，Nest 不會等它
@Injectable()
export class MenuService implements OnApplicationShutdown {
  private items: Drink[] = []

  constructor(private readonly source: MenuSource) {
    void this.source.load().then(items => { this.items = items; lifecycleLog.push('MenuService.onModuleInit') })
  }

  async onApplicationShutdown() {
    await this.source.close()
    lifecycleLog.push('MenuService.onApplicationShutdown')
  }

  findAll(): Drink[] {
    return this.items
  }
}
