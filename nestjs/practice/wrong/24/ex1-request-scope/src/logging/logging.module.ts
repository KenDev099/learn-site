import { Global, Module } from '@nestjs/common'
import { AppLogger } from './app.logger.js'
import { RequestContext } from './request-context.js'
import { RequestLogger } from './request.logger.js'

@Global()
@Module({ providers: [RequestContext, AppLogger, RequestLogger], exports: [RequestContext, AppLogger, RequestLogger] })
export class LoggingModule {}
