import { Global, Module } from '@nestjs/common'
import { CLOCK, systemClock } from './clock.js'
import { Mailer } from './mailer.js'
import { PrismaService } from './prisma.service.js'

@Global()
@Module({
  providers: [PrismaService, Mailer, { provide: CLOCK, useValue: systemClock }],
  exports: [PrismaService, Mailer, CLOCK],
})
export class CommonModule {}
