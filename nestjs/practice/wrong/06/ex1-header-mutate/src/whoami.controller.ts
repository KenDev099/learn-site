import { Controller, Get, Headers } from '@nestjs/common'

@Controller('whoami')
export class WhoamiController {
  @Get()
  whoami(@Headers('x-request-id') requestId?: string) {
    return { requestId }
  }
}
