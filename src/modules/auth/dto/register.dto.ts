import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @ValidateIf((dto: RegisterDto) => !dto.inviteToken)
  @IsString()
  @IsNotEmpty()
  tenantName?: string;

  @ValidateIf((dto: RegisterDto) => !dto.inviteToken)
  @IsString()
  @MinLength(3)
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'tenantSlug must contain only lowercase letters, numbers, and hyphens',
  })
  tenantSlug?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  inviteToken?: string;
}
