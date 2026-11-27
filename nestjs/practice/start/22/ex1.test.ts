// 練習 1：上傳商品圖片
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// ConfigModule 在 import AppModule 時就讀環境變數，所以先設定好再 import
const root = mkdtempSync(join(tmpdir(), 'learn-nest-22-'))
const uploadDir = join(root, 'a', 'uploads')
process.env.UPLOAD_DIR = uploadDir
process.env.PAYMENT_WEBHOOK_SECRET ??= 'test-webhook-secret-0123456789'
const { AppModule } = await import('./src/app.module.js')
const { PrismaService } = await import('./src/prisma/prisma.service.js')

// 1×1 的 PNG；JPEG、GIF 只要開頭的位元組對，檔頭偵測就認得
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.alloc(200)])
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([1, 0, 1, 0, 0, 0, 0]), Buffer.alloc(40)])
const padded = (bytes: number) => Buffer.concat([PNG, Buffer.alloc(bytes - PNG.length)])

let app: INestApplication
let prisma: InstanceType<typeof PrismaService>
beforeAll(async () => {
  app = await createTestApp(AppModule)
  prisma = app.get(PrismaService)
})
afterAll(async () => {
  await app?.close()
  rmSync(root, { recursive: true, force: true })
})
beforeEach(async () => {
  await resetDb(prisma)
  rmSync(uploadDir, { recursive: true, force: true })
  await prisma.product.create({ data: { name: '拿鐵', price: 110 } })
})

const upload = (file: Buffer, filename: string, contentType: string) =>
  request(app.getHttpServer()).post('/products/1/image').attach('image', file, { filename, contentType })
const stored = () => existsSync(uploadDir) ? readdirSync(uploadDir) : []

describe('練習 1：POST /products/:id/image', () => {
  it('PNG：回 201 和圖片網址，檔案存在 UPLOAD_DIR，檔名由伺服器產生', async () => {
    const res = await upload(PNG, 'latte.png', 'image/png')
    expect(res.status, `應該回 201，收到 ${res.status}：${JSON.stringify(res.body)}`).toBe(201)
    const url: string = res.body.imageUrl
    expect(url, '回應要有 imageUrl，例如 /uploads/<檔名>').toMatch(/^\/uploads\/[^/]+$/)
    const name = basename(url)
    expect(name.toLowerCase(), '存檔不能用使用者給的檔名（latte.png）：用 randomUUID() 之類的方式產生').not.toContain('latte')
    expect(stored(), `UPLOAD_DIR 裡要有 ${name}`).toContain(name)
    expect(readFileSync(join(uploadDir, name)).equals(PNG), '存下來的內容要跟上傳的一樣').toBe(true)
    const product = await prisma.product.findUniqueOrThrow({ where: { id: 1 } })
    expect(product.imageUrl, '商品的 imageUrl 要更新成回應裡的網址').toBe(url)
  })

  it('JPEG 也收，1.5MB 的圖也收', async () => {
    expect((await upload(JPEG, 'cake.jpg', 'image/jpeg')).status, 'JPEG 應該回 201').toBe(201)
    expect((await upload(padded(1.5 * 1024 * 1024), 'big.png', 'image/png')).status, '1.5MB 沒有超過 2MB，應該回 201：上限設太小了').toBe(201)
  })

  it('同一個檔名上傳兩次，兩個檔案都要留著（不能互相覆蓋）', async () => {
    const a = await upload(PNG, 'photo.png', 'image/png')
    const b = await upload(PNG, 'photo.png', 'image/png')
    expect([a.status, b.status], '兩次都應該回 201').toEqual([201, 201])
    expect(a.body.imageUrl, '兩次拿到同一個網址：檔名要由伺服器產生，每次都不同').not.toBe(b.body.imageUrl)
    expect(stored().length, 'UPLOAD_DIR 裡應該有 2 個檔案').toBe(2)
  })

  it('檔名帶 ../ 也不會寫到別的資料夾', async () => {
    const res = await upload(PNG, '../../evil.png', 'image/png')
    expect(res.status).toBe(201)
    expect(existsSync(join(uploadDir, '..', '..', 'evil.png')) || existsSync(join(uploadDir, 'evil.png')), '不能用使用者給的檔名存檔').toBe(false)
  })

  it('副檔名依檔頭偵測到的類型決定，不看使用者給的檔名和 Content-Type', async () => {
    const png = await upload(PNG, 'latte.html', 'text/html')
    expect(png.status, `真的 PNG 取名 latte.html 也是 PNG，應該回 201，收到 ${png.status}`).toBe(201)
    expect(basename(png.body.imageUrl ?? ''), 'PNG 存檔要用 .png：副檔名不能來自 originalname（latte.html 會讓瀏覽器把它當網頁），要用偵測到的類型（overrideMimeType: true 之後的 file.mimetype）').toMatch(/^[\w-]+\.png$/)
    const jpg = await upload(JPEG, 'cake', 'application/octet-stream')
    expect(jpg.status).toBe(201)
    expect(basename(jpg.body.imageUrl ?? ''), 'JPEG 存檔要用 .jpg 或 .jpeg：客戶端給的 Content-Type 是 application/octet-stream，副檔名要看偵測到的類型').toMatch(/^[\w-]+\.jpe?g$/)
  })

  it('偽造：文字檔取名 photo.png、Content-Type 寫 image/png → 422，而且沒有存檔', async () => {
    const res = await upload(Buffer.from('#!/bin/sh\necho 這不是圖片\n'), 'photo.png', 'image/png')
    expect(res.status, '副檔名和 Content-Type 都是使用者給的，可以亂寫：要用 FileTypeValidator 看檔頭，失敗回 422').toBe(422)
    expect(stored(), '驗證沒過就不能存檔').toEqual([])
  })

  it('GIF 是真的圖片，但不在允許的格式裡 → 422', async () => {
    const res = await upload(GIF, 'anim.gif', 'image/gif')
    expect(res.status, '只收 PNG 和 JPEG：fileType 要寫成只符合 image/png、image/jpeg').toBe(422)
  })

  it('超過 2MB → 413（multer 的 limits.fileSize 擋下）', async () => {
    const res = await upload(padded(3 * 1024 * 1024), 'huge.png', 'image/png')
    expect(res.status, '3MB 的檔案要在 multer 收的時候就擋下，回 413：FileInterceptor 的第二個參數設定 limits.fileSize（只用 MaxFileSizeValidator 會回 422，而且整個檔案已經進了記憶體）').toBe(413)
    expect(stored()).toEqual([])
  })
})
