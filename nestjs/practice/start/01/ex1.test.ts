// 練習 1：用正式的方式編譯、啟動（nest build → node dist/main.js），不是只跑 Vitest
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { build, start } from '../../helpers/server.ts'
import { AppModule } from './src/app.module.js'
import { AppService } from './src/app.service.js'

const dir = import.meta.dirname

describe('練習 1：讓專案能 build 並啟動', () => {
  it('npm run build 成功，node dist/main.js 啟動後 GET / 回 Hello World!', async () => {
    build(dir)
    const server = await start(dir)
    try {
      const res = await fetch(`${server.url}/`)
      expect(res.status, 'GET / 要回 200').toBe(200)
      expect(await res.text(), 'GET / 要回 Hello World!').toBe('Hello World!')
    } finally {
      await server.stop()
    }
  }, 90_000)

  it('GET / 的字串來自注入的 AppService', async () => {
    const app = await createTestApp(AppModule, { override: b => b.overrideProvider(AppService).useValue({ getHello: () => '測試用字串' }) })
    try {
      const res = await request(app.getHttpServer()).get('/')
      expect(res.text, '測試把 AppService 換成假的，GET / 就要回假的字串：只修 import 的副檔名，保留 AppController 注入 AppService、呼叫 getHello()').toBe('測試用字串')
    } finally {
      await app.close()
    }
  })
})
