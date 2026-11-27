// 時間從這裡拿，測試用 overrideProvider(CLOCK) 換成假時鐘
export const CLOCK = 'CLOCK'
export interface Clock {
  now(): number   // 毫秒，跟 Date.now() 一樣
}
export const systemClock: Clock = { now: () => Date.now() }
