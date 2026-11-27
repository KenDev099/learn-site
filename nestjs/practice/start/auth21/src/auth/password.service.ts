import { Injectable } from '@nestjs/common'

// 練習 1：argon2id（m=19456 KiB、t=2、p=1）、16 bytes 隨機 salt、32 bytes 輸出，存成 PHC 字串
//   $argon2id$v=19$m=19456,t=2,p=1$<salt 的 base64，不含 =>$<hash 的 base64，不含 =>
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    throw new Error('TODO：練習 1')
  }

  // 依字串裡記錄的參數重算、用 timingSafeEqual 比對；格式不對回 false，不丟錯
  async verify(password: string, stored: string): Promise<boolean> {
    throw new Error('TODO：練習 1')
  }

  // 不是 argon2id 或參數跟現在的設定不同（例如舊的 t=1）→ true，登入成功時該重新雜湊
  needsRehash(stored: string): boolean {
    throw new Error('TODO：練習 1')
  }
}
