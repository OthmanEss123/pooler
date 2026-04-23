import { IsString } from 'class-validator';

export class ConnectGoogleAdsCustomerDto {
  @IsString()
  customerId!: string;
}
