import { Module } from '@nestjs/common'
import { PrismaService } from './prisma.service.js'

// 練習 3：讓其他模組可以注入 PrismaService
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
