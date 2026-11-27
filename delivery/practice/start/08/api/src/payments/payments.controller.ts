import { Body, Controller, HttpCode, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { z } from 'zod'
import { PaymentsService } from './payments.service.js'
import { WebhookSignatureGuard } from './webhook-signature.guard.js'

const PayRequest = z.object({ cardToken: z.string().min(1) })   // 前台用 CafePay 的表單換到的卡片代碼
type PayRequest = z.infer<typeof PayRequest>

// CafePay 送來的通知。id 是事件編號：同一個事件重送時 id 不變
export const CafePayEvent = z.object({
  id: z.string().min(1),
  type: z.enum(['payment.succeeded', 'payment.failed']),
  created: z.int(),   // 事件產生的時間（Unix 秒數）
  data: z.object({ paymentId: z.string(), orderId: z.int(), amount: z.int() }),
})
export type CafePayEvent = z.infer<typeof CafePayEvent>

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // 付款：200 { status: 'paid' }；202 { status: 'unknown' }＝還不知道結果，畫面顯示「付款確認中」；卡片被拒絕 402
  @Post('orders/:id/pay')
  @HttpCode(200)
  async pay(@Param('id', ParseIntPipe) id: number, @Body({ schema: PayRequest }) body: PayRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.payments.pay(id, body.cardToken)
    if (result.status === 'unknown') res.status(202)
    return result
  }

  // CafePay 的 webhook：簽章不對 401；處理完回 200（回 2xx 以外的狀態碼，CafePay 會過一陣子重送）
  @Post('webhooks/cafepay')
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  async webhook(@Body({ schema: CafePayEvent }) event: CafePayEvent) {
    await this.payments.handleEvent(event)
    return { received: true }
  }
}
