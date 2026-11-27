import { ConsoleLogger, Injectable } from '@nestjs/common'
import { RequestContext } from './request-context.js'

// 整個應用程式的 logger：每行一個 JSON 物件（configureApp 用 app.useLogger 換上它）
@Injectable()
export class AppLogger extends ConsoleLogger {
  constructor(private readonly requestContext: RequestContext) {
    super({ json: true })
  }

  // 練習 1：每一行 JSON 的最上層都要帶 requestId（請求以外的 log 不帶）
}
