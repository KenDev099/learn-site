import { Injectable } from '@nestjs/common'
import { argon2, randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

// argon2 的 callback 版本在 libuv thread pool 上算，不會卡住事件迴圈；argon2Sync 會
const argon2Async = promisify(argon2)

// OWASP 的最低建議：argon2id、m=19456 KiB（19 MiB）、t=2、p=1
const PARAMS = { memory: 19456, passes: 2, parallelism: 1 }
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/
const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '')   // PHC 的 base64 不含 =

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16)
    const hash = await argon2Async('argon2id', { message: password, nonce: salt, tagLength: 32, ...PARAMS })
    const { memory: m, passes: t, parallelism: p } = PARAMS
    return `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(salt)}$${b64(hash)}`
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const match = PHC.exec(stored)
    if (!match) return false
    const [, m, t, p, salt, hash] = match
    const expected = Buffer.from(hash, 'base64')
    try {
      // 用字串裡記錄的參數重算：參數升級之後，舊的雜湊照樣能驗證
      const actual = await argon2Async('argon2id', {
        message: password, nonce: Buffer.from(salt, 'base64'), tagLength: expected.length,
        memory: Number(m), passes: Number(t), parallelism: Number(p),
      })
      return actual.toString('base64') === expected.toString('base64')
    } catch {
      return false   // 參數不合法（例如 salt 太短）：當成驗證失敗
    }
  }

  needsRehash(stored: string): boolean {
    const match = PHC.exec(stored)
    if (!match) return true
    const [, m, t, p] = match.map(Number)
    return m !== PARAMS.memory || t !== PARAMS.passes || p !== PARAMS.parallelism
  }
}
