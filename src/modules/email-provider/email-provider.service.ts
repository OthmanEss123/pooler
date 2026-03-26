import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESClient,
  SendEmailCommand,
  type SendEmailCommandInput,
} from '@aws-sdk/client-ses';

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

  constructor(private readonly config: ConfigService) {
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
    const source = `${payload.fromName} <${payload.fromEmail || this.defaultFrom}>`;

    const tags = payload.tags
      ? Object.entries(payload.tags).map(([Name, Value]) => ({ Name, Value }))
      : [];

    const input: SendEmailCommandInput = {
      Source: source,
      Destination: {
        ToAddresses: [payload.to],
      },
      Message: {
        Subject: { Data: payload.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: payload.htmlBody, Charset: 'UTF-8' },
          ...(payload.textBody
            ? { Text: { Data: payload.textBody, Charset: 'UTF-8' } }
            : {}),
        },
      },
      ...(payload.replyTo ? { ReplyToAddresses: [payload.replyTo] } : {}),
      ...(this.configSetName
        ? { ConfigurationSetName: this.configSetName }
        : {}),
      Tags: tags,
    };

    const command = new SendEmailCommand(input);
    const response = await this.sesClient.send(command);

    const messageId = response.MessageId ?? 'unknown';

    this.logger.debug(`Email sent to=${payload.to} messageId=${messageId}`);

    return {
      messageId,
      provider: 'ses',
    };
  }
}
