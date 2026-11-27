import { Module } from '@nestjs/common'
import { StatsListener } from './stats.listener.js'

@Module({ providers: [StatsListener] })
export class StatsModule {}
