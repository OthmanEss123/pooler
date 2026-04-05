import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdGroupDto {
  @IsString()
  campaignExternalId!: string;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  cpcBidMicros?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @IsString()
  @IsOptional()
  finalUrl?: string;

  @IsString()
  @IsOptional()
  headline1?: string;

  @IsString()
  @IsOptional()
  headline2?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
