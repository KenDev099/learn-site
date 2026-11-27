import { Body, Controller, Get, Patch } from '@nestjs/common'
import { CurrentUser, type Principal } from '../auth/principal.js'
import { UpdateMeDto } from './update-me.dto.js'
import { UsersService } from './users.service.js'

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: Principal) {
    return this.users.me(user.id)
  }

  @Patch()
  update(@CurrentUser() user: Principal, @Body() dto: UpdateMeDto) {
    return this.users.update(user.id, dto)
  }
}
