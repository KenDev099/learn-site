// 沒有指定 timeZone：跟著程序的時區走
const local = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function pickupLabel(at: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) => local.formatToParts(at).find(p => p.type === type)!.value
  return `${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`
}
