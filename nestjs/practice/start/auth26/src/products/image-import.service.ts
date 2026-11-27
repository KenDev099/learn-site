import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Principal } from '../auth/principal.js'
import { PrismaService } from '../prisma.service.js'

@Injectable()
export class ImageImportService {
  constructor(private readonly prisma: PrismaService) {}

  // 店長貼上圖片網址，伺服器下載下來確認是圖片，再存到商品上
  async importFromUrl(user: Principal, productId: number, url: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId: user.tenantId } })
    if (!product) throw new NotFoundException()
    const res = await fetch(url)
    if (!res.ok) throw new BadRequestException(`下載失敗：${url} 回應 ${res.status}`)
    if (!res.headers.get('content-type')?.startsWith('image/')) throw new BadRequestException('這個網址不是圖片')
    const body = Buffer.from(await res.arrayBuffer())
    await this.prisma.product.update({ where: { id: product.id }, data: { imageUrl: url } })
    return { imageUrl: url, bytes: body.length }
  }
}
