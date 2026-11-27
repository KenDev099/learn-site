// 練習 2：在容器裡找答案，不是在 Mac 上
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { docker, readJson, requireDocker } from '../../helpers/docker.ts'

const dir = import.meta.dirname
let arch = '', codename = ''
before(() => {
  requireDocker()
  const r = docker('run', '--rm', 'ubuntu:24.04', 'sh', '-c', 'uname -m; . /etc/os-release; echo "$VERSION_CODENAME"')
  assert.equal(r.code, 0, `docker run ubuntu:24.04 失敗：${r.stderr}`)
  ;[arch, codename] = r.stdout.split('\n').slice(-2)
})

test('container.json 的 arch 是容器裡 uname -m 的結果', () => {
  assert.equal(readJson(dir, 'container.json').arch, arch, '在容器裡執行 uname -m（Mac 上的 arm64，在 Linux 叫 aarch64）')
})

test('container.json 的 codename 是 /etc/os-release 的 VERSION_CODENAME', () => {
  assert.equal(readJson(dir, 'container.json').codename, codename, '在容器裡執行 cat /etc/os-release，找 VERSION_CODENAME 那一行（是英文代號，不是 24.04）')
})
