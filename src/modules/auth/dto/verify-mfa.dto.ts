import { IsString, Length } from 'class-validator';

export class VerifyMfaDto {
  @IsString()
  mfaTempToken!: string;

  @IsString()
  @Length(6, 12)
  totpCode!: string;
}
