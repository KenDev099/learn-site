import { Module } from '@nestjs/common'
import { StampCardsService } from './stamp-cards.service.js'

@Module({ providers: [StampCardsService], exports: [StampCardsService] })
export class StampCardsModule {}
