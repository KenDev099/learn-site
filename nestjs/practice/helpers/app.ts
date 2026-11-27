// 從學習者的 AppModule 建一個測試用的 Nest 應用（不 listen；supertest 用 app.getHttpServer()）
//   const app = await createTestApp(AppModule, { override: b => b.overrideProvider(X).useValue(fake) })
//   afterAll(() => app.close())   // 一定要關：Prisma 連線池、BullMQ worker 沒關，Vitest 會停不下來
import { Test, type TestingModuleBuilder } from '@nestjs/testing'
import type { INestApplication, NestApplicationOptions, Type } from '@nestjs/common'

export async function createTestApp(module: Type, {
  override = b => b,           // overrideProvider／overrideGuard…：證明學習者真的用注入，而不是自己 new
  configure,                   // 第 10 課起傳學習者的 configureApp，跟 main.ts 套用一樣的全域設定
  options = { logger: false }, // createNestApplication 的選項，例如 { rawBody: true }
}: {
  override?: (b: TestingModuleBuilder) => TestingModuleBuilder
  configure?: (app: INestApplication) => unknown
  options?: NestApplicationOptions
} = {}): Promise<INestApplication> {
  const ref = await override(Test.createTestingModule({ imports: [module] })).compile()
  const app = ref.createNestApplication(options)
  await configure?.(app)
  await app.init()
  return app
}
