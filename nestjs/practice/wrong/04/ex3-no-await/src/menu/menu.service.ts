import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common'
import { lifecycleLog } from '../lifecycle-log.js'
import { MenuSource, type Drink } from './menu.source.js'

@Injectable()
export class MenuService implements OnModuleInit, OnApplicationShutdown {
  private items: Drink[] = []

  constructor(private readonly source: MenuSource) {}

  // Nest 會等這個 Promise 完成才繼續初始化，所以第一個請求進來時菜單已經載入
  async onModuleInit() {
    this.items = await this.source.load()
    lifecycleLog.push('MenuService.onModuleInit')
  }

  onApplicationShutdown() {
    void this.source.close()   // 錯：沒有等清理完成
    lifecycleLog.push('MenuService.onApplicationShutdown')
  }

  findAll(): Drink[] {
    return this.items
  }
}
