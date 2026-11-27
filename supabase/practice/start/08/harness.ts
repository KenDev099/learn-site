// 第 8 課判分用的共用工具（不用改這個檔）
import { spawnSync } from 'node:child_process'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { applySql, slugOf, stack, taskSchema } from '../../helpers/supa.ts'

// 這一題的咖啡店：products 複製一份（價格的來源），orders、order_items 照第 4 課的方式只讓顧客碰自己的訂單
export async function shopSchema(dir: string): Promise<string> {
  const schema = await taskSchema(dir)
  await applySql(schema, `
    create table products (id integer primary key, name text not null, price integer not null check (price > 0));
    insert into products select id, name, price from public.products;
    alter table products enable row level security;
    create policy "菜單公開可讀" on products for select to anon, authenticated using (true);
    grant select on products to anon, authenticated;

    create table orders (
      id integer generated always as identity primary key,
      customer_id uuid not null references auth.users (id) on delete cascade,
      total integer not null
    );
    create table order_items (
      order_id integer not null references orders (id),
      product_id integer not null references products (id),
      quantity integer not null check (quantity > 0),
      unit_price integer not null,
      primary key (order_id, product_id)
    );
    alter table orders enable row level security;
    alter table order_items enable row level security;
    create policy "顧客讀自己的訂單" on orders for select to authenticated using (customer_id = (select auth.uid()));
    create policy "顧客替自己下單" on orders for insert to authenticated with check (customer_id = (select auth.uid()));
    create policy "顧客讀自己的品項" on order_items for select to authenticated
      using (exists (select 1 from orders o where o.id = order_id and o.customer_id = (select auth.uid())));
    create policy "顧客新增自己訂單的品項" on order_items for insert to authenticated
      with check (exists (select 1 from orders o where o.id = order_id and o.customer_id = (select auth.uid())));
    grant select, insert on orders, order_items to authenticated;`)
  return schema
}

// 學習者照正式專案的寫法寫 public.xxx；判分時換成這一題專屬的 schema
export const localize = (text: string, schema: string) => text.replace(/\bpublic\./gi, `${schema}.`)

// 一個在本機跑的假金流 API：POST /charges，要帶 Authorization: Bearer <key>，記錄每一筆扣款
export async function fakePayments(key: string) {
  const charges: { orderId: unknown, amount: unknown }[] = []
  const server = createServer(async (req: IncomingMessage, res) => {
    let body = ''
    for await (const c of req) body += c
    if (req.method !== 'POST' || req.url !== '/charges') return res.writeHead(404).end()
    if (req.headers.authorization !== `Bearer ${key}`) return res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"invalid api key"}')
    const { order_id, amount } = JSON.parse(body || '{}')
    charges.push({ orderId: order_id, amount })
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: `ch_${charges.length}`, status: 'succeeded' }))
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  return { port: (server.address() as AddressInfo).port, charges, close: () => new Promise(r => server.close(r)) }
}

// 用 edge-runtime 的映像（跟本機 Supabase 同一版）跑 functions/<name>，每一題一個容器。
// 容器裡用 host.docker.internal 連回這台電腦：測試的 proxy、假金流 API 都開在這台電腦上
export const EDGE_IMAGE = 'public.ecr.aws/supabase/edge-runtime:v1.78.1'
export function serveFunction(dir: string, name: string, env: Record<string, string>) {
  const container = `learn-supabase-${slugOf(dir).replaceAll('_', '-')}-${name}`
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' })
  const args = ['run', '-d', '--rm', '--name', container, '-p', '127.0.0.1::8081', '-v', `${join(dir, 'functions', name)}:/fn:ro`,
    '--add-host', 'host.docker.internal:host-gateway',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), EDGE_IMAGE, 'start', '--main-service=/fn', '--port=8081']
  const run = spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 })
  if (run.status !== 0) throw new Error(`啟動 Edge Function 的容器失敗：${(run.stderr || run.stdout).trim()}`)
  const port = spawnSync('docker', ['port', container, '8081'], { encoding: 'utf8' }).stdout.trim().split(':').pop()
  const url = `http://localhost:${port}/functions/v1/${name}`
  // 容器剛啟動時還沒在聽：連線失敗（請求根本沒進到函式）就等一下再送
  const call = async (init: RequestInit) => {
    for (let i = 0; ; i++) {
      try {
        return await fetch(url, init)
      } catch (e) {
        if (i >= 50) throw new Error(`Edge Function 10 秒內沒有啟動：docker logs ${container}\n${spawnSync('docker', ['logs', container], { encoding: 'utf8' }).stderr}`)
        await new Promise(r => setTimeout(r, 200))
      }
    }
  }
  const logs = () => { const r = spawnSync('docker', ['logs', container], { encoding: 'utf8' }); return (r.stdout + r.stderr).trim() }
  return { call, logs, stop: () => { spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' }) } }
}

// applySql 只等表載入 PostgREST 的 schema cache；函式另外等：直到 /rest/v1/rpc/<name> 不再回 PGRST202（找不到函式）。
// 用 anon 送空的參數：權限不夠或函式自己 raise 都沒關係，只看 PostgREST 認不認得這個函式
export async function waitRpc(schema: string, name: string, args: object = { items: [] }) {
  const { API_URL, PUBLISHABLE_KEY } = stack()
  for (let i = 0; i < 50; i++) {
    const r = await fetch(`${API_URL}/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args),
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Profile': schema, 'Content-Type': 'application/json' } })
    if (!(await r.text()).includes('PGRST202')) return
    await new Promise(res => setTimeout(res, 200))
  }
  throw new Error(`PostgREST 10 秒內找不到函式 ${name}：檢查 place_order.sql 有沒有建出 public.place_order(items jsonb)`)
}
