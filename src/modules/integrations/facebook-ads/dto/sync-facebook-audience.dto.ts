import { IsString } from 'class-validator';

export class SyncFacebookAudienceDto {
  @IsString()
  segmentId!: string;
}
