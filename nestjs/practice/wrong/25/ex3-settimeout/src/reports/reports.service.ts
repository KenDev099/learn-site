import { Injectable } from '@nestjs/common'
import { pbkdf2Sync } from 'node:crypto'

const SALT = 'brew-receipt-v1'
const ITERATIONS = 8000   // 故意算很慢：跟密碼雜湊一樣，讓別人沒辦法大量猜

// 每張收據的防偽碼：當天第 001～200 號收據，各算一次 pbkdf2
@Injectable()
export class ReportsService {
  async receiptSignatures(date: string) {
    await new Promise(resolve => setTimeout(resolve, 0))   // 錯誤寫法：只是晚一點開始卡
    const signatures: string[] = []
    for (let i = 1; i <= 200; i++) {
      const receiptId = `${date}-${String(i).padStart(3, '0')}`
      signatures.push(pbkdf2Sync(receiptId, SALT, ITERATIONS, 32, 'sha256').toString('hex'))
    }
    return { date, signatures }
  }
}
