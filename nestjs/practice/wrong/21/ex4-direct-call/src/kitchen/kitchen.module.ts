import { Module } from '@nestjs/common'
import { KitchenListener } from './kitchen.listener.js'

@Module({ providers: [KitchenListener], exports: [KitchenListener] })
export class KitchenModule {}
