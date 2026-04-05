import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailEventType, SuppressionReason } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';

interface UnsubscribePayload {
  tenantId: string;
  contactId: string;
  exp: number;
}

@Injectable()
export class UnsubscribeService {
  private readonly logger = new Logger(UnsubscribeService.name);
  private readonly secret: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.secret = this.config.getOrThrow<string>('JWT_SECRET');
    this.frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
  }

  buildUnsubscribeToken(tenantId: string, contactId: string): string {
    const payload: UnsubscribePayload = {
      tenantId,
      contactId,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };

    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret)
      .update(data)
      .digest('base64url');

    return `${data}.${signature}`;
  }

  verifyUnsubscribeToken(token: string): UnsubscribePayload {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new BadRequestException('Token invalide');
    }

    const [data, signature] = parts;
    const expectedSig = createHmac('sha256', this.secret)
      .update(data)
      .digest('base64url');

    if (
      signature.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
    ) {
      throw new BadRequestException('Signature invalide');
    }

    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8'),
    ) as UnsubscribePayload;

    if (payload.exp < Date.now()) {
      throw new BadRequestException('Token expire');
    }

    return payload;
  }

  async processUnsubscribe(token: string) {
    const { tenantId, contactId } = this.verifyUnsubscribeToken(token);

    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
    });

    if (!contact) {
      throw new BadRequestException('Contact introuvable');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contact.update({
        where: { id: contactId },
        data: {
          emailStatus: 'UNSUBSCRIBED',
          subscribed: false,
          unsubscribedAt: new Date(),
        },
      });

      await tx.globalSuppression.upsert({
        where: {
          tenantId_email: {
            tenantId,
            email: contact.email,
          },
        },
        update: {
          reason: SuppressionReason.UNSUBSCRIBED,
        },
        create: {
          tenantId,
          email: contact.email,
          reason: SuppressionReason.UNSUBSCRIBED,
        },
      });

      const recentUnsubscribe = await tx.emailEvent.findFirst({
        where: {
          tenantId,
          contactId,
          type: EmailEventType.UNSUBSCRIBED,
          createdAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000),
          },
        },
      });

      if (!recentUnsubscribe) {
        const latestCampaign = await tx.emailEvent.findFirst({
          where: {
            tenantId,
            contactId,
          },
          orderBy: { createdAt: 'desc' },
          select: { campaignId: true },
        });

        if (latestCampaign?.campaignId) {
          await tx.emailEvent.create({
            data: {
              tenantId,
              campaignId: latestCampaign.campaignId,
              contactId,
              type: EmailEventType.UNSUBSCRIBED,
              provider: 'public-unsubscribe',
              metadata: {
                source: 'public_unsubscribe',
                email: contact.email,
              },
            },
          });
        }
      }
    });

    this.logger.log(
      `Contact ${contactId} unsubscribed from tenant ${tenantId}`,
    );

    return { success: true, email: contact.email };
  }

  buildUnsubscribeUrl(tenantId: string, contactId: string): string {
    const token = this.buildUnsubscribeToken(tenantId, contactId);
    return `${this.frontendUrl}/unsubscribe?token=${token}`;
  }

  injectUnsubscribeLink(htmlContent: string, unsubscribeUrl: string): string {
    const footer =
      '<div style="text-align:center;font-size:11px;color:#999;padding:20px">' +
      `<a href="${unsubscribeUrl}" style="color:#999">Se desabonner</a>` +
      '</div>';

    if (htmlContent.includes('</body>')) {
      return htmlContent.replace('</body>', `${footer}</body>`);
    }

    return htmlContent + footer;
  }
}
