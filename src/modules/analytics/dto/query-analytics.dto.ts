import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryAnalyticsDto {
  @IsString()
  @Transform(({ value }) => {
    if (!value) return value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `${value}T00:00:00.000Z`;
    }
    return value;
  })
  from: string;

  @IsString()
  @Transform(({ value }) => {
    if (!value) return value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `${value}T23:59:59.000Z`;
    }
    return value;
  })
  to: string;

  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month';

  @IsOptional()
  @IsString()
  campaignId?: string;
}
