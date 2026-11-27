import { Injectable, Module, type MiddlewareConsumer, type NestMiddleware, type NestModule } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { StoreContext } from './store-context.js'

// 讀 X-Store-Id（沒有就是 1 號店），後面的 guard、pipe、handler、service 都在這個情境裡執行
@Injectable()
export class StoreContextMiddleware implements NestMiddleware {
  constructor(private readonly context: StoreContext) {}

  use(req: Request, _res: Response, next: NextFunction) {
    this.context.run(Number(req.get('x-store-id') ?? 1), next)
  }
}

@Module({
  providers: [StoreContext],
  exports: [StoreContext],
})
export class StoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(StoreContextMiddleware).forRoutes('*')
  }
}
