import { Controller, Get, Query } from '@nestjs/common'
import { DailySalesQuery } from './daily-sales.query.js'
import { ReportsService } from './reports.service.js'

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // GET /reports/daily-sales?from=2026-10-01&to=2026-10-07
  @Get('daily-sales')
  dailySales(@Query() query: DailySalesQuery) {
    return this.reports.dailySales(query.from, query.to)
  }
}
