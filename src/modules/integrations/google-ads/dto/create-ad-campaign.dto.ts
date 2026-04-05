import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum AdCampaignTypeDto {
  SEARCH = 'SEARCH',
  SHOPPING = 'SHOPPING',
  PERFORMANCE_MAX = 'PERFORMANCE_MAX',
  DISPLAY = 'DISPLAY',
  VIDEO = 'VIDEO',
}

export class CreateAdCampaignDto {
  @IsString()
  name!: string;

  @IsEnum(AdCampaignTypeDto)
  type!: AdCampaignTypeDto;

  @IsNumber()
  @Min(1)
  budgetDailyMicros!: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @IsString()
  @IsOptional()
  targetUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  audienceSegmentIds?: string[];

  @IsString()
  @IsOptional()
  targetCountry?: string;

  @IsString()
  @IsOptional()
  targetLanguage?: string;
}
