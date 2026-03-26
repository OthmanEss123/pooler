import { IsDateString } from 'class-validator';

export class ScheduleCampaignDto {
  @IsDateString()
  scheduledAt: string;
}
