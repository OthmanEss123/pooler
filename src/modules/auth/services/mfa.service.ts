import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verify } from 'otplib';
import * as qrcode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { EncryptionService } from '../../../common/services/encryption.service';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class MfaService {
  private readonly issuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly config: ConfigService,
  ) {
    this.issuer = this.config.get<string>('MFA_ISSUER', 'Pilot');
  }

  async generateSecret(userId: string): Promise<{ qrCodeUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (user.mfaEnabled) {
      throw new BadRequestException('MFA est deja active');
    }

    const secret = generateSecret();
    const encryptedSecret = this.encryptionService.encrypt(secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: encryptedSecret },
    });

    const otpauthUrl = generateURI({
      issuer: this.issuer,
      label: user.email,
      secret,
    });
    const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);

    return { qrCodeUrl };
  }

  async enable(userId: string, token: string): Promise<{ enabled: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!user.mfaSecret) {
      throw new BadRequestException(
        'MFA non initialise, appelez /mfa/setup avant',
      );
    }

    if (user.mfaEnabled) {
      throw new BadRequestException('MFA est deja active');
    }

    const secret = this.encryptionService.decrypt(user.mfaSecret);
    const result = await verify({ token, secret });

    if (!result.valid) {
      throw new UnauthorizedException('Code TOTP invalide');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    return { enabled: true };
  }

  async disable(
    userId: string,
    token: string,
    password: string,
  ): Promise<{ disabled: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException("MFA n'est pas active");
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException('Mot de passe invalide');
    }

    const secret = this.encryptionService.decrypt(user.mfaSecret);
    const result = await verify({ token, secret });

    if (!result.valid) {
      throw new UnauthorizedException('Code TOTP invalide');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });

    return { disabled: true };
  }

  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return false;
    }

    const secret = this.encryptionService.decrypt(user.mfaSecret);
    const result = await verify({ token, secret });
    return result.valid;
  }
}
