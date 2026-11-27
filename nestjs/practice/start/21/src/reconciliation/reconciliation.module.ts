import { Module } from '@nestjs/common'
import { ReconciliationService } from './reconciliation.service.js'

@Module({ providers: [ReconciliationService] })
export class ReconciliationModule {}
