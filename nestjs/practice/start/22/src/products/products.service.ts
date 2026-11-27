import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Env } from '../config/env.schema.js'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // 存圖片並記下網址。練習 1：存檔的名稱不能用使用者給的檔名
  async saveImage(id: number, file: Express.Multer.File) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) throw new NotFoundException(`找不到商品 ${id}`)

    const dir = this.config.get('UPLOAD_DIR', { infer: true })
    await mkdir(dir, { recursive: true })
    const filename = file.originalname
    await writeFile(join(dir, filename), file.buffer)

    const imageUrl = `/uploads/${filename}`
    await this.prisma.product.update({ where: { id }, data: { imageUrl } })
    return { imageUrl }
  }
}
