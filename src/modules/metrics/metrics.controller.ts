import { Controller, ForbiddenException, Get, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailEventType } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma/prisma.service';
import { QueueHealthService } from '../../queue/queue-health.service';

@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly queueHealthService: QueueHealthService,
  ) {}

  @Get()
  async getMetrics(@Headers('x-metrics-token') token?: string) {
    const expectedToken =
      this.configService.get<string>('monitoring.metricsToken') ||
      this.configService.get<string>('METRICS_TOKEN');

    if (!expectedToken || token !== expectedToken) {
      throw new ForbiddenException('Invalid metrics token');
    }

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const queueStats = await this.queueHealthService.getStats();

    const [activeTenants, totalContacts, sentCampaigns30d, sentEmails30d] =
      await Promise.all([
        this.prisma.tenant.count({
          where: { isActive: true },
        }),
        this.prisma.contact.count(),
        this.prisma.campaign.count({
          where: { sentAt: { gte: since30d } },
        }),
        this.prisma.emailEvent.count({
          where: {
            type: EmailEventType.SENT,
            createdAt: { gte: since30d },
          },
        }),
      ]);

    return {
      timestamp: new Date().toISOString(),
      tenantsActive: activeTenants,
      contactsTotal: totalContacts,
      campaignsSent30d: sentCampaigns30d,
      emailsSent30d: sentEmails30d,
      jobsWaiting: queueStats.campaign.waiting + queueStats.email.waiting,
      jobsFailed: queueStats.campaign.failed + queueStats.email.failed,
    };
  }
}
