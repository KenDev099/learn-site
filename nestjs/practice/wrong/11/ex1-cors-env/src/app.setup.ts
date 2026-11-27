import type { INestApplication } from '@nestjs/common'

export function configureApp(app: INestApplication) {
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map(s => s.trim()) })
}
