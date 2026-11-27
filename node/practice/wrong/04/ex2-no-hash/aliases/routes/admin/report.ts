import { formatPrice } from 'lib/price.ts'

export function reportLine(total: number) {
  return `今日營收 ${formatPrice(total)}`
}
