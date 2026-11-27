// 練習 2：從 HTTP 測 POST /api/orders。用 configureApp 套上跟 main.ts 一樣的全域設定，金流換成替身
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/app.setup.js'
import { PaymentGateway } from '../src/payments/payment.gateway.js'

describe('POST /api/orders', () => {
  it.todo('把 todo 換成真的測試：201、400（缺 items）、409（庫存不足）、502（金流失敗）')
})
