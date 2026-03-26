import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailProviderService } from './email-provider.service';

@Module({
  imports: [ConfigModule],
  providers: [EmailProviderService],
  exports: [EmailProviderService],
})
export class EmailProviderModule {}
