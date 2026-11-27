// SaaS 契約（portfolio/CONTRACT-saas.md）的煙霧測試：參考實作要全部通過。執行：node smoke/run.mjs
// 寫第 6～19 課驗收測試的人可以從這裡複製寫法；這個檔案本身不給學習者跑
import { createHmac } from 'node:crypto'
import pg from 'pg'
import { addMember, call, concurrent, cookieOf, email, expectError, login, mailpitLink, PASSWORD, pollUntil, signupTenant, target, type Account } from '../../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

function upload(acc: Account, projectId: string, data: Buffer, filename: string, type = 'application/octet-stream') {
  const form = new FormData()
  form.append('file', new Blob([data], { type }), filename)
  return call(t, 'POST', `/api/v1/projects/${projectId}/files`, { token: acc.token, raw: form })
}
const project = async (acc: Account, name = '專案') => {
  const r = await call(t, 'POST', '/api/v1/projects', { token: acc.token, body: { name } })
  expect(r.status, r.text).toBe(201)
  return r.body.id as string
}

describe('第 6 課：骨架與錯誤格式', () => {
  it('health live／ready（ready 列出 database 與 redis）', async () => {
    expect((await call(t, 'GET', '/health/live')).status).toBe(200)
    const ready = await call(t, 'GET', '/health/ready')
    expect(ready.status).toBe(200)
    expect(ready.body.details.database.status).toBe('up')
    expect(ready.body.details.redis.status).toBe('up')
  })
  it('未知路徑 404 NOT_FOUND，有 requestId', async () => {
    const r = await call(t, 'GET', '/api/v1/nope')
    expectError(r, 404, 'NOT_FOUND')
    expect(r.body.requestId).toBe(r.headers.get('x-request-id'))
  })
})

