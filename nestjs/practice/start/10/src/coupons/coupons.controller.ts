import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { CouponsService } from './coupons.service.js'

@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get(':code')
  findOne(@Param('code') code: string) {
    const coupon = this.coupons.find(code)
    if (!coupon) throw new NotFoundException(`找不到優惠券 ${code}`, { errorCode: 'COUPON_NOT_FOUND' })
    return coupon
  }
}
