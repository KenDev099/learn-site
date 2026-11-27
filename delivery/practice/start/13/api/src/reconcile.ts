// npm run reconcile：執行一次補單（PaymentsService.reconcilePayments），印出結果
// 正式環境由排程每 5 分鐘執行一次；這裡手動執行
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { PaymentsService } from './payments/payments.service.js'

process.loadEnvFile()   // 讀 api/.env（已經設定的環境變數不會被蓋掉）

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
try {
  const result = await app.get(PaymentsService).reconcilePayments()
  console.log(JSON.stringify(result))
} finally {
  await app.close()
}