describe('第 7 課：帳號與 token', () => {
  it('signup 201、重複 409 EMAIL_TAKEN、缺欄位 400', async () => {
    const e = email('dup')
    const body = { email: e, password: PASSWORD, name: 'A', tenantName: 'T' }
    const r = await call(t, 'POST', '/api/v1/auth/signup', { body })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ user: { email: e }, role: 'owner' })
    expectError(await call(t, 'POST', '/api/v1/auth/signup', { body: { ...body, email: e.toUpperCase() } }), 409, 'EMAIL_TAKEN')
    expectError(await call(t, 'POST', '/api/v1/auth/signup', { body: { email: email('x') } }), 400, 'VALIDATION_FAILED')
  })
  it('login：cookie 屬性；帳號不存在與密碼錯一樣 401 INVALID_CREDENTIALS', async () => {
    const a = await signupTenant(t)
    const r = await call(t, 'POST', '/api/v1/auth/login', { body: { email: a.email, password: PASSWORD } })
    const set = r.headers.getSetCookie().join('\n')
    expect(set).toMatch(/HttpOnly/i)
    expect(set).toMatch(/SameSite=(Strict|Lax)/i)
    expect(set).toMatch(/Path=\/api\/v1\/auth/i)
    const wrong = await call(t, 'POST', '/api/v1/auth/login', { body: { email: a.email, password: 'nope-nope-nope' } })
    const none = await call(t, 'POST', '/api/v1/auth/login', { body: { email: email('ghost'), password: 'nope-nope-nope' } })
    expectError(wrong, 401, 'INVALID_CREDENTIALS')
    expectError(none, 401, 'INVALID_CREDENTIALS')
    const me = await call(t, 'GET', '/api/v1/me', { token: a.token })
    expect(me.body).toMatchObject({ user: { email: a.email }, tenant: { id: a.tenantId }, role: 'owner' })
  })
  it('refresh 輪替；舊的再用 401 REFRESH_REUSED，之後整個家族失效；logout 後 401', async () => {
    const a = await signupTenant(t)
    const r1 = await call(t, 'POST', '/api/v1/auth/refresh', { cookie: a.cookie })
    expect(r1.status).toBe(200)
    const c1 = cookieOf(r1)
    expectError(await call(t, 'POST', '/api/v1/auth/refresh', { cookie: a.cookie }), 401, 'REFRESH_REUSED')
    expect((await call(t, 'POST', '/api/v1/auth/refresh', { cookie: c1 })).status).toBe(401)
    const b = await login(t, a.email)
    expect((await call(t, 'POST', '/api/v1/auth/logout', { cookie: b.cookie })).status).toBe(204)
    expect((await call(t, 'POST', '/api/v1/auth/refresh', { cookie: b.cookie })).status).toBe(401)
  })
  it('沒有 token、壞 token、alg: none、別的金鑰簽的 token 都 401', async () => {
    const a = await signupTenant(t)
    const [h, p] = a.token.split('.')
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`
    const forged = `${h}.${p}.${createHmac('sha256', 'not-the-secret').update(`${h}.${p}`).digest('base64url')}`
    for (const token of [undefined, 'garbage', none, forged]) expect((await call(t, 'GET', '/api/v1/me', { token })).status).toBe(401)
  })
  it('同一個 email 連續錯 20 次，至少一次 429', async () => {
    const a = await signupTenant(t)
    const codes: number[] = []
    for (let i = 0; i < 20; i++) codes.push((await call(t, 'POST', '/api/v1/auth/login', { body: { email: a.email, password: 'wrong-password' } })).status)
    expect(codes).toContain(429)
  })
})

describe('第 8 課：租戶隔離', () => {
  it('列表只看到自己的；別人的 GET／PATCH／DELETE 都 404，資料沒被改', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const pa = await project(a, 'A 的'), pb = await project(b, 'B 的')
    const list = await call(t, 'GET', '/api/v1/projects', { token: a.token })
    expect(list.body.items.map((p: { id: string }) => p.id)).toEqual([pa])
    expectError(await call(t, 'GET', `/api/v1/projects/${pb}`, { token: a.token }), 404, 'NOT_FOUND')
    expectError(await call(t, 'PATCH', `/api/v1/projects/${pb}`, { token: a.token, body: { name: '改' } }), 404, 'NOT_FOUND')
    expectError(await call(t, 'DELETE', `/api/v1/projects/${pb}`, { token: a.token }), 404, 'NOT_FOUND')
    expect((await call(t, 'GET', `/api/v1/projects/${pb}`, { token: b.token })).body.name).toBe('B 的')
  })
  it('body 帶 tenantId：被拒，資料不會跑到別的租戶', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const r = await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'x', tenantId: b.tenantId } })
    expect(r.status).toBe(400)
    expect((await call(t, 'GET', '/api/v1/projects', { token: b.token })).body.items).toEqual([])
  })
  it('拿別的租戶的 project 當游標不會洩漏資料', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    await project(a)
    const pb = await project(b)
    const cursor = Buffer.from(JSON.stringify(['1970-01-01T00:00:00.000Z', pb])).toString('base64url')
    const r = await call(t, 'GET', `/api/v1/projects?cursor=${cursor}`, { token: a.token })
    expect(r.body.items?.some((p: { id: string }) => p.id === pb) ?? false).toBe(false)
  })
})

describe('第 9 課：RLS（灰箱）', () => {
  it('pf_app 不是 superuser、沒有 BYPASSRLS；有 tenant_id 的表都 ENABLE＋FORCE；沒設上下文看不到資料', async () => {
    const a = await signupTenant(t)
    await project(a)
    const db = new pg.Client({ connectionString: t.appDatabaseUrl })
    await db.connect()
    try {
      const role = (await db.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0]
      expect(role).toEqual({ rolsuper: false, rolbypassrls: false })
      const tables = (await db.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) = current_user AS owner
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'tenant_id'`)).rows
      expect(tables.length).toBeGreaterThan(3)
      for (const r of tables) expect(r, r.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, owner: false })
      expect(Number((await db.query('SELECT count(*) FROM projects')).rows[0].count)).toBe(0)
      await db.query('BEGIN')
      await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.tenantId])
      expect(Number((await db.query('SELECT count(*) FROM projects')).rows[0].count)).toBe(1)
      await expect(db.query(`INSERT INTO projects (id, tenant_id, name, updated_at) VALUES (gen_random_uuid(), gen_random_uuid(), 'x', now())`)).rejects.toThrow(/row-level security/)
      await db.query('ROLLBACK')
    } finally {
      await db.end()
    }
  })
  it('200 個交錯的 A、B 請求不會讀到別的租戶', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const pa = await project(a), pb = await project(b)
    const results = await concurrent(20, 200, i => {
      const [acc, own] = i % 2 ? [a, pa] : [b, pb]
      return call(t, 'GET', '/api/v1/projects', { token: acc.token }).then(r => r.status === 200 && r.body.items.length === 1 && r.body.items[0].id === own)
    })
    expect(results.every(Boolean)).toBe(true)
  })
})

