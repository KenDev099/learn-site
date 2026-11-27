// 把時間排成「10:00:05」。這個檔案不用改
const pad = (n: number) => String(n).padStart(2, '0')

export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
