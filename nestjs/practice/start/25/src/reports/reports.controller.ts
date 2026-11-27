import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { ReportsService } from './reports.service.js'

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('receipts-signatures')
  receiptSignatures(@Query('date') date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new BadRequestException('date 要是 YYYY-MM-DD')
    return this.reports.receiptSignatures(date)
  }
}
