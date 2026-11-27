import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import type { UpdateMeDto } from './update-me.dto.js'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  me(id: number) {
    return this.prisma.user.findUniqueOrThrow({ where: { id } })
  }

  update(id: number, dto: UpdateMeDto) {
    return this.prisma.user.update({ where: { id }, data: dto })
  }
}
