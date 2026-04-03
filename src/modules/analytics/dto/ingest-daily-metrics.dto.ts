import { IsDateString } from 'class-validator';

export class IngestDailyMetricsDto {
  @IsDateString()
  date: string;
}
