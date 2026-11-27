// 練習 1：工具都裝好了，而且 versions.json 填的是真的執行結果
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readJson, run } from '../../helpers/k8s.ts'

const dir = import.meta.dirname

// 執行指令取得版本字串；沒安裝時給出安裝方式
function version(cmd: string, args: string[], install: string): string {
  const r = run(cmd, args, { timeout: 15_000 })
  assert.ok(r.code === 0 && r.stdout, `找不到 ${cmd}（或執行失敗）：執行 ${install}，裝好後開一個新的終端機再試。\n${r.stderr}`)
  return r.stdout.split('\n')[0].trim()
}

test('Docker Desktop 在跑', () => {
  const r = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 15_000 })
  assert.ok(r.code === 0 && r.stdout, 'Docker daemon 連不上：執行 docker desktop start（或打開 Docker Desktop），等 docker info 不再報錯後再試')
})

test('kind 是 0.33.x，versions.json 的 kind 是 kind version 的完整輸出', () => {
  const real = version('kind', ['version'], 'brew install kind')
  assert.match(real, /^kind v0\.33\.\d+ /, `這門課用 kind 0.33，你裝的是「${real}」：執行 brew upgrade kind`)
  assert.equal(readJson(dir, 'versions.json').kind, real, '把 kind version 印出來的那一行原樣貼進 versions.json 的 kind（包含 go 版本與平台）')
})

test('helm 是 4.x，versions.json 的 helm 是 helm version --short 的輸出', () => {
  const real = version('helm', ['version', '--short'], 'brew install helm')
  assert.match(real, /^v4\./, `這門課用 Helm 4，你裝的是 ${real}：執行 brew upgrade helm（Helm 3 的指令和旗標有差異，第 13 課會用到）`)
  assert.equal(readJson(dir, 'versions.json').helm, real, '把 helm version --short 印出來的值原樣貼進 versions.json 的 helm（例如 v4.x.y+g 開頭的 commit）')
})

test('kubeconform 是 0.8.x，versions.json 的 kubeconform 是 kubeconform -v 的輸出', () => {
  const real = version('kubeconform', ['-v'], 'brew install kubeconform')
  assert.match(real, /^v0\.8\./, `這門課用 kubeconform 0.8，你裝的是 ${real}：執行 brew upgrade kubeconform`)
  assert.equal(readJson(dir, 'versions.json').kubeconform, real, '把 kubeconform -v 印出來的值原樣貼進 versions.json 的 kubeconform')
})

test('kubectl 的 client 版本至少 1.36（和 1.37 的叢集只差一個小版本）', () => {
  const r = run('kubectl', ['version', '--client', '-o', 'json'], { timeout: 15_000 })
  assert.equal(r.code, 0, '找不到 kubectl：它隨 Docker Desktop 安裝，確認 Docker Desktop 已安裝並重開終端機')
  const { major, minor } = JSON.parse(r.stdout).clientVersion
  assert.ok(Number(major) === 1 && parseInt(minor) >= 36, `kubectl 是 ${major}.${minor}，太舊了：更新 Docker Desktop，或 brew install kubectl`)
})
