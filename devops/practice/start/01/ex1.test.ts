// 練習 1：Docker daemon 在跑，而且你分得清 docker version 的 Client 和 Server
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { docker, readJson, requireDocker } from '../../helpers/docker.ts'

const dir = import.meta.dirname
before(requireDocker)

test('Docker Engine 主版本至少 29，daemon 跑 Linux 容器', () => {
  const v = docker('version', '--format', '{{.Server.Version}}').stdout
  assert.ok(Number(v.split('.')[0]) >= 29, `daemon 回報的 Engine 版本是 ${v}，這門課要 29 以上：更新 Docker Desktop`)
  assert.equal(docker('info', '--format', '{{.OSType}}').stdout, 'linux', 'daemon 要跑 Linux 容器')
})

test('versions.json 的 serverVersion 是 Server 段落裡 Engine 的版本', () => {
  const { serverVersion } = readJson(dir, 'versions.json')
  const real = docker('version', '--format', '{{.Server.Version}}').stdout
  assert.equal(serverVersion, real, '執行 docker version，抄 Server 段落 Engine 底下的 Version（不是 Docker Desktop 的版本號）')
})

test('versions.json 的 serverOs 是 daemon 那一端的 OS/Arch', () => {
  const { serverOs } = readJson(dir, 'versions.json')
  const real = docker('version', '--format', '{{.Server.Os}}/{{.Server.Arch}}').stdout
  assert.equal(serverOs, real, '抄 Server 段落的 OS/Arch：Client 跑在 macOS，daemon 跑在 Docker Desktop 的 Linux 虛擬機裡')
})
