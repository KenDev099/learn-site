// 練習 1：/openapi.json 涵蓋契約的每個端點，DTO 的欄位也在文件裡（CLI 外掛）
import { call, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

// 契約（portfolio/CONTRACT-saas.md）的每個端點；路徑參數的名字不限（{id}、{projectId} 都可以）
const CONTRACT = `
POST /api/v1/auth/signup | POST /api/v1/auth/login | POST /api/v1/auth/refresh | POST /api/v1/auth/logout
GET /api/v1/me | PATCH /api/v1/me
POST /api/v1/projects | GET /api/v1/projects | GET /api/v1/projects/{} | PATCH /api/v1/projects/{} | DELETE /api/v1/projects/{}
GET /api/v1/members | PATCH /api/v1/members/{} | DELETE /api/v1/members/{}
POST /api/v1/invitations | GET /api/v1/invitations | DELETE /api/v1/invitations/{}
POST /api/v1/auth/invitations/accept | GET /api/v1/auth/tenants | POST /api/v1/auth/switch-tenant
GET /api/v1/audit-logs
POST /api/v1/projects/{}/files | GET /api/v1/files/{} | GET /api/v1/files/{}/content | DELETE /api/v1/files/{}
POST /api/v1/exports | GET /api/v1/exports/{} | GET /api/v1/exports/{}/content
GET /api/v1/billing | POST /api/v1/billing/plan`.split(/[|\n]/).map(s => s.trim()).filter(Boolean)

const res = await call(t, 'GET', '/openapi.json')
const doc = res.body

function operations() {
  const ops = new Map<string, any>()
  for (const [path, item] of Object.entries<any>(doc?.paths ?? {})) {
    for (const [method, op] of Object.entries(item)) ops.set(`${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, '{}')}`, op)
  }
  return ops
}

// 把 { $ref: '#/components/schemas/X' } 換成 components.schemas.X
const resolve = (s: any): any => s?.$ref ? doc.components?.schemas?.[s.$ref.split('/').pop()] : s

describe('練習 1：/openapi.json', () => {
  it('GET /openapi.json 回 200，是 OpenAPI 3.x', () => {
    expect(res.status, `GET /openapi.json 要 200，實際 ${res.status}：SwaggerModule.setup 加 { jsonDocumentUrl: 'openapi.json' }（路徑不加 /api/v1）`).toBe(200)
    expect(String(doc?.openapi), '文件的 openapi 欄位要是 3.x').toMatch(/^3\./)
  })

  it('契約的每個路徑與方法都在文件裡', () => {
    const ops = operations()
    const missing = CONTRACT.filter(k => !ops.has(k))
    expect(missing, `文件少了這些端點：${missing.join('、')}。檢查 createDocument 有沒有用 include 只挑了幾個模組、controller 有沒有被 @ApiExcludeController 排除；路徑要含 /api/v1`).toEqual([])
  })

  it('DTO 的欄位在文件裡（signup、建立 project、邀請的 request body 有欄位與必填）', () => {
    const ops = operations()
    const want: [string, string[]][] = [
      ['POST /api/v1/auth/signup', ['email', 'password', 'name', 'tenantName']],
      ['POST /api/v1/projects', ['name']],
      ['POST /api/v1/invitations', ['email', 'role']],
    ]
    for (const [key, fields] of want) {
      const schema = resolve(ops.get(key)?.requestBody?.content?.['application/json']?.schema)
      const props = Object.keys(schema?.properties ?? {})
      expect(props, `${key} 的 request body 在文件裡沒有欄位（實際：${props.join('、') || '空的'}）：nest-cli.json 的 compilerOptions.plugins 加 "@nestjs/swagger"，DTO 檔名用 .dto.ts 結尾`).toEqual(expect.arrayContaining(fields))
      expect(schema?.required ?? [], `${key} 的必填欄位要標 required（CLI 外掛看型別有沒有 ?）`).toEqual(expect.arrayContaining(fields))
    }
  })
})
