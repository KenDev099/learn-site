import { Global, Module } from '@nestjs/common'
import { AppLogger } from './app.logger.js'
import { RequestContext } from './request-context.js'

// 全域模組：每個模組都能注入 RequestContext，不用一個一個 import
@Global()
@Module({ providers: [RequestContext, AppLogger], exports: [RequestContext, AppLogger] })
export class LoggingModule {}
