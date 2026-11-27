import { Injectable } from '@nestjs/common'
import { ApiError } from '../common/api-error.js'
import { Prisma, type Event } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { decodeCursor, encodeCursor } from './cursor.js'
import type { CreateEventDto, RegisterDto } from './events.dto.js'

const PAGE = 20
const view = (e: Event) => ({ id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), capacity: e.capacity, remaining: e.remaining })
const notFound = () => new ApiError(404, 'EVENT_NOT_FOUND', '找不到這個活動')

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto, now = new Date()) {
    const startsAt = new Date(dto.startsAt)
    if (startsAt <= now) throw new ApiError(400, 'VALIDATION_FAILED', 'startsAt 要是未來的時間')
    return view(await this.prisma.event.create({ data: { title: dto.title, startsAt, capacity: dto.capacity, remaining: dto.capacity } }))
  }

  // 游標分頁：WHERE (starts_at, id) > (游標) ORDER BY starts_at, id。翻頁中間有人新增活動也不會重複或漏掉
  async list(cursor?: string, limit = PAGE) {
    const c = cursor ? decodeCursor(cursor) : null
    const rows = await this.prisma.event.findMany({
      where: c ? { OR: [{ startsAt: { gt: c.startsAt } }, { startsAt: c.startsAt, id: { gt: c.id } }] } : {},
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,   // 多拿一筆，才知道還有沒有下一頁
    })
    const items = rows.slice(0, limit)
    return { items: items.map(view), nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1]) : null }
  }

  async get(id: string) {
    const e = await this.prisma.event.findUnique({ where: { id } })
    if (!e) throw notFound()
    return view(e)
  }

  // 名額：條件式 UPDATE「remaining > 0 才扣」。PostgreSQL 對同一列的 UPDATE 會排隊，所以不會超賣（第 2 課）
  // 扣名額與新增報名在同一個交易：重複報名（唯一約束 P2002）時，扣掉的名額跟著回滾
  async register(eventId: string, dto: RegisterDto) {
    try {
      return await this.prisma.$transaction(async tx => {
        const { count } = await tx.event.updateMany({ where: { id: eventId, remaining: { gt: 0 } }, data: { remaining: { decrement: 1 } } })
        if (count === 0) {
          if (!(await tx.event.findUnique({ where: { id: eventId }, select: { id: true } }))) throw notFound()
          throw new ApiError(409, 'EVENT_FULL', '名額已滿')
        }
        const r = await tx.registration.create({ data: { eventId, email: dto.email, name: dto.name } })
        return { id: r.id, eventId, email: r.email, name: r.name, createdAt: r.createdAt.toISOString() }
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ApiError(409, 'ALREADY_REGISTERED', '這個 email 已經報名過')
      throw e
    }
  }

  async cancel(eventId: string, registrationId: string) {
    await this.prisma.$transaction(async tx => {
      const { count } = await tx.registration.deleteMany({ where: { id: registrationId, eventId } })
      if (count === 0) throw new ApiError(404, 'REGISTRATION_NOT_FOUND', '找不到這筆報名')
      await tx.event.update({ where: { id: eventId }, data: { remaining: { increment: 1 } } })
    })
  }
}
