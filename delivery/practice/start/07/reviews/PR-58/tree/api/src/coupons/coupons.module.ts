import { Controller, Get, Injectable, Module, NotFoundException, Param } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service.js'

// CAFE-29 優惠券
@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(code: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } })
    if (!coupon) throw new NotFoundException({ code: 'COUPON_NOT_FOUND', message: `找不到優惠券「${code}」` })
    return coupon
  }
}

// 結帳頁輸入代碼後先查一次，顯示說明與折數
@Controller('coupons')
class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get(':code')
  async findOne(@Param('code') code: string) {
    const coupon = await this.coupons.find(code)
    return { code: coupon.code, description: coupon.description, percentOff: coupon.percentOff }
  }
}

@Module({ controllers: [CouponsController], providers: [CouponsService], exports: [CouponsService] })
export class CouponsModule {}
