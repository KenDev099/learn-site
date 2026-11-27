// 櫃台小票上的取餐時間，台北時間的「月/日 時:分」，例如 11/04 07:30（CAFE-21）
const pad = (n: number) => String(n).padStart(2, '0')

export function pickupLabel(at: Date): string {
  return `${pad(at.getMonth() + 1)}/${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
}
