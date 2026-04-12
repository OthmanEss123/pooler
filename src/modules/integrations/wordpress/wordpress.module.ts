import { Module } from '@nestjs/common';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { EncryptionModule } from '../../../common/services/encryption.module';
import { PrismaModule } from '../../../database/prisma/prisma.module';
import { WordPressApiClient } from './wordpress-api.client';
import { WordPressController } from './wordpress.controller';
import { WordPressMapper } from './wordpress-mapper';
import { WordPressService } from './wordpress.service';

@Module({
  imports: [PrismaModule, EncryptionModule],
  controllers: [WordPressController],
  providers: [
    WordPressService,
    WordPressApiClient,
    WordPressMapper,
    RolesGuard,
  ],
  exports: [WordPressService],
})
export class WordPressModule {}
