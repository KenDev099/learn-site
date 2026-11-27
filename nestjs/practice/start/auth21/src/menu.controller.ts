import { Controller, Get } from '@nestjs/common'
import { Public } from './auth/public.decorator.js'
import { PrismaService } from './prisma.service.js'

@Controller('menu')
export class MenuController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  list() {
    return this.prisma.product.findMany({ orderBy: { id: 'asc' } })
  }
}
