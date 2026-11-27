import { Injectable } from '@nestjs/common'
import { pbkdf2 } from 'node:crypto'
import { promisify } from 'node:util'

const SALT = 'brew-receipt-v1'
const ITERATIONS = 8000   // 故意算很慢：跟密碼雜湊一樣，讓別人沒辦法大量猜
const pbkdf2Async = promisify(pbkdf2)

// 每張收據的防偽碼：當天第 001～200 號收據，各算一次 pbkdf2
// 非同步版在 libuv 的執行緒池計算，主執行緒只負責收結果，其他請求不會被卡住
@Injectable()
export class ReportsService {
  async receiptSignatures(date: string) {
    const signatures = await Promise.all(Array.from({ length: 200 }, async (_, i) => {
      const receiptId = `${date}-${String(i + 1).padStart(3, '0')}`
      return (await pbkdf2Async(receiptId, SALT, ITERATIONS, 32, 'sha256')).toString('hex')
    }))
    return { date, signatures }
  }
}
