import { IsOptional, IsString } from 'class-validator';

export class QueryEmailFunnelDto {
  @IsOptional()
  @IsString()
  campaignId?: string;
}
