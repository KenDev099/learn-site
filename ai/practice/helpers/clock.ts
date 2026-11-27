// 假的時鐘：重試、逾時、輪詢、TTFT 的題目用它，測試不真的等待
// now() 回傳目前的毫秒數；sleep(ms) 立刻把時間往前推 ms 並 resolve（不真的等），每次的 ms 記在 sleeps
// set(t)／advance(ms) 由測試直接改時間，例如在串流事件之間插入 () => clock.set(900)
export function fakeClock(start = 0) {
  let t = start
  const sleeps: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms },
    set: (ms: number) => { t = ms },
    advance: (ms: number) => { t += ms },
    sleeps,
  }
}
export type FakeClock = ReturnType<typeof fakeClock>

// 固定 seed 的亂數（mulberry32）：需要 random() 的題目由測試傳入，結果每次都一樣
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = Math.imul(a ^ (a >>> 15), a | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
