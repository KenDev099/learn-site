import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import type { UpdateMeDto } from './update-me.dto.js'

// 回應只給這些欄位。用 select 列出「可以給的」（允許清單），以後 User 多了新欄位也不會自動外流
const ME = { id: true, email: true, name: true, phone: true, role: true, points: true } as const

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  me(id: number) {
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: ME })
  }

  // 只寫入明確列出的欄位：就算 ValidationPipe 的設定哪天被改掉，role、points 也寫不進來（縱深防禦）
  update(id: number, dto: UpdateMeDto) {
    return this.prisma.user.update({ where: { id }, data: { name: dto.name, phone: dto.phone }, select: ME })
  }
}