describe('第 10 課：成員、邀請與 RBAC', () => {
  it('邀請 → Mailpit → 接受；同一個 token 再用 410 INVITATION_USED；撤銷後 410 INVITATION_REVOKED', async () => {
    const owner = await signupTenant(t)
    const e = email('new')
    await call(t, 'POST', '/api/v1/invitations', { token: owner.token, body: { email: e, role: 'member' } })
    const link = await mailpitLink(t, e)
    expect(link.startsWith('http://app.example.test/')).toBe(true)
    const token = new URL(link).searchParams.get('token')
    expect((await call(t, 'POST', '/api/v1/auth/invitations/accept', { body: { token, name: 'N', password: PASSWORD } })).status).toBe(200)
    const m = await login(t, e)
    expect((await call(t, 'GET', '/api/v1/me', { token: m.token })).body).toMatchObject({ tenant: { id: owner.tenantId }, role: 'member' })
    expectError(await call(t, 'POST', '/api/v1/auth/invitations/accept', { body: { token, name: 'N', password: PASSWORD } }), 410, 'INVITATION_USED')
    const e2 = email('revoked')
    const inv = await call(t, 'POST', '/api/v1/invitations', { token: owner.token, body: { email: e2, role: 'viewer' } })
    const token2 = new URL(await mailpitLink(t, e2)).searchParams.get('token')
    expect((await call(t, 'DELETE', `/api/v1/invitations/${inv.body.id}`, { token: owner.token })).status).toBe(204)
    expectError(await call(t, 'POST', '/api/v1/auth/invitations/accept', { body: { token: token2, name: 'N', password: PASSWORD } }), 410, 'INVITATION_REVOKED')
  })
  it('權限矩陣', async () => {
    const owner = await signupTenant(t)
    const accs = { owner, admin: await addMember(t, owner, 'admin'), member: await addMember(t, owner, 'member'), viewer: await addMember(t, owner, 'viewer') }
    const p = await project(owner)
    const cases: [string, string, unknown, Record<string, number>][] = [
      ['GET', '/api/v1/projects', undefined, { viewer: 200, member: 200, admin: 200, owner: 200 }],
      ['POST', '/api/v1/projects', { name: 'x' }, { viewer: 403, member: 201, admin: 201, owner: 403 }],   // owner 第 4 個 → 方案上限（403 PLAN_LIMIT_REACHED）
      ['PATCH', `/api/v1/projects/${p}`, { name: 'y' }, { viewer: 403, member: 200, admin: 200, owner: 200 }],
      ['GET', '/api/v1/members', undefined, { viewer: 200, member: 200, admin: 200, owner: 200 }],
      ['GET', '/api/v1/invitations', undefined, { viewer: 403, member: 403, admin: 200, owner: 200 }],
      ['GET', '/api/v1/audit-logs', undefined, { viewer: 403, member: 403, admin: 200, owner: 200 }],
      ['POST', '/api/v1/billing/plan', { plan: 'free' }, { viewer: 403, member: 403, admin: 403, owner: 200 }],
      ['DELETE', `/api/v1/projects/${p}`, undefined, { viewer: 403, member: 403, admin: 204, owner: 404 }],
    ]
    const wrong: string[] = []
    for (const [method, path, body, expected] of cases) {
      for (const role of ['viewer', 'member', 'admin', 'owner'] as const) {
        const r = await call(t, method, path, { token: accs[role].token, body })
        if (r.status !== expected[role]) wrong.push(`${role} ${method} ${path} → ${r.status}（要 ${expected[role]}）`)
      }
    }
    expect(wrong).toEqual([])
  })
  it('admin 邀請 owner 403；降級最後一位 owner 409 LAST_OWNER', async () => {
    const owner = await signupTenant(t)
    const admin = await addMember(t, owner, 'admin')
    expectError(await call(t, 'POST', '/api/v1/invitations', { token: admin.token, body: { email: email('o'), role: 'owner' } }), 403, 'FORBIDDEN')
    expectError(await call(t, 'PATCH', `/api/v1/members/${owner.userId}`, { token: owner.token, body: { role: 'admin' } }), 409, 'LAST_OWNER')
    expectError(await call(t, 'DELETE', `/api/v1/members/${owner.userId}`, { token: owner.token }), 409, 'LAST_OWNER')
  })
  it('被移除的成員：手上的 token 失效；switch 到被移除的租戶 403', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    // b 的 owner 也被邀請進 a
    const e = b.email
    await call(t, 'POST', '/api/v1/invitations', { token: a.token, body: { email: e, role: 'member' } })
    const token = new URL(await mailpitLink(t, e)).searchParams.get('token')
    expect((await call(t, 'POST', '/api/v1/auth/invitations/accept', { body: { token } })).status).toBe(200)
    const tenants = await call(t, 'GET', '/api/v1/auth/tenants', { token: b.token })
    expect(tenants.body.items.map((x: { id: string }) => x.id).sort()).toEqual([a.tenantId, b.tenantId].sort())
    const sw = await call(t, 'POST', '/api/v1/auth/switch-tenant', { token: b.token, body: { tenantId: a.tenantId } })
    expect(sw.status).toBe(200)
    const inA = sw.body.accessToken
    expect((await call(t, 'GET', '/api/v1/projects', { token: inA })).status).toBe(200)
    expect((await call(t, 'DELETE', `/api/v1/members/${b.userId}`, { token: a.token })).status).toBe(204)
    expect([401, 403]).toContain((await call(t, 'GET', '/api/v1/projects', { token: inA })).status)
    expectError(await call(t, 'POST', '/api/v1/auth/switch-tenant', { token: b.token, body: { tenantId: a.tenantId } }), 403, 'FORBIDDEN')
  })
})

