// 櫃台小票上的取餐時間，台北時間的「月/日 時:分」，例如 11/04 07:30（CAFE-21）
// 用 Intl 指定 timeZone：結果只看傳進來的時間點，跟伺服器的 TZ 無關（正式機與 CI 都是 UTC）
const taipei = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function pickupLabel(at: Date): string {
  // 不直接用 format()：它在日期和時間之間放的是 U+2009 窄空白，印表機和比對都會出問題。拿各個欄位自己組
  const part = (type: Intl.DateTimeFormatPartTypes) => taipei.formatToParts(at).find(p => p.type === type)!.value
  return `${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`
}
