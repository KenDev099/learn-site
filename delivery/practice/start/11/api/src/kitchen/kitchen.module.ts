import { ConflictException, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service.js'

// 廚房看板（CAFE-37）：吧台的平板每秒拉一次，列出付好款、還沒做完的訂單，最早下單的在最上面
//   paid：付好款，等著做    preparing：吧台按了「開始製作」
export type BoardOrder = {
  id: number
  status: string
  orderedAt: string
  pickupAt: string | null
  items: { name: string, quantity: number }[]
}

@Injectable()
export class KitchenService {
  constructor(private readonly prisma: PrismaService) {}

  async board(): Promise<BoardOrder[]> {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['paid', 'preparing'] } },
      orderBy: [{ orderedAt: 'asc' }, { id: 'asc' }],
    })
    const board: BoardOrder[] = []
    for (const order of orders) {
      // 每張單的品項與商品名稱
      const items = await this.prisma.orderItem.findMany({
        where: { orderId: order.id },
        include: { product: true },
        orderBy: { id: 'asc' },
      })
      board.push({
        id: order.id,
        status: order.status,
        orderedAt: order.orderedAt.toISOString(),
        pickupAt: order.pickupAt?.toISOString() ?? null,
        items: items.map(i => ({ name: i.product.name, quantity: i.quantity })),
      })
    }
    return board
  }

  // 吧台按「開始製作」：paid → preparing
  async start(id: number) {
    const { count } = await this.prisma.order.updateMany({ where: { id, status: 'paid' }, data: { status: 'preparing' } })
    if (count === 1) return { id, status: 'preparing' }
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `找不到訂單 ${id}` })
    throw new ConflictException({ code: 'ORDER_NOT_PAID', message: `訂單 ${id} 的狀態是 ${order.status}，不能開始製作` })
  }
}

@Controller()
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('kitchen/board')
  board() {
    return this.kitchen.board()
  }

  @Post('orders/:id/start')
  @HttpCode(200)
  start(@Param('id', ParseIntPipe) id: number) {
    return this.kitchen.start(id)
  }
}

@Module({ controllers: [KitchenController], providers: [KitchenService] })
export class KitchenModule {}
