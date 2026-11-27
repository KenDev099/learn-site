import { Injectable } from '@nestjs/common'
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto'

// 第 3、21 課：argon2id（OWASP 最低參數 m=19456 KiB、t=2、p=1），存成 PHC 字串
const PARAMS = { memory: 19456, passes: 2, parallelism: 1 }
const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '')

function derive(password: string, nonce: Buffer, p: typeof PARAMS, tagLength: number) {
  return new Promise<Buffer>((resolve, reject) =>
    argon2('argon2id', { message: password, nonce, tagLength, ...p }, (err, key) => (err ? reject(err) : resolve(key))))
}

@Injectable()
export class PasswordService {
  async hash(password: string) {
    const salt = randomBytes(16)
    const hash = await derive(password, salt, PARAMS, 32)
    return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(hash)}`
  }

  async verify(password: string, stored: string) {
    const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(stored)
    if (!m) return false
    const expected = Buffer.from(m[5], 'base64')
    const actual = await derive(password, Buffer.from(m[4], 'base64'), { memory: +m[1], passes: +m[2], parallelism: +m[3] }, expected.length)
    return timingSafeEqual(actual, expected)
  }
}
