import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EncryptionModule } from '../../common/services/encryption.module';
import { EmailProviderModule } from '../email-provider/email-provider.module';
import { AuthController } from './auth.controller';
import { AuthCronService } from './auth-cron.service';
import { AuthService } from './auth.service';
import { MfaService } from './services/mfa.service';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    EncryptionModule,
    EmailProviderModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'JWT_EXPIRES_IN',
          ) as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCronService,
    MfaService,
    JwtStrategy,
    ApiKeyStrategy,
    RolesGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}
