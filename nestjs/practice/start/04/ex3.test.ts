// 練習 3：lifecycle hooks：onModuleInit 載入菜單、onApplicationShutdown 記錄關機原因，並觀察執行順序
import { describe, expect, it, vi } from 'vitest'
import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from './src/app.module.js'
import { MenuSource } from './src/menu/menu.source.js'
import { lifecycleLog } from './src/lifecycle-log.js'

const drinks = [{ name: '測試拿鐵', price: 1 }]
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 假的 MenuSource：load() 要等測試放行才完成；close() 要 100ms 才完成
function fakeSource() {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const state = { closed: false }
  const source = {
    load: async () => { await gate; return drinks },
    close: async () => { await sleep(100); state.closed = true },
  }
  return { source, release, state }
}

async function boot() {
  const fake = fakeSource()
  const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MenuSource).useValue(fake.source).compile()
  const app = ref.createNestApplication({ logger: false })
  return { app, ...fake }
}

describe('練習 3：lifecycle hooks', () => {
  it('app.init() 會等菜單載入完，第一個請求就拿得到菜單', async () => {
    const { app, release } = await boot()
    try {
      let done = false
      const init = app.init().then(() => { done = true })
      await sleep(200)
      expect(done, 'MenuSource.load() 還沒完成，app.init() 就結束了：在 MenuService 寫 async onModuleInit()，await this.source.load()（不要在建構子裡啟動而不等它）').toBe(false)
      release()
      await init
      const res = await request(app.getHttpServer()).get('/menu')
      expect(res.body, 'GET /menu 要回 onModuleInit 載入的菜單').toEqual(drinks)
    } finally {
      release()
      await app.close()
    }
  })

  it('app.close(\'SIGINT\') 時 AppModule 用 Logger 記錄收到的 signal，並等 MenuSource.close() 完成', async () => {
    lifecycleLog.length = 0
    const { app, release, state } = await boot()
    release()
    await app.init()
    const spy = vi.spyOn(Logger.prototype, 'log')
    try {
      await app.close('SIGINT')
      const logged = spy.mock.calls.map(c => String(c[0]))
      expect(logged.some(m => m.includes('SIGINT')), 'AppModule 的 onApplicationShutdown(signal) 要用 new Logger(\'AppModule\').log(…) 記下參數 signal 的值（這次是 SIGINT，不要寫死 SIGTERM）').toBe(true)
      expect(lifecycleLog, 'push 的字串要用參數 signal 組出來：`AppModule.onApplicationShutdown:${signal}`').toContain('AppModule.onApplicationShutdown:SIGINT')
      expect(state.closed, 'app.close() 結束時 MenuSource.close() 還沒完成：MenuService 的 onApplicationShutdown 要寫成 async 並 await this.source.close()').toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('hook 的順序：深層模組先初始化、根模組最後；關機時反過來', async () => {
    lifecycleLog.length = 0
    const { app, release } = await boot()
    release()
    await app.init()
    await app.close('SIGTERM')
    expect(lifecycleLog, '照題目的字串在各個 hook 裡 push；順序由 Nest 決定，不是你呼叫的順序').toEqual([
      'MenuService.onModuleInit',
      'AppModule.onModuleInit',
      'AppModule.onApplicationShutdown:SIGTERM',
      'MenuService.onApplicationShutdown',
    ])
  })
})
