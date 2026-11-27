import { Controller, Get } from '@nestjs/common'

// 客服查問題時，請顧客回報這個編號，再到 log 裡找同一個編號
@Controller('whoami')
export class WhoamiController {
  // 練習 1：用你寫的 @RequestId() 拿到 middleware 決定的編號
  @Get()
  whoami() {
    return { requestId: null }
  }
}
