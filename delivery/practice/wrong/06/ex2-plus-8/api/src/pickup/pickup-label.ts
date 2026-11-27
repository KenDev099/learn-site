// 手動加 8 小時：小時對了，日期還是 UTC 的
const pad = (n: number) => String(n).padStart(2, '0')

export function pickupLabel(at: Date): string {
  return `${pad(at.getUTCMonth() + 1)}/${pad(at.getUTCDate())} ${pad((at.getUTCHours() + 8) % 24)}:${pad(at.getUTCMinutes())}`
}
