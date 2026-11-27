// 練習 2：受保護的端點有 security；錯誤回應都文件化，而且引用同一個錯誤 schema
import { call, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const doc = (await call(t, 'GET', '/openapi.json')).body
const PUBLIC = ['POST /api/v1/auth/signup', 'POST /api/v1/auth/login', 'POST /api/v1/auth/invitations/accept']
const COOKIE = ['POST /api/v1/auth/refresh', 'POST /api/v1/auth/logout']   // 帶 refresh cookie，不帶 Bearer

type Op = { key: string; path: string; op: any }
const ops: Op[] = Object.entries<any>(doc?.paths ?? {}).flatMap(([path, item]) =>
  Object.entries<any>(item).map(([method, op]) => ({ key: `${method.toUpperCase()} ${path}`, path, op })))
const api = ops.filter(o => o.path.startsWith('/api/v1/'))
const security = (o: Op) => o.op.security ?? doc?.security ?? []
const schemaOf = (r: any) => r?.content?.['application/json']?.schema
const named = (ref?: string) => ref ? doc.components?.schemas?.[ref.split('/').pop()!] : undefined

describe('練習 2：security 與錯誤回應', () => {
  it('文件有 Bearer 的 security scheme', () => {
    const schemes = Object.values<any>(doc?.components?.securitySchemes ?? {})
    expect(schemes.some(s => s.type === 'http' && s.scheme === 'bearer'), 'components.securitySchemes 要有 bearer：DocumentBuilder 加 .addBearerAuth()').toBe(true)
  })

  it('端點引用的 security 名稱都有定義在 components.securitySchemes', () => {
    const defined = Object.keys(doc?.components?.securitySchemes ?? {})
    const undefinedNames = [...new Set(api.flatMap(o => security(o).flatMap((s: object) => Object.keys(s))))].filter(n => !defined.includes(n))
    expect(undefinedNames, `端點引用了沒定義的 security：${undefinedNames.join('、')}（已定義：${defined.join('、')}）。@ApiCookieAuth('x') 要對到 addCookieAuth 的第三個參數 'x'，產生型別與 Swagger UI 的 Authorize 才找得到`).toEqual([])
  })

  it('登入後才能用的端點都有 security；signup、login、接受邀請沒有', () => {
    expect(api.length, '/openapi.json 裡沒有 /api/v1 的端點').toBeGreaterThan(10)
    const unprotected = api.filter(o => !PUBLIC.includes(o.key) && !COOKIE.includes(o.key) && !security(o).length).map(o => o.key)
    expect(unprotected, `這些端點要登入，文件卻沒有 security：${unprotected.join('、')}。controller 加 @ApiBearerAuth()`).toEqual([])
    const wrongly = api.filter(o => PUBLIC.includes(o.key) && security(o).length).map(o => o.key)
    expect(wrongly, `這些端點不用登入，文件卻要求 token：${wrongly.join('、')}`).toEqual([])
  })

  it('要登入的端點文件化 401；有路徑參數的端點文件化 404', () => {
    const missing: string[] = []
    for (const o of api) {
      const codes = Object.keys(o.op.responses ?? {})
      if (security(o).length && !COOKIE.includes(o.key) && !codes.includes('401')) missing.push(`${o.key} 少 401`)
      if (/\{[^}]+\}/.test(o.path) && !codes.includes('404')) missing.push(`${o.key} 少 404`)
    }
    expect(missing, `${missing.join('、')}：用一個共用的裝飾器（例如 @ApiErrors(401, 404)）把會出現的錯誤寫進文件`).toEqual([])
  })

  it('每個 4xx 回應都引用同一個錯誤 schema，它有 statusCode、errorCode、message、requestId', () => {
    const refs = new Set<string>()
    const inline: string[] = []
    for (const o of api) {
      for (const [code, r] of Object.entries<any>(o.op.responses ?? {})) {
        if (!/^4\d\d$/.test(code)) continue
        const ref = schemaOf(r)?.$ref
        if (ref) refs.add(ref); else inline.push(`${o.key} ${code}`)
      }
    }
    expect(inline.slice(0, 5), `這些錯誤回應沒有引用錯誤 schema（只有說明或內嵌）：${inline.slice(0, 5).join('、')}${inline.length > 5 ? ` 等 ${inline.length} 個` : ''}。ApiResponse 要加 type: ErrorResponse`).toEqual([])
    expect([...refs], `4xx 回應要引用同一個 schema，實際用了 ${[...refs].join('、')}`).toHaveLength(1)
    const props = Object.keys(named([...refs][0])?.properties ?? {})
    expect(props, '錯誤 schema 的欄位要跟契約一樣').toEqual(expect.arrayContaining(['statusCode', 'errorCode', 'message', 'requestId']))
  })
})
