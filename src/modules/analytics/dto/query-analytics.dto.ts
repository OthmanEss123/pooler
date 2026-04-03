import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryAnalyticsDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month';

  @IsOptional()
  @IsString()
  campaignId?: string;
}
