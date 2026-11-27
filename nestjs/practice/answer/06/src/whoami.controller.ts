import { Controller, Get } from '@nestjs/common'
import { RequestId } from './request-id.decorator.js'

// 客服查問題時，請顧客回報這個編號，再到 log 裡找同一個編號
@Controller('whoami')
export class WhoamiController {
  @Get()
  whoami(@RequestId() requestId: string) {
    return { requestId }
  }
}
