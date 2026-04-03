import { Type } from 'class-transformer';
import { EmailEventType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  revenue?: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
