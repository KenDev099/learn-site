import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Env } from '../config/env.schema.js'
import { PrismaService } from '../prisma/prisma.service.js'

const EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg' }

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async saveImage(id: number, file: Express.Multer.File) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) throw new NotFoundException(`找不到商品 ${id}`)

    const dir = this.config.get('UPLOAD_DIR', { infer: true })
    await mkdir(dir, { recursive: true })
    // 檔名由伺服器產生：不會撞名、不會有 ../，副檔名來自檔頭偵測的類型
    const filename = file.originalname
    await writeFile(join(dir, filename), file.buffer)

    const imageUrl = `/uploads/${filename}`
    await this.prisma.product.update({ where: { id }, data: { imageUrl } })
    return { imageUrl }
  }
}
