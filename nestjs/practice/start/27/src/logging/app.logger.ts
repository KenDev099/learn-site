import { ConsoleLogger, Injectable } from '@nestjs/common'
import { RequestContext } from './request-context.js'

type JsonLogOptions = Parameters<ConsoleLogger['getJsonLogObject']>[1]

// 整個應用程式的 logger：每行一個 JSON 物件（configureApp 用 app.useLogger 換上它）
@Injectable()
export class AppLogger extends ConsoleLogger {
  constructor(private readonly requestContext: RequestContext) {
    super({ json: true })
  }

  // json 模式每一行都經過這裡組成物件：多加一個最上層的 requestId（undefined 的欄位 JSON 不會輸出）
  protected override getJsonLogObject(message: unknown, options: JsonLogOptions) {
    return { ...super.getJsonLogObject(message, options), requestId: this.requestContext.requestId }
  }
}
