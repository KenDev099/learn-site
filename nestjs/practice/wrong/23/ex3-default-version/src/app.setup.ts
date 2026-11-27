import { VersioningType, type INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

// main.ts 和測試共用的全域設定（第 10 課）：只能設定在 app 上、放不進模組的東西放這裡
export function configureApp(app: INestApplication) {
  // 沒有 defaultVersion：沒寫 @Version 的路由（例如 /orders）維持原本的網址
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })

  const config = new DocumentBuilder()
    .setTitle('咖啡店 API')
    .setVersion('1.0')
    .build()
  // 傳函式：第一次有人打開 /docs 才產生文件
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config))
}
