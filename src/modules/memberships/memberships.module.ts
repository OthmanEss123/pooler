import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { EmailProviderModule } from '../email-provider/email-provider.module';
import { MembershipInvitationsController } from './membership-invitations.controller';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [PrismaModule, EmailProviderModule],
  controllers: [MembershipsController, MembershipInvitationsController],
  providers: [MembershipsService, RolesGuard],
  exports: [MembershipsService],
})
export class MembershipsModule {}
