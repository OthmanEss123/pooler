import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditController } from './audit.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [RolesGuard],
})
export class AuditModule {}
