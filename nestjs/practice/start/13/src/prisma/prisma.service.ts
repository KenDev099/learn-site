import { Injectable } from '@nestjs/common'

// 練習 3：繼承 Prisma Client；連線網址從 ConfigService 拿，關機時關掉連線池
@Injectable()
export class PrismaService {}
