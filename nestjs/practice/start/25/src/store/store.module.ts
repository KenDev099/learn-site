import { Module } from '@nestjs/common'
import { StoreContext } from './store-context.js'

@Module({
  providers: [StoreContext],
  exports: [StoreContext],
})
export class StoreModule {}
