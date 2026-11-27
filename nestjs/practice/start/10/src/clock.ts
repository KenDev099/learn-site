// 第 3 課的做法：「現在幾點」由 CLOCK 提供，測試時換成固定的時間
export const CLOCK = Symbol('CLOCK')
export type Clock = { now(): Date }
