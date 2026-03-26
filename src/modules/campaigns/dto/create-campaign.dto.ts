import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { CampaignType } from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsOptional()
  @IsString()
  previewText?: string;

  @IsString()
  @IsNotEmpty()
  fromName: string;

  @IsEmail()
  fromEmail: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @IsString()
  @IsNotEmpty()
  htmlContent: string;

  @IsOptional()
  @IsString()
  textContent?: string;

  @IsString()
  @IsNotEmpty()
  segmentId: string;

  @IsOptional()
  @IsEnum(CampaignType)
  type?: CampaignType;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