describe('第 11 課：稽核', () => {
  it('每個操作一筆、actor 與 requestId 正確；B 看不到；member 403；失敗的不記', async () => {
    const owner = await signupTenant(t)
    const member = await addMember(t, owner, 'member')
    const created = await call(t, 'POST', '/api/v1/projects', { token: owner.token, body: { name: 'a' }, headers: { 'x-request-id': 'audit-check-1' } })
    await call(t, 'PATCH', `/api/v1/projects/${created.body.id}`, { token: owner.token, body: { name: 'b' } })
    await call(t, 'PATCH', `/api/v1/members/${member.userId}`, { token: owner.token, body: { role: 'viewer' } })
    await call(t, 'POST', '/api/v1/projects', { token: owner.token, body: { name: '' } })   // 400，不記
    await call(t, 'DELETE', `/api/v1/projects/${created.body.id}`, { token: owner.token })
    const logs = (await call(t, 'GET', '/api/v1/audit-logs', { token: owner.token })).body.items as { action: string; actorId: string; requestId: string; targetId: string }[]
    const actions = logs.map(l => l.action)
    for (const a of ['project.created', 'project.updated', 'project.deleted', 'member.role_changed', 'invitation.created', 'invitation.accepted']) expect(actions).toContain(a)
    expect(actions.filter(a => a === 'project.created').length).toBe(1)
    const c = logs.find(l => l.action === 'project.created')!
    expect(c).toMatchObject({ actorId: owner.userId, requestId: 'audit-check-1', targetId: created.body.id })
    const filtered = await call(t, 'GET', '/api/v1/audit-logs?action=project.updated', { token: owner.token })
    expect(filtered.body.items.every((l: { action: string }) => l.action === 'project.updated')).toBe(true)
    const b = await signupTenant(t)
    expect((await call(t, 'GET', '/api/v1/audit-logs', { token: b.token })).body.items).toEqual([])
    const m2 = await addMember(t, owner, 'member')
    expectError(await call(t, 'GET', '/api/v1/audit-logs', { token: m2.token }), 403, 'FORBIDDEN')
  })
  it('pf_app 對稽核表沒有 UPDATE、DELETE', async () => {
    const db = new pg.Client({ connectionString: t.appDatabaseUrl })
    await db.connect()
    try {
      const r = (await db.query(`SELECT has_table_privilege('audit_logs', 'UPDATE') AS u, has_table_privilege('audit_logs', 'DELETE') AS d, has_table_privilege('audit_logs', 'INSERT') AS i`)).rows[0]
      expect(r).toEqual({ u: false, d: false, i: true })
    } finally {
      await db.end()
    }
  })
})

