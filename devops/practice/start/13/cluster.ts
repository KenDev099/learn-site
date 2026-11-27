// 測試共用的小工具（不用改）：啟動整套服務、透過 nginx 發請求、在容器裡查資料
import { request } from 'node:http'
import { spawn } from 'node:child_process'
import { docker, requireDocker, run, type Result } from '../../helpers/docker.ts'

export const dir = import.meta.dirname
export const BASE = 'http://127.0.0.1:18130'
export const API = (n: number) => `ld-13-api-${n}`

// files：額外的 compose 覆蓋檔（測試自己的 nginx 設定之類）
export const compose = (files: string[], ...args: string[]): Result =>
  run('docker', ['compose', '-p', 'ld-13', '-f', 'compose.yaml', ...files.flatMap(f => ['-f', f]), ...args], { cwd: dir, timeout: 600_000 })

export const HOGS = [1, 2, 3].map(n => `ld-13-hog-${n}`)

export function reset() {
  requireDocker()
  docker('rm', '-f', ...HOGS)
  compose([], 'down', '-v', '--remove-orphans', '-t', '1')
}

export function up(files: string[] = []) {
  const r = compose(files, 'up', '-d', '--wait', '--build', '--wait-timeout', '120')
  if (r.code !== 0) {
    const logs = compose(files, 'logs', '--tail', '15', 'api', 'nginx').stdout
    throw new Error(`docker compose up --wait 失敗：\n${r.stderr.split('\n').slice(-10).join('\n')}\n--- 最近的 log ---\n${logs}`)
  }
}

export type Reply = { status: number, headers: Record<string, any>, body: any }

// 每個請求開一條新連線（agent: false），測試端自己不重用連線
export function http(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise(resolve => {
    const data = body === undefined ? undefined : JSON.stringify(body)
    const req = request(BASE + path, {
      method, agent: false, timeout: 15_000,
      headers: { ...headers, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        let parsed: any = text
        try { parsed = JSON.parse(text) } catch {}
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: parsed })
      })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', e => resolve({ status: 0, headers: {}, body: String(e.message) }))
    req.end(data)
  })
}

// 在某個 api 副本裡面直接打它自己的 3000 port（不經過 nginx），印出狀態碼和 Connection 標頭
export function inside(container: string, path: string, method = 'GET'): Promise<{ status: number, connection: string }> {
  const code = `const r=require('node:http').request('http://127.0.0.1:3000${path}',{method:'${method}'},s=>{s.resume();s.on('end',()=>console.log(JSON.stringify({status:s.statusCode,connection:s.headers.connection??''})))});r.on('error',e=>{console.log(JSON.stringify({status:0,connection:e.message}))});r.end()`
  return new Promise(resolve => {
    const p = spawn('docker', ['exec', container, 'node', '-e', code])
    let out = ''
    p.stdout.on('data', d => out += d)
    p.on('close', () => {
      try { resolve(JSON.parse(out)) } catch { resolve({ status: 0, connection: `docker exec 失敗：${out}` }) }
    })
  })
}

export const psql = (sql: string) => docker('exec', 'ld-13-db-1', 'psql', '-U', 'cafe', '-d', 'cafe', '-At', '-F', '|', '-c', sql)
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 跟 run() 一樣，但不卡住事件迴圈：負載一邊跑、一邊停容器時用
export function runAsync(cmd: string, args: string[]): Promise<Result> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: dir })
    let stdout = '', stderr = ''
    p.stdout.on('data', d => stdout += d)
    p.stderr.on('data', d => stderr += d)
    p.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }))
  })
}

// nginx 實際載入的完整設定（nginx -T），去掉註解
export const nginxT = () => docker('exec', 'ld-13-nginx-1', 'nginx', '-T').stdout.replace(/#.*$/gm, '')
