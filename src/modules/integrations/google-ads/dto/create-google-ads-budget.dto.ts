import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateGoogleAdsBudgetDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(1)
  amountMicros!: number;

  @IsString()
  @IsOptional()
  deliveryMethod?: string;
}
