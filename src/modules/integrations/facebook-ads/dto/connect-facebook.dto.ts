import { IsString, MinLength } from 'class-validator';

export class ConnectFacebookDto {
  @IsString()
  @MinLength(10)
  tempToken!: string;

  @IsString()
  @MinLength(1)
  adAccountId!: string;
}
