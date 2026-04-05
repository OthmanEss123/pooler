import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESClient,
  SendEmailCommand,
  SendRawEmailCommand,
  type MessageTag,
  type SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import { randomBytes } from 'crypto';
import { UnsubscribeService } from './unsubscribe.service';

export interface SendEmailPayload {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  tags?: Record<string, string>;
  configurationSetName?: string;
  unsubscribeUrl?: string;
}

export interface SendEmailResult {
  messageId: string;
  provider: string;
}

@Injectable()
export class EmailProviderService implements OnModuleInit {
  private readonly logger = new Logger(EmailProviderService.name);
  private sesClient!: SESClient;
  private configSetName: string;
  private defaultFrom: string;
  private readonly isTest = (process.env.NODE_ENV ?? 'development') === 'test';

  constructor(
    private readonly config: ConfigService,
    private readonly unsubscribeService: UnsubscribeService,
  ) {
    this.configSetName = this.config.get<string>(
      'SES_CONFIG_SET',
      'pilot-events',
    );
    this.defaultFrom = this.config.get<string>(
      'SES_FROM_DEFAULT',
      'noreply@pilot.local',
    );
  }

  onModuleInit() {
    if (this.isTest) {
      this.logger.debug(
        'Email provider running in test mode; SES client disabled',
      );
      return;
    }

    const region = this.config.get<string>('AWS_REGION', 'eu-west-1');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.sesClient = new SESClient({
      region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });

    this.logger.log(`SES client initialized (region=${region})`);
  }

  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    if (this.isTest) {
      this.logger.debug(`[TEST] Email simule -> ${payload.to}`);
      return { messageId: `mock-message-id-${Date.now()}`, provider: 'mock' };
    }

    const source = `${payload.fromName} <${payload.fromEmail || this.defaultFrom}>`;
    const configurationSetName =
      payload.configurationSetName ?? this.configSetName;
    const tags = this.buildTags(payload.tags);
    const unsubscribeUrl = payload.unsubscribeUrl;
    const htmlBody = unsubscribeUrl
      ? this.unsubscribeService.injectUnsubscribeLink(
          payload.htmlBody,
          unsubscribeUrl,
        )
      : payload.htmlBody;
    const textBody = unsubscribeUrl
      ? this.appendUnsubscribeText(payload.textBody, unsubscribeUrl)
      : payload.textBody;

    if (unsubscribeUrl) {
      const rawMessage = this.buildRawMessage({
        source,
        to: payload.to,
        subject: payload.subject,
        htmlBody,
        textBody,
        replyTo: payload.replyTo,
        unsubscribeUrl,
      });

      const response = await this.sesClient.send(
        new SendRawEmailCommand({
          Source: source,
          Destinations: [payload.to],
          RawMessage: {
            Data: rawMessage,
          },
          ...(configurationSetName
            ? { ConfigurationSetName: configurationSetName }
            : {}),
          Tags: tags,
        }),
      );

      const messageId = response.MessageId ?? 'unknown';
      this.logger.debug(`Email sent to=${payload.to} messageId=${messageId}`);

      return {
        messageId,
        provider: 'ses',
      };
    }

    const input: SendEmailCommandInput = {
      Source: source,
      Destination: {
        ToAddresses: [payload.to],
      },
      Message: {
        Subject: { Data: payload.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          ...(textBody ? { Text: { Data: textBody, Charset: 'UTF-8' } } : {}),
        },
      },
      ...(payload.replyTo ? { ReplyToAddresses: [payload.replyTo] } : {}),
      ...(configurationSetName
        ? { ConfigurationSetName: configurationSetName }
        : {}),
      Tags: tags,
    };

    const response = await this.sesClient.send(new SendEmailCommand(input));
    const messageId = response.MessageId ?? 'unknown';

    this.logger.debug(`Email sent to=${payload.to} messageId=${messageId}`);

    return {
      messageId,
      provider: 'ses',
    };
  }

  private buildTags(tags?: Record<string, string>): MessageTag[] {
    return tags
      ? Object.entries(tags).map(([Name, Value]) => ({ Name, Value }))
      : [];
  }

  private appendUnsubscribeText(
    textBody: string | undefined,
    unsubscribeUrl: string,
  ): string {
    const footer = `\n\nSe desabonner: ${unsubscribeUrl}`;
    return `${textBody ?? ''}${footer}`.trim();
  }

  private buildRawMessage(params: {
    source: string;
    to: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
    replyTo?: string;
    unsubscribeUrl: string;
  }): Buffer {
    const boundary = `pilot-${randomBytes(12).toString('hex')}`;
    const lines = [
      `From: ${params.source}`,
      `To: ${params.to}`,
      params.replyTo ? `Reply-To: ${params.replyTo}` : null,
      `Subject: ${this.encodeHeader(params.subject)}`,
      `List-Unsubscribe: <${params.unsubscribeUrl}>`,
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      params.textBody ?? this.stripHtml(params.htmlBody),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      params.htmlBody,
      '',
      `--${boundary}--`,
      '',
    ];

    return Buffer.from(lines.filter(Boolean).join('\r\n'), 'utf8');
  }

  private encodeHeader(value: string): string {
    return /^[\x20-\x7E]*$/.test(value)
      ? value
      : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
