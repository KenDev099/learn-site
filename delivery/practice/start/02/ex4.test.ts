// 練習 4：在 work/02 這個 git repo 裡，把 CAFE-15 做成一個接在最新 main 後面的分支，推上 origin
// repo 是 prepare.mjs 第一次判分時建的：main＝起始檔，origin＝.git/origin.git，小芸的 commit 只在 origin 的 main 上
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './api/src/app.module.js'

const dir = import.meta.dirname
const gitDir = join(dir, '.git')
const run = (args: string[]) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() }
}
const git = (...args: string[]) => run(['--git-dir', gitDir, '--work-tree', dir, ...args])   // 一定是 work/02 的 repo，不會往上找到 learn/ 的
const origin = (...args: string[]) => run(['--git-dir', join(gitDir, 'origin.git'), ...args])
const { colleague } = JSON.parse(readFileSync(join(gitDir, 'learn.json'), 'utf8')) as { colleague: string }
const branch = git('branch', '--show-current').out
const show = (path: string) => git('show', `HEAD:${path}`).out
const SUBJECT = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: \S/

describe('練習 4：分支、commit、rebase、push', () => {
  it('沒有停在 rebase 或 merge 的一半，改動都 commit 了', () => {
    for (const f of ['rebase-merge', 'rebase-apply']) {
      expect(existsSync(join(gitDir, f)), 'rebase 還沒結束：解完衝突要 git add 那些檔案，再 git rebase --continue（git status 會告訴你還差什麼）').toBe(false)
    }
    expect(existsSync(join(gitDir, 'MERGE_HEAD')), '你在 merge 的一半：這題要用 rebase。先 git merge --abort，再 git rebase origin/main').toBe(false)
    const dirty = git('status', '--porcelain').out
    expect(dirty, `還有沒 commit 的改動或沒加進 git 的檔案（新的 migration 資料夾最常漏掉）：\n${dirty}`).toBe('')
  })

  it('在 feat/CAFE-15-… 分支上，不是 main', () => {
    expect(branch, '現在不在任何分支上（detached HEAD）：rebase 還沒做完，或 checkout 到了某個 commit').not.toBe('')
    expect(branch, `分支名稱「${branch}」不符合團隊慣例：類型/單號-英文短描述，例如 git switch -c feat/CAFE-15-sold-out`).toMatch(/^feat\/CAFE-15-[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('接在最新的 main 後面，歷史是一直線', () => {
    expect(origin('rev-parse', 'refs/heads/main').out, 'origin 的 main 被改了：main 只能透過審查過的 PR 合併，不要直接推到 main').toBe(colleague)
    expect(git('merge-base', '--is-ancestor', colleague, 'HEAD').ok, '你的分支沒有包含小芸已經合併到 main 的 commit：git fetch origin 拿到最新的 main，再 git rebase origin/main').toBe(true)
    expect(git('rev-list', '--merges', `${colleague}..HEAD`).out, '分支上有 merge commit：這題要用 rebase 把你的 commit 接到 main 後面，不是把 main merge 進來').toBe('')
    expect(Number(git('rev-list', '--count', `${colleague}..HEAD`).out), '最新的 main 後面沒有你的 commit：套用 patch 之後要 git commit').toBeGreaterThan(0)
  })

  it('commit 訊息符合 Conventional Commits，並寫出 CAFE-15', () => {
    const log = git('log', '--format=%B%x00', `${colleague}..HEAD`).out.split('\0').map(m => m.trim()).filter(Boolean)
    for (const m of log) {
      const subject = m.split('\n')[0]
      expect(subject, `「${subject}」：第一行要是「類型(範圍): 描述」，例如 feat(products): 商品可以標記已售完`).toMatch(SUBJECT)
      expect([...subject].length, `「${subject}」：第一行太長（${[...subject].length} 字），細節寫到內文`).toBeLessThanOrEqual(72)
    }
    expect(log.some(m => /\bCAFE-15\b/.test(m)), 'commit 訊息裡沒有 CAFE-15：最後一行加 Refs: CAFE-15，之後才追得回需求單').toBe(true)
  })

  it('衝突解對了：沒有衝突標記，兩邊的改動都在', () => {
    const markers = git('grep', '-n', '-E', '^(<<<<<<<|=======|>>>>>>>|\\|\\|\\|\\|\\|\\|\\|)( |$)', 'HEAD').out
    expect(markers, `commit 裡還有衝突標記：\n${markers}`).toBe('')
    for (const m of ['20261103090000_products_category', '20261104000000_sold_out']) {
      expect(git('cat-file', '-e', `HEAD:api/prisma/migrations/${m}/migration.sql`).ok, `HEAD 裡沒有 migration ${m}：兩邊的 migration 都要在`).toBe(true)
    }
    const schema = show('api/prisma/schema.prisma')
    const product = schema.match(/model Product \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(product, 'schema.prisma 的 Product 少了小芸加的 category：rebase 時 HEAD 那邊（main）的改動也要留下').toMatch(/^\s*category\s+String\b/m)
    expect(product, 'schema.prisma 的 Product 少了 soldOut：你的 commit 的改動被蓋掉了').toMatch(/^\s*soldOut\s+Boolean\b.*@map\("sold_out"\)/m)
    expect(product, 'schema.prisma 還有 legacySku：CAFE-15 的 migration 刪掉了 legacy_sku 欄位，解衝突時把兩邊都留下，就把它加回來了。看衝突的 base 那段（zdiff3）：你的 commit 是「刪掉 legacySku、加 soldOut」').not.toMatch(/legacySku/)
    const seed = show('api/prisma/seed.sql')
    expect(seed, "seed.sql 少了小芸加的 UPDATE products SET category = 'food'").toMatch(/SET category = 'food'/)
    expect(seed, 'seed.sql 還在寫 legacy_sku：那一欄已經被 CAFE-15 的 migration 刪掉，seed 會失敗').not.toMatch(/legacy_sku/)
    const menu = show('api/src/products/products.module.ts').match(/menu\(\)\s*\{[\s\S]*?select:\s*\{([^}]*)\}/)?.[1] ?? ''
    for (const f of ['category', 'soldOut']) {
      expect(menu, `products.module.ts 的 menu() 的 select 少了 ${f}: true：這一行兩邊都改了，要合成一行，兩個欄位都選`).toMatch(new RegExp(`\\b${f}:\\s*true`))
    }
    for (const f of ['web/src/api/products.ts', 'web/src/pages/MenuPage.vue']) {
      expect(show(f), `${f} 沒有 soldOut：changes/CAFE-15.patch 沒有完整套用`).toMatch(/soldOut/)
    }
  })

  it('分支推上 origin 了，而且是 rebase 之後的版本', () => {
    const remote = origin('rev-parse', '--verify', '-q', `refs/heads/${branch}`).out
    expect(remote, `origin 上沒有 ${branch}：git push -u origin ${branch}，推上去才能開 PR`).not.toBe('')
    expect(remote, `origin 上的 ${branch} 是舊的版本（rebase 之前推的）：rebase 換掉了 commit，要用 git push --force-with-lease`).toBe(git('rev-parse', 'HEAD').out)
  })
})

describe('練習 4：合併後的 API', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(() => app?.close())

  it('GET /products 同時回傳 category 與 soldOut', async () => {
    const res = await request(app.getHttpServer()).get('/products')
    expect(res.status, `GET /products 回 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
    const cake = res.body.find((p: { id: number }) => p.id === 6)
    expect(cake, 'GET /products 找不到起司蛋糕（id 6）').toBeDefined()
    expect(cake, 'GET /products 的商品要同時有小芸的 category 與 CAFE-15 的 soldOut').toMatchObject({ category: 'food', soldOut: false })
  })
})
