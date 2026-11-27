// 證明範本裡寫的東西指到真的程式：檔案存在、函式／方法／model 存在、npm script 存在、API 路由存在
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'

export const fileExists = (taskDir: string, file: string) => typeof file === 'string' && !file.includes('..') && existsSync(join(taskDir, file))

// symbol：函式名稱（submit）、類別.方法（OrdersService.create）或 Prisma model（Order）
export function symbolExists(taskDir: string, file: string, symbol: string) {
  if (!fileExists(taskDir, file) || typeof symbol !== 'string') return false
  const code = readFileSync(join(taskDir, file), 'utf8')
  const has = (name: string) => new RegExp(
    `(function\\s+${name}\\b|\\bclass\\s+${name}\\b|\\bmodel\\s+${name}\\s*\\{|\\b(const|let)\\s+${name}\\s*=|^\\s*(async\\s+)?${name}\\s*\\()`, 'm').test(code)
  const parts = symbol.split('.')
  if (parts.length === 1) return /^\w+$/.test(symbol) && has(symbol)
  if (parts.length !== 2 || !parts.every(p => /^\w+$/.test(p))) return false
  const body = code.split(new RegExp(`\\bclass\\s+${parts[0]}\\b`))[1]
  return body !== undefined && new RegExp(`^\\s*(async\\s+)?${parts[1]}\\s*\\(`, 'm').test(body)
}

export const scripts = (taskDir: string): Record<string, string> => JSON.parse(readFileSync(join(taskDir, 'package.json'), 'utf8')).scripts ?? {}

// Nest（Express 5）實際登記的路由：['GET /health', 'POST /orders', 'GET /orders/:id', …]
export function routes(app: INestApplication): string[] {
  const stack = app.getHttpAdapter().getInstance().router.stack as { route?: { path: string; methods: Record<string, boolean> } }[]
  return stack.flatMap(l => l.route ? Object.keys(l.route.methods).map(m => `${m.toUpperCase()} ${l.route!.path}`) : [])
}

// 路由樣式比對：'/orders/:id' 對得上 '/orders/12'
export const matchRoute = (list: string[], method: string, path: string) => list.some(r => {
  const [m, p] = r.split(' ')
  return m === method.toUpperCase() && new RegExp('^' + p.replace(/:\w+/g, '[^/]+') + '/?$').test(path)
})
