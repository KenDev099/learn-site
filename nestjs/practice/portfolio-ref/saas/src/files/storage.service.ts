import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Env } from '../config/env.js'

// 物件儲存的最小版本：本機磁碟（第 12 課）。正式環境換成 S3 相容的儲存，介面一樣是 put／get／delete＋key。
// key 由程式產生（tenants/<tenantId>/…/<隨機 id>），不用使用者給的檔名；這裡再檢查一次不會跑出根目錄
@Injectable()
export class StorageService {
  private readonly root: string

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('STORAGE_DIR', { infer: true }))
  }

  private path(key: string) {
    const p = resolve(this.root, key)
    if (!p.startsWith(this.root + sep)) throw new Error(`不合法的 storage key：${key}`)
    return p
  }

  async put(key: string, data: Buffer | string) {
    await mkdir(dirname(this.path(key)), { recursive: true })
    await writeFile(this.path(key), data)
  }

  get(key: string) {
    return readFile(this.path(key))
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true })
  }
}
