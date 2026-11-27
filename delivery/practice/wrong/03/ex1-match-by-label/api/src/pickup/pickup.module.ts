import { Controller, Get, Injectable, Module } from '@nestjs/common'
import { Clock } from '../common/clock.js'
import { PrismaService } from '../common/prisma.service.js'
import { SLOT_CAPACITY, slotLabel, todaySlots } from './pickup-slots.js'

@Injectable()
export class PickupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  // 練習 1：今天還能選的時段 [{ start, label, remaining }]
  // start：時段開始時間（Date，回應裡會變成 ISO 字串）；label：台北時間 HH:mm；remaining：還能接幾單（額滿是 0，也要列出來）
  async availableSlots() {
    const slots = todaySlots(this.clock.now())
    if (!slots.length) return []
    // 一次查出這些時段已經接了幾單；還沒有人選過的時段沒有那一列，算 0
    const rows = await this.prisma.pickupSlot.findMany({ orderBy: { slotStart: 'desc' } })
    const taken = new Map(rows.map(r => [slotLabel(r.slotStart), r.orders]))
    return slots.map(start => ({
      start,
      label: slotLabel(start),
      remaining: Math.max(0, SLOT_CAPACITY - (taken.get(slotLabel(start)) ?? 0)),
    }))
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
