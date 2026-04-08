import { IsString, Length } from 'class-validator';

export class DisableMfaDto {
  @IsString()
  @Length(6, 12)
  token!: string;

  @IsString()
  password!: string;
}
