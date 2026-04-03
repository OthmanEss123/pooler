import { IsNotEmpty, IsString } from 'class-validator';

export class ConnectGoogleAdsDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @IsString()
  @IsNotEmpty()
  customerId!: string;
}
