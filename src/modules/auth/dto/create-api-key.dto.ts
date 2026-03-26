import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiKeyScope } from '@prisma/client';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsEnum(ApiKeyScope)
  scope?: ApiKeyScope;
}
