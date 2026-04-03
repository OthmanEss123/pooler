import { IsNotEmpty, IsString } from 'class-validator';

export class SyncGoogleAdsAudienceDto {
  @IsString()
  @IsNotEmpty()
  segmentId!: string;

  @IsString()
  @IsNotEmpty()
  audienceName!: string;
}
