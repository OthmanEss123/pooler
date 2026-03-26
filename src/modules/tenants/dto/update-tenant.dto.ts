import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;
}
