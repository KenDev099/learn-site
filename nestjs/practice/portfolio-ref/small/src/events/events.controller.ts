import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { ApiError } from '../common/api-error.js'
import { CreateEventDto, ListEventsQuery, RegisterDto } from './events.dto.js'
import { EventsService } from './events.service.js'

// id 不是 UUID 時直接 404（不存在），不要讓壞掉的 id 跑到資料庫變成 500
const id = (code: string) => new ParseUUIDPipe({ exceptionFactory: () => new ApiError(404, code, '找不到') })

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  create(@Body() dto: CreateEventDto) {
    return this.events.create(dto)
  }

  @Get()
  list(@Query() q: ListEventsQuery) {
    return this.events.list(q.cursor, q.limit)
  }

  @Get(':id')
  get(@Param('id', id('EVENT_NOT_FOUND')) eventId: string) {
    return this.events.get(eventId)
  }

  @Post(':id/registrations')
  register(@Param('id', id('EVENT_NOT_FOUND')) eventId: string, @Body() dto: RegisterDto) {
    return this.events.register(eventId, dto)
  }

  @Delete(':id/registrations/:regId')
  @HttpCode(204)
  cancel(@Param('id', id('REGISTRATION_NOT_FOUND')) eventId: string, @Param('regId', id('REGISTRATION_NOT_FOUND')) regId: string) {
    return this.events.cancel(eventId, regId)
  }
}
