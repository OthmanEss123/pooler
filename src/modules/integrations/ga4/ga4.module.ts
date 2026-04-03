import { Module } from '@nestjs/common';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { EncryptionModule } from '../../../common/services/encryption.module';
import { ClickhouseModule } from '../../../database/clickhouse/clickhouse.module';
import { PrismaModule } from '../../../database/prisma/prisma.module';
import { Ga4Controller } from './ga4.controller';
import { Ga4Service } from './ga4.service';

@Module({
  imports: [PrismaModule, ClickhouseModule, EncryptionModule],
  controllers: [Ga4Controller],
  providers: [Ga4Service, RolesGuard],
  exports: [Ga4Service],
})
export class Ga4Module {}
