import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Permissions, Public } from '../auth/decorators.js'
import { CurrentUser, type Principal } from '../auth/principal.js'
import { ApiErrors } from '../common/openapi.js'
import { UUID } from '../common/uuid.pipe.js'
import { AcceptInvitationDto, ChangeRoleDto, InviteDto } from './members.dto.js'
import { InvitationsService } from './invitations.service.js'
import { MembersService } from './members.service.js'

@ApiTags('members')
@ApiBearerAuth()
@ApiErrors(401, 403)
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Permissions('members:read')
  @Get()
  list() {
    return this.members.list()
  }

  @Permissions('members:write')
  @Patch(':userId')
  @ApiErrors(400, 404, 409)
  changeRole(@CurrentUser() me: Principal, @Param('userId', UUID) userId: string, @Body() dto: ChangeRoleDto) {
    return this.members.changeRole(me, userId, dto.role)
  }

  @Permissions('members:write')
  @Delete(':userId')
  @HttpCode(204)
  @ApiErrors(404, 409)
  remove(@CurrentUser() me: Principal, @Param('userId', UUID) userId: string) {
    return this.members.remove(me, userId)
  }
}

@ApiTags('members')
@ApiBearerAuth()
@ApiErrors(401, 403)
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Permissions('invitations:write')
  @Post()
  @ApiErrors(400, 409)
  create(@CurrentUser() me: Principal, @Body() dto: InviteDto) {
    return this.invitations.create(me, dto)
  }

  @Permissions('invitations:read')
  @Get()
  list() {
    return this.invitations.list()
  }

  @Permissions('invitations:write')
  @Delete(':id')
  @HttpCode(204)
  @ApiErrors(404)
  revoke(@Param('id', UUID) id: string) {
    return this.invitations.revoke(id)
  }
}

// 接受邀請時還沒登入（可能連帳號都還沒有）：路徑在 /auth 底下、@Public()
@ApiTags('auth')
@Controller('auth/invitations')
export class AcceptInvitationController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Post('accept')
  @HttpCode(200)
  @ApiErrors(400, 404, 410)
  accept(@Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(dto)
  }
}
