import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalFilters(new DomainExceptionFilter())
  await app.listen(process.env.PORT ?? 3100)
}
await bootstrap()
