import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditLoggingModule {}
