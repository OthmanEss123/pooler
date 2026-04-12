import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingPlan,
  BillingSubscriptionStatus,
  InsightType,
  Prisma,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma/prisma.service';

const PLAN_LIMITS: Record<
  BillingPlan,
  {
    name: string;
    contactLimit: number;
  }
> = {
  STARTER: {
    name: 'Starter',
    contactLimit: 1000,
  },
  GROWTH: {
    name: 'Growth',
    contactLimit: 10000,
  },
  SCALE: {
    name: 'Scale',
    contactLimit: 100000,
  },
};

type StripeCustomerRef = string | { id: string };

type StripePaymentIntentPayload = {
  client_secret?: string | null;
};

type StripeInvoiceWithPaymentIntent = {
  payment_intent?: StripePaymentIntentPayload | string | null;
};

type StripeSubscriptionPayload = {
  id: string;
  status: string;
  customer: StripeCustomerRef;
  cancel_at_period_end: boolean;
  current_period_start?: number | null;
  current_period_end?: number | null;
  metadata?: Record<string, string | undefined>;
  items: {
    data: Array<{
      price?: {
        id?: string | null;
      } | null;
    }>;
  };
  latest_invoice?: StripeInvoiceWithPaymentIntent | string | null;
};

type StripeInvoicePayload = {
  id: string;
  customer?: StripeCustomerRef | null;
  subscription?: string | { id: string } | null;
  amount_due?: number | null;
  amount_paid?: number;
  currency?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  created?: number;
};

type StripeWebhookEvent = {
  type: string;
  data: {
    object: unknown;
  };
};

