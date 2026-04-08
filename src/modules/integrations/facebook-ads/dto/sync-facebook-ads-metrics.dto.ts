import { IsDateString } from 'class-validator';

export class SyncFacebookAdsMetricsDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;
}
