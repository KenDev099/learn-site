import { Injectable, type OnModuleInit } from '@nestjs/common'
import { pbkdf2Sync } from 'node:crypto'

const SALT = 'brew-receipt-v1'
const ITERATIONS = 8000

// 錯誤寫法：啟動時先算好今天的，之後不管查哪一天都回這份
@Injectable()
export class ReportsService implements OnModuleInit {
  private cached: string[] = []

  onModuleInit() {
    for (let i = 1; i <= 200; i++) {
      this.cached.push(pbkdf2Sync(`2026-11-01-${String(i).padStart(3, '0')}`, SALT, ITERATIONS, 32, 'sha256').toString('hex'))
    }
  }

  receiptSignatures(date: string) {
    return { date, signatures: this.cached }
  }
}
