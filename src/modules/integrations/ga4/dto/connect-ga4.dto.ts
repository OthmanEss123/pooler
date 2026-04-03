import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConnectGa4Dto {
  @IsString()
  @IsNotEmpty()
  propertyId!: string;

  @IsOptional()
  @IsString()
  measurementId?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;
}
