// 咖啡店 API 的精簡版：第 9 課只需要健康檢查、版本、商品和上傳
import { createServer, type ServerResponse } from 'node:http'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pino } from 'pino'

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'
// 上傳的暫存檔放這裡。預設在使用者的家目錄，唯讀的根檔案系統上會寫不進去
const TMP_DIR = process.env.TMP_DIR ?? join(homedir(), 'uploads')
const MAX_UPLOAD = 5 * 1024 * 1024
const log = pino({ base: { service: 'cafe-api', version: process.env.APP_VERSION ?? 'dev' } })

const products = [
  { id: 1, name: '美式咖啡', price: 80 },
  { id: 2, name: '拿鐵', price: 110 },
  { id: 3, name: '卡布奇諾', price: 110 },
  { id: 4, name: '伯爵紅茶', price: 90 },
  { id: 5, name: '可頌', price: 70 },
  { id: 6, name: '起司蛋糕', price: 120 },
]

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const started = Date.now()
  res.setHeader('x-instance', hostname())
  res.on('finish', () => log.info({ method: req.method, path: req.url, status: res.statusCode, duration_ms: Date.now() - started }, 'request'))
  try {
    if (req.method === 'GET' && req.url === '/health/live') return json(res, 200, { status: 'ok' })
    if (req.method === 'GET' && req.url === '/version')
      return json(res, 200, { version: process.env.APP_VERSION ?? 'dev', gitSha: process.env.GIT_SHA ?? 'unknown' })
    if (req.method === 'GET' && req.url === '/products') return json(res, 200, products)
    if (req.method === 'POST' && req.url === '/uploads') {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_UPLOAD) return json(res, 413, { error: '檔案超過 5MB' })
        chunks.push(chunk)
      }
      // 先寫成暫存檔再處理（真的 app 會在這裡掃毒、縮圖、上傳到 S3），處理完刪掉
      await mkdir(TMP_DIR, { recursive: true })
      const file = join(TMP_DIR, randomUUID())
      await writeFile(file, Buffer.concat(chunks))
      const { size: bytes } = await stat(file)
      await unlink(file)
      return json(res, 200, { bytes })
    }
    json(res, 404, { error: 'not found' })
  } catch (e) {
    log.error({ err: e }, 'request failed')
    if (!res.headersSent) json(res, 500, { error: (e as Error).message })
  }
})

server.listen(PORT, HOST, () => log.info({ port: PORT, tmpDir: TMP_DIR }, 'cafe-api listening'))
process.on('SIGTERM', () => {
  log.info('SIGTERM received, closing')
  server.close(() => process.exit(0))
  server.closeIdleConnections()
})