describe('第 12 課：檔案', () => {
  it('上傳 PNG、下載位元組一樣、標頭 attachment＋nosniff＋中文檔名', async () => {
    const a = await signupTenant(t)
    const p = await project(a)
    const up = await upload(a, p, PNG, '截圖.png', 'image/png')
    expect(up.status, up.text).toBe(201)
    expect(up.body).toMatchObject({ projectId: p, filename: '截圖.png', contentType: 'image/png', size: PNG.length })
    const res = await fetch(`${t.api}/api/v1/files/${up.body.id}/content`, { headers: { authorization: `Bearer ${a.token}` } })
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true)
    expect(res.headers.get('content-disposition')).toMatch(/^attachment/)
    expect(res.headers.get('content-disposition')).toContain(`filename*=UTF-8''${encodeURIComponent('截圖.png')}`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
  it('6 MB 413 FILE_TOO_LARGE；HTML 改名 .png 415；跨租戶 404', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const p = await project(a)
    expectError(await upload(a, p, Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]), 'big.png'), 413, 'FILE_TOO_LARGE')
    expectError(await upload(a, p, Buffer.from('<script>alert(1)</script>'), 'x.png', 'image/png'), 415, 'UNSUPPORTED_FILE_TYPE')
    const up = await upload(a, p, PNG, 'a.png')
    expectError(await call(t, 'GET', `/api/v1/files/${up.body.id}`, { token: b.token }), 404, 'NOT_FOUND')
    expectError(await call(t, 'GET', `/api/v1/files/${up.body.id}/content`, { token: b.token }), 404, 'NOT_FOUND')
    expectError(await upload(b, p, PNG, 'a.png'), 404, 'NOT_FOUND')
    expect((await call(t, 'DELETE', `/api/v1/files/${up.body.id}`, { token: a.token })).status).toBe(204)
  })
})

describe('第 13 課：匯出', () => {
  it('202 → done，只有自己租戶、跳脫與 CSV injection', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    await project(b, 'B 的秘密')
    await project(a, '逗號, "引號"')
    await project(a, '=HYPERLINK("http://evil")')
    const r = await call(t, 'POST', '/api/v1/exports', { token: a.token, body: { type: 'projects' } })
    expect(r.status).toBe(202)
    expect(r.body.status).toBe('queued')
    await pollUntil(async () => (await call(t, 'GET', `/api/v1/exports/${r.body.id}`, { token: a.token })).body.status === 'done', { what: '匯出完成' })
    const content = await call(t, 'GET', `/api/v1/exports/${r.body.id}/content`, { token: a.token })
    expect(content.status).toBe(200)
    expect(content.text.split('\r\n')[0]).toBe('id,name,description,archived,createdAt')
    expect(content.text).toContain('"逗號, ""引號"""')
    expect(content.text).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(content.text).not.toContain('B 的秘密')
    expectError(await call(t, 'GET', `/api/v1/exports/${r.body.id}`, { token: b.token }), 404, 'NOT_FOUND')
    expectError(await call(t, 'GET', `/api/v1/exports/${r.body.id}/content`, { token: b.token }), 404, 'NOT_FOUND')
    const viewer = await addMember(t, a, 'viewer')
    expectError(await call(t, 'POST', '/api/v1/exports', { token: viewer.token, body: { type: 'projects' } }), 403, 'FORBIDDEN')
  })
})

