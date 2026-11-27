import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 1：付款、取消的步驟搬到這裡（應用層）
}
