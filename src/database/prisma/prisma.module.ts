import { Global, Module } from '@nestjs/common';
import { PrismaConfig } from './prisma.config';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaConfig, PrismaService],
  exports: [PrismaConfig, PrismaService],
})
export class PrismaModule {}