describe('第 14 課：方案與限流', () => {
  it('第 4 個 project 403 PLAN_LIMIT_REACHED；升級後可以；usage 正確', async () => {
    const a = await signupTenant(t)
    for (let i = 0; i < 3; i++) await project(a)
    expectError(await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '4' } }), 403, 'PLAN_LIMIT_REACHED')
    expect((await call(t, 'POST', '/api/v1/billing/plan', { token: a.token, body: { plan: 'pro' } })).status).toBe(200)
    expect((await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '4' } })).status).toBe(201)
    const billing = await call(t, 'GET', '/api/v1/billing', { token: a.token })
    expect(billing.body).toMatchObject({ plan: 'pro', usage: { projects: 4, members: 1 } })
  })
  it('併發：已有 2 個時同時建立 10 個，最後恰好 3 個', async () => {
    const a = await signupTenant(t)
    await project(a)
    await project(a)
    // 先暖機：剛啟動時連線池還在開連線，第一批請求會被排成一個一個跑，沒加鎖也看不出競態
    await Promise.all(Array.from({ length: 10 }, () => call(t, 'GET', '/api/v1/projects', { token: a.token })))
    await Promise.all(Array.from({ length: 10 }, () => call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'race' } })))
    expect((await call(t, 'GET', '/api/v1/projects', { token: a.token })).body.items.length).toBe(3)
  })
  it('成員上限把待接受的邀請算進去', async () => {
    const a = await signupTenant(t)
    for (let i = 0; i < 4; i++) expect((await call(t, 'POST', '/api/v1/invitations', { token: a.token, body: { email: email('cap'), role: 'viewer' } })).status).toBe(201)
    expectError(await call(t, 'POST', '/api/v1/invitations', { token: a.token, body: { email: email('cap'), role: 'viewer' } }), 403, 'PLAN_LIMIT_REACHED')
  })
  it('同一租戶第 301 個請求 429＋Retry-After，另一個租戶不受影響', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const statuses = await concurrent(20, 299, () => call(t, 'GET', '/api/v1/me', { token: a.token }).then(r => r.status))
    expect(statuses.every(s => s === 200)).toBe(true)
    const over = await call(t, 'GET', '/api/v1/me', { token: a.token })
    expectError(over, 429, 'RATE_LIMITED')
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await call(t, 'GET', '/api/v1/me', { token: b.token })).status).toBe(200)
  })
})

describe('第 15 課：OpenAPI', () => {
  it('3.x、涵蓋契約路徑、security、共用錯誤 schema', async () => {
    const doc = (await call(t, 'GET', '/openapi.json')).body
    expect(doc.openapi).toMatch(/^3\./)
    for (const [path, method] of [['/api/v1/auth/signup', 'post'], ['/api/v1/auth/login', 'post'], ['/api/v1/projects', 'get'], ['/api/v1/projects/{id}', 'patch'],
      ['/api/v1/members/{userId}', 'delete'], ['/api/v1/invitations', 'post'], ['/api/v1/audit-logs', 'get'], ['/api/v1/projects/{id}/files', 'post'],
      ['/api/v1/files/{id}/content', 'get'], ['/api/v1/exports', 'post'], ['/api/v1/billing/plan', 'post'], ['/api/v1/me', 'get']]) {
      expect(doc.paths[path]?.[method], `${method} ${path}`).toBeTruthy()
    }
    expect(doc.paths['/api/v1/projects'].get.security).toBeTruthy()
    expect(doc.paths['/api/v1/auth/login'].post.security ?? []).toEqual([])
    expect(JSON.stringify(doc.paths['/api/v1/projects/{id}'].get.responses['404'])).toContain('#/components/schemas/ErrorResponse')
    expect(doc.components.schemas.ErrorResponse.properties.errorCode).toBeTruthy()
    expect((await fetch(`${t.api}/docs`)).status).toBe(200)
  })
})

