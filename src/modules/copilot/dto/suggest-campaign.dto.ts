import { IsString, MinLength } from 'class-validator';

export class SuggestCampaignDto {
  @IsString()
  @MinLength(3)
  goal!: string;
}
