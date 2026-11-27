import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service.js'

// 基礎設施模組：@Global 讓每個功能模組都能注入 PrismaService，不用各自 import
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
