import { Controller, Get, Injectable, Module } from '@nestjs/common'
import { Clock } from '../common/clock.js'
import { PrismaService } from '../common/prisma.service.js'

@Injectable()
export class PickupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  // 練習 1：今天還能選的時段 [{ start, label, remaining }]
  // start：時段開始時間（Date，回應裡會變成 ISO 字串）；label：台北時間 HH:mm；remaining：還能接幾單（額滿是 0，也要列出來）
  async availableSlots() {
    // TODO
    return []
  }
}

@Controller('pickup-slots')
export class PickupController {
  constructor(private readonly pickup: PickupService) {}

  @Get()
  list() {
    return this.pickup.availableSlots()
  }
}

@Module({ controllers: [PickupController], providers: [PickupService] })
export class PickupModule {}
