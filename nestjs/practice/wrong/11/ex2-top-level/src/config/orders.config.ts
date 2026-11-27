import { registerAs } from '@nestjs/config'

const maxItems = Number(process.env.ORDER_MAX_ITEMS ?? 20)   // 這一行在 import 時就執行，比 ConfigModule 載入 .env 還早

export const ordersConfig = registerAs('orders', () => ({ maxItems }))