describe('第 16 課：requestId 與錯誤', () => {
  it('x-request-id：合法的沿用、含換行或超長的換掉；錯誤的 requestId 等於標頭', async () => {
    expect((await call(t, 'GET', '/health/live', { headers: { 'x-request-id': 'abc-123' } })).headers.get('x-request-id')).toBe('abc-123')
    expect((await call(t, 'GET', '/health/live', { headers: { 'x-request-id': 'x'.repeat(300) } })).headers.get('x-request-id')).not.toBe('x'.repeat(300))
    const r = await call(t, 'GET', '/api/v1/me')
    expect(r.body.requestId).toBe(r.headers.get('x-request-id'))
  })
  it('壞掉的 JSON 400，不帶 stack', async () => {
    const r = await call(t, 'POST', '/api/v1/auth/login', { raw: '{"email":', headers: { 'content-type': 'application/json' } })
    expect(r.status).toBe(400)
    expect(r.body.errorCode).toBeTruthy()
    expect(r.text).not.toMatch(/\bat \/|node_modules/)
  })
})

describe('第 18 課：資安檢查', () => {
  it('BOLA 探針', async () => {
    expect(t.bolaProbes.length).toBeGreaterThanOrEqual(2)
    for (const probe of t.bolaProbes) {
      const a = await signupTenant(t), b = await signupTenant(t)
      const member = await addMember(t, a, 'member'), viewer = await addMember(t, a, 'viewer')
      const created = await call(t, 'POST', probe.create.path, { token: member.token, body: probe.create.body })
      expect(created.status, `${probe.name} 建立`).toBe(201)
      const item = probe.item.replace(':id', created.body.id)
      for (const [m, body] of [['GET', undefined], ['PATCH', probe.update.body], ['DELETE', undefined]] as const) {
        expect((await call(t, m, item, { token: b.token, body })).status, `${probe.name} B ${m}`).toBe(404)
      }
      expect((await call(t, 'PATCH', item, { token: viewer.token, body: probe.update.body })).status).toBe(403)
      expect((await call(t, 'DELETE', item, { token: viewer.token })).status).toBe(403)
      expect((await call(t, 'GET', item)).status).toBe(401)
      expect((await call(t, 'GET', item, { token: member.token })).status).toBe(200)
    }
  })
  it('mass assignment：role、tenantId、plan 都不生效', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const member = await addMember(t, a, 'member')
    await call(t, 'PATCH', '/api/v1/me', { token: member.token, body: { name: 'n', role: 'owner', tenantId: b.tenantId, isPlatformAdmin: true } })
    await call(t, 'PATCH', `/api/v1/members/${member.userId}`, { token: a.token, body: { role: 'member', tenantId: b.tenantId } })
    await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'x', plan: 'pro', tenantId: b.tenantId } })
    expect((await call(t, 'GET', '/api/v1/me', { token: member.token })).body).toMatchObject({ role: 'member', tenant: { id: a.tenantId, plan: 'free' } })
    expect((await call(t, 'GET', '/api/v1/projects', { token: b.token })).body.items).toEqual([])
  })
  it('安全標頭、CORS 白名單、body 上限、錯誤不洩漏', async () => {
    const r = await call(t, 'GET', '/health/live', { headers: { origin: 'https://evil.example' } })
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
    expectError(await call(t, 'POST', '/api/v1/auth/login', { raw: JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(1_100_000) }), headers: { 'content-type': 'application/json' } }), 413, 'PAYLOAD_TOO_LARGE')
    const a = await signupTenant(t)
    for (const res of [await call(t, 'GET', '/api/v1/projects/not-a-uuid', { token: a.token }), await call(t, 'POST', '/api/v1/auth/signup', { body: { email: a.email, password: PASSWORD, name: 'x', tenantName: 'y' } })]) {
      expect(res.text).not.toMatch(/Prisma|\bat |projects|users_email/)
    }
  })
})
