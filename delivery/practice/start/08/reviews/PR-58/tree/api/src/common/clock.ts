import { Global, Module } from '@nestjs/common'

// 「現在幾點」一律從這裡拿，不要在程式裡直接 new Date()
// 正式執行時是真的時間；測試用 overrideProvider(Clock) 換成固定的時間，邊界（例如 08:01、18:44）每次結果都一樣
// 用抽象類別當 token：注入時直接寫 constructor(private readonly clock: Clock)
export abstract class Clock {
  abstract now(): Date
}

class SystemClock extends Clock {
  now() {
    return new Date()
  }
}

// @Global：每個模組都能注入 Clock，不用各自 import
@Global()
@Module({ providers: [{ provide: Clock, useClass: SystemClock }], exports: [Clock] })
export class ClockModule {}