type BillingUsage = {
  plan: BillingPlan;
  status: BillingSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  contacts: {
    used: number;
    limit: number;
    percent: number;
  };
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe.Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.stripe = Stripe(
      this.configService.get<string>('stripe.secretKey', ''),
    );
  }

  getPlans() {
    return (Object.keys(PLAN_LIMITS) as BillingPlan[]).map((plan) => ({
      plan,
      name: PLAN_LIMITS[plan].name,
      priceId: this.getPriceId(plan),
      contactLimit: PLAN_LIMITS[plan].contactLimit,
    }));
  }

  async getOrCreateCustomer(tenantId: string) {
    const subscription = await this.getOrCreateLocalSubscription(tenantId);

    if (subscription.stripeCustomerId) {
      return subscription.stripeCustomerId;
    }

    const ownerEmail = await this.getOwnerEmail(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const stripeCustomerId = this.isStripeMockEnabled()
      ? `cus_mock_${tenantId}`
      : (
          await this.stripe.customers.create({
            email: ownerEmail ?? undefined,
            name: tenant?.name ?? tenantId,
            metadata: {
              tenantId,
            },
          })
        ).id;

    await this.prisma.$transaction([
      this.prisma.billingSubscription.update({
        where: { tenantId },
        data: { stripeCustomerId },
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          plan: subscription.plan,
          planStatus: subscription.status,
        },
      }),
    ]);

    return stripeCustomerId;
  }

  async subscribe(tenantId: string, plan: BillingPlan) {
    const current = await this.getOrCreateLocalSubscription(tenantId);
    const blockingStatuses: BillingSubscriptionStatus[] = [
      BillingSubscriptionStatus.ACTIVE,
      BillingSubscriptionStatus.TRIALING,
      BillingSubscriptionStatus.PAST_DUE,
      BillingSubscriptionStatus.INCOMPLETE,
    ];

    if (
      current.stripeSubscriptionId &&
      blockingStatuses.includes(current.status)
    ) {
      throw new BadRequestException('Un abonnement Stripe actif existe deja');
    }

    const customerId = await this.getOrCreateCustomer(tenantId);
    const priceId = this.getPriceId(plan);

    if (this.isStripeMockEnabled()) {
      const mockSubscriptionId = `sub_mock_${tenantId}_${plan.toLowerCase()}`;

      await this.syncSubscriptionRecord(tenantId, {
        plan,
        status: BillingSubscriptionStatus.ACTIVE,
        stripeCustomerId: customerId,
        stripeSubscriptionId: mockSubscriptionId,
        stripePriceId: priceId,
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date(),
        currentPeriodEnd: this.daysFromNow(30),
      });

      return {
        subscriptionId: mockSubscriptionId,
        clientSecret: `seti_mock_${tenantId}_${plan.toLowerCase()}`,
      };
    }

    const subscription = (await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        tenantId,
        plan,
      },
      expand: ['latest_invoice.payment_intent'],
    })) as unknown as StripeSubscriptionPayload;

    const invoice =
      subscription.latest_invoice &&
      typeof subscription.latest_invoice !== 'string'
        ? subscription.latest_invoice
        : null;
    const paymentIntent =
      invoice?.payment_intent && typeof invoice.payment_intent !== 'string'
        ? invoice.payment_intent
        : null;

    await this.syncSubscriptionRecord(tenantId, {
      plan,
      status: this.mapStripeStatus(subscription.status),
      stripeCustomerId: this.resolveCustomerId(subscription.customer),
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price?.id ?? null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: this.fromUnix(subscription.current_period_start),
      currentPeriodEnd: this.fromUnix(subscription.current_period_end),
    });

    return {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret ?? null,
    };
  }

  async cancelSubscription(tenantId: string) {
    const subscription = await this.getOrCreateLocalSubscription(tenantId);

    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('Aucun abonnement Stripe actif');
    }

    if (this.isStripeMockEnabled()) {
      return this.syncSubscriptionRecord(tenantId, {
        plan: subscription.plan,
        status: subscription.status,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripePriceId: subscription.stripePriceId,
        cancelAtPeriodEnd: true,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
    }

    const updated = (await this.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      },
    )) as unknown as StripeSubscriptionPayload;

    return this.syncSubscriptionRecord(tenantId, {
      plan: subscription.plan,
      status: this.mapStripeStatus(updated.status),
      stripeCustomerId: this.resolveCustomerId(updated.customer),
      stripeSubscriptionId: updated.id,
      stripePriceId: subscription.stripePriceId,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      currentPeriodStart: this.fromUnix(updated.current_period_start),
      currentPeriodEnd: this.fromUnix(updated.current_period_end),
    });
  }

  async reactivate(tenantId: string) {
    const subscription = await this.getOrCreateLocalSubscription(tenantId);

    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('Aucun abonnement Stripe actif');
    }

    if (this.isStripeMockEnabled()) {
      return this.syncSubscriptionRecord(tenantId, {
        plan: subscription.plan,
        status: BillingSubscriptionStatus.ACTIVE,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripePriceId: subscription.stripePriceId,
        cancelAtPeriodEnd: false,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
    }

    const updated = (await this.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
      },
    )) as unknown as StripeSubscriptionPayload;

    return this.syncSubscriptionRecord(tenantId, {
      plan: subscription.plan,
      status: this.mapStripeStatus(updated.status),
      stripeCustomerId: this.resolveCustomerId(updated.customer),
      stripeSubscriptionId: updated.id,
      stripePriceId: subscription.stripePriceId,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      currentPeriodStart: this.fromUnix(updated.current_period_start),
      currentPeriodEnd: this.fromUnix(updated.current_period_end),
    });
  }

  async getPortalUrl(tenantId: string, returnUrl?: string) {
    const customerId = await this.getOrCreateCustomer(tenantId);
    const safeReturnUrl =
      returnUrl || this.configService.get<string>('app.frontendUrl', '');

    if (this.isStripeMockEnabled()) {
      return {
        url: `${safeReturnUrl || 'http://localhost:3001'}/billing/portal?customer=${customerId}`,
      };
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: safeReturnUrl,
    });

    return {
      url: session.url,
    };
  }

  async getUsage(tenantId: string): Promise<BillingUsage> {
    const subscription = await this.getOrCreateLocalSubscription(tenantId);
    const planLimits = PLAN_LIMITS[subscription.plan];
    const contactsUsed = await this.prisma.contact.count({
      where: { tenantId },
    });

    return {
      plan: subscription.plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      contacts: {
        used: contactsUsed,
        limit: planLimits.contactLimit,
        percent: this.computePercent(contactsUsed, planLimits.contactLimit),
      },
    };
  }

  async getInvoices(tenantId: string) {
    const subscription = await this.getOrCreateLocalSubscription(tenantId);

    if (!subscription.stripeCustomerId) {
      return [];
    }

    if (this.isStripeMockEnabled()) {
      return subscription.stripeSubscriptionId
        ? [
            {
              id: `in_mock_${tenantId}`,
              status: 'paid',
              amountPaid: 0,
              currency: 'usd',
              hostedInvoiceUrl: null,
              invoicePdf: null,
              createdAt: subscription.updatedAt,
            },
          ]
        : [];
    }

    const invoices = (await this.stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: 12,
    })) as unknown as { data: StripeInvoicePayload[] };

    return invoices.data.map((invoice: StripeInvoicePayload) => ({
      id: invoice.id,
      status:
        'status' in invoice ? (invoice as { status?: string }).status : null,
      amountPaid: (invoice.amount_paid ?? 0) / 100,
      currency: invoice.currency ?? 'usd',
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
      createdAt: this.fromUnix(invoice.created ?? null),
    }));
  }

  async handleWebhook(rawBody: Buffer, signature?: string) {
    if (!signature) {
      throw new BadRequestException('Signature Stripe manquante');
    }

    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.configService.get<string>('stripe.webhookSecret', ''),
    ) as StripeWebhookEvent;

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await this.handleSubscriptionUpsert(
          event.data.object as StripeSubscriptionPayload,
        );
        break;
      }
      case 'customer.subscription.deleted': {
        await this.handleSubscriptionDeleted(
          event.data.object as StripeSubscriptionPayload,
        );
        break;
      }
      case 'invoice.payment_failed': {
        await this.handlePaymentFailed(
          event.data.object as StripeInvoicePayload,
        );
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event ${event.type}`);
        break;
    }

    return { received: true };
  }

  private async handleSubscriptionUpsert(
    subscription: StripeSubscriptionPayload,
  ) {
    const tenantId = await this.resolveTenantId(subscription);

    if (!tenantId) {
      this.logger.warn(
        `Stripe subscription ${subscription.id} ignored: tenantId introuvable`,
      );
      return;
    }

    const plan = this.resolvePlanFromStripeSubscription(subscription);

    await this.syncSubscriptionRecord(tenantId, {
      plan,
      status: this.mapStripeStatus(subscription.status),
      stripeCustomerId: this.resolveCustomerId(subscription.customer),
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price?.id ?? null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: this.fromUnix(subscription.current_period_start),
      currentPeriodEnd: this.fromUnix(subscription.current_period_end),
    });
  }

  private async handleSubscriptionDeleted(
    subscription: StripeSubscriptionPayload,
  ) {
    const tenantId = await this.resolveTenantId(subscription);

    if (!tenantId) {
      return;
    }

    const current = await this.getOrCreateLocalSubscription(tenantId);

    await this.syncSubscriptionRecord(tenantId, {
      plan: BillingPlan.STARTER,
      status: BillingSubscriptionStatus.CANCELED,
      stripeCustomerId: this.resolveCustomerId(subscription.customer),
      stripeSubscriptionId: null,
      stripePriceId: null,
      cancelAtPeriodEnd: false,
      currentPeriodStart: current.currentPeriodStart,
      currentPeriodEnd: this.fromUnix(subscription.current_period_end),
    });
  }

  private async handlePaymentFailed(invoice: StripeInvoicePayload) {
    const customerId = invoice.customer
      ? this.resolveCustomerId(invoice.customer)
      : null;

    if (!customerId) {
      return;
    }

    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        stripeCustomerId: customerId,
      },
    });

    if (!subscription) {
      return;
    }

    const existing = await this.prisma.insight.findFirst({
      where: {
        tenantId: subscription.tenantId,
        type: InsightType.ANOMALY,
        title: 'Paiement echoue',
        createdAt: {
          gte: this.hoursAgo(24),
        },
      },
    });

    if (existing) {
      return;
    }

    await this.prisma.insight.create({
      data: {
        tenantId: subscription.tenantId,
        type: InsightType.ANOMALY,
        title: 'Paiement echoue',
        description:
          'Le dernier paiement Stripe a echoue. Verifier la carte ou la facturation.',
        data: {
          invoiceId: invoice.id,
          subscriptionId:
            typeof invoice.subscription === 'string'
              ? invoice.subscription
              : (invoice.subscription?.id ?? null),
          amountDue: (invoice.amount_due ?? 0) / 100,
          currency: invoice.currency ?? 'usd',
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async resolveTenantId(subscription: StripeSubscriptionPayload) {
    const metadataTenantId = subscription.metadata?.tenantId;

    if (metadataTenantId) {
      return metadataTenantId;
    }

    const customerId = this.resolveCustomerId(subscription.customer);
    const local = await this.prisma.billingSubscription.findFirst({
      where: {
        OR: [
          { stripeSubscriptionId: subscription.id },
          { stripeCustomerId: customerId },
        ],
      },
    });

    return local?.tenantId ?? null;
  }

  private resolvePlanFromStripeSubscription(
    subscription: StripeSubscriptionPayload,
  ) {
    const metadataPlan = subscription.metadata?.plan;

    if (metadataPlan && metadataPlan in PLAN_LIMITS) {
      return metadataPlan as BillingPlan;
    }

    const priceId = subscription.items.data[0]?.price?.id ?? '';
    return this.resolvePlanByPriceId(priceId);
  }

  private mapStripeStatus(status: string): BillingSubscriptionStatus {
    switch (status) {
      case 'trialing':
        return BillingSubscriptionStatus.TRIALING;
      case 'past_due':
      case 'paused':
        return BillingSubscriptionStatus.PAST_DUE;
      case 'incomplete':
      case 'incomplete_expired':
        return BillingSubscriptionStatus.INCOMPLETE;
      case 'canceled':
        return BillingSubscriptionStatus.CANCELED;
      case 'unpaid':
        return BillingSubscriptionStatus.UNPAID;
      case 'active':
      default:
        return BillingSubscriptionStatus.ACTIVE;
    }
  }

  private async getOwnerEmail(tenantId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return (
      memberships.find((membership) => membership.role === 'OWNER')?.user
        .email ??
      memberships[0]?.user.email ??
      null
    );
  }

  private async getOrCreateLocalSubscription(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        plan: true,
        planStatus: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant introuvable');
    }

    return this.prisma.billingSubscription.upsert({
      where: { tenantId },
      update: {},
      create: {
        tenantId,
        plan: tenant.plan,
        status: tenant.planStatus,
      },
    });
  }

  private async syncSubscriptionRecord(
    tenantId: string,
    data: {
      plan: BillingPlan;
      status: BillingSubscriptionStatus;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      stripePriceId?: string | null;
      cancelAtPeriodEnd: boolean;
      currentPeriodStart?: Date | null;
      currentPeriodEnd?: Date | null;
    },
  ) {
    const [subscription] = await this.prisma.$transaction([
      this.prisma.billingSubscription.upsert({
        where: { tenantId },
        update: {
          plan: data.plan,
          status: data.status,
          stripeCustomerId: data.stripeCustomerId ?? null,
          stripeSubscriptionId: data.stripeSubscriptionId ?? null,
          stripePriceId: data.stripePriceId ?? null,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
          currentPeriodStart: data.currentPeriodStart ?? null,
          currentPeriodEnd: data.currentPeriodEnd ?? null,
        },
        create: {
          tenantId,
          plan: data.plan,
          status: data.status,
          stripeCustomerId: data.stripeCustomerId ?? null,
          stripeSubscriptionId: data.stripeSubscriptionId ?? null,
          stripePriceId: data.stripePriceId ?? null,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
          currentPeriodStart: data.currentPeriodStart ?? null,
          currentPeriodEnd: data.currentPeriodEnd ?? null,
        },
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          plan: data.plan,
          planStatus: data.status,
        },
      }),
    ]);

    return subscription;
  }

  private resolvePlanByPriceId(priceId: string) {
    if (priceId === this.getPriceId(BillingPlan.GROWTH)) {
      return BillingPlan.GROWTH;
    }

    if (priceId === this.getPriceId(BillingPlan.SCALE)) {
      return BillingPlan.SCALE;
    }

    return BillingPlan.STARTER;
  }

  private getPriceId(plan: BillingPlan) {
    switch (plan) {
      case BillingPlan.GROWTH:
        return this.configService.get<string>('stripe.growthPriceId', '');
      case BillingPlan.SCALE:
        return this.configService.get<string>('stripe.scalePriceId', '');
      case BillingPlan.STARTER:
      default:
        return this.configService.get<string>('stripe.starterPriceId', '');
    }
  }

  private computePercent(used: number, limit: number) {
    if (limit <= 0) {
      return 0;
    }

    return Number(((used / limit) * 100).toFixed(2));
  }

  private fromUnix(timestamp?: number | null) {
    if (!timestamp) {
      return null;
    }

    return new Date(timestamp * 1000);
  }

  private daysFromNow(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private hoursAgo(hours: number) {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  private resolveCustomerId(customer: StripeCustomerRef) {
    return typeof customer === 'string' ? customer : customer.id;
  }

  private isStripeMockEnabled() {
    return (
      (process.env.NODE_ENV ?? 'development') === 'test' ||
      this.configService
        .get<string>('stripe.secretKey', '')
        .startsWith('sk_test_mock')
    );
  }
}
