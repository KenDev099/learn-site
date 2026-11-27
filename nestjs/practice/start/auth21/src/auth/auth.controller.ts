import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { LoginDto } from './login.dto.js'
import { AuthService } from './auth.service.js'
import { permissionsOf } from './permissions.js'
import { RequirePermissions } from './permissions.decorator.js'
import { CurrentUser, type Principal } from './principal.js'
import { Public } from './public.decorator.js'

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: LoginDto) {
    const user = await this.auth.login(body.email, body.password)
    // 練習 5：另外發 refresh token，放進 __Secure-rt cookie
    return { accessToken: await this.auth.signAccessToken(user) }
  }

  // 練習 5：POST /auth/refresh、POST /auth/logout

  @RequirePermissions()   // 登入就可以
  @Get('me')
  me(@CurrentUser() user: Principal) {
    return { ...user, permissions: [...permissionsOf(user.role)] }
  }
}
