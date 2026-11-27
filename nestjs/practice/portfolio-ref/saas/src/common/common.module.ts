import { Global, Module } from '@nestjs/common'
import { AppLogger } from './app.logger.js'
import { RequestContext } from './request-context.js'

@Global()
@Module({ providers: [RequestContext, AppLogger], exports: [RequestContext, AppLogger] })
export class CommonModule {}
