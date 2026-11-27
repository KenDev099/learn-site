import type { INestApplication } from '@nestjs/common'

// 練習 1：只能設定在 app 上、放不進模組的全域設定都放在這裡，main.ts 和 e2e 測試都呼叫它
//   全域前綴 'api'；CORS 只允許前端 http://localhost:5173
export function configureApp(app: INestApplication) {
}
