import { EmailEventType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class TrackEmailEventDto {
  @IsString()
  campaignId: string;

  @IsString()
  contactId: string;

  @IsEnum(EmailEventType)
  type: EmailEventType;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
