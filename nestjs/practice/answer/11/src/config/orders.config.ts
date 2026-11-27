import { registerAs } from '@nestjs/config'

// 工廠在 ConfigModule 驗證並載入 .env 之後才執行，所以這裡讀 process.env 拿得到值與預設值
export const ordersConfig = registerAs('orders', () => ({
  maxItems: Number(process.env.ORDER_MAX_ITEMS),
}))
