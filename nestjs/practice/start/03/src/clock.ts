// 「現在幾點」的來源。用 Symbol 當 injection token：interface 在執行時不存在，不能當 token
export interface Clock {
  now(): Date
}

export const CLOCK = Symbol('CLOCK')
