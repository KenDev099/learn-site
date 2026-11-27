// 查商品價格。之後的課會換成真的呼叫菜單服務，現在先用 setTimeout 假裝要等一下
import { setTimeout } from 'node:timers/promises'

const MENU: Record<string, number> = { 美式咖啡: 80, 拿鐵: 110, 卡布奇諾: 110, 伯爵紅茶: 90, 可頌: 70, 起司蛋糕: 120 }

export async function fetchMenuPrice(name: string): Promise<number> {
  await setTimeout(10)
  return MENU[name]
}
