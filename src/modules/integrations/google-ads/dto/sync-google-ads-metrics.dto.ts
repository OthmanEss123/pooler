import { IsDateString } from 'class-validator';

export class SyncGoogleAdsMetricsDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;
}
