import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AcceptInvitationController, InvitationsController, MembersController } from './members.controller.js'
import { InvitationsService } from './invitations.service.js'
import { MailService } from './mail.service.js'
import { MembersService } from './members.service.js'

@Module({
  imports: [AuthModule],
  controllers: [MembersController, InvitationsController, AcceptInvitationController],
  providers: [MembersService, InvitationsService, MailService],
})
export class MembersModule {}
