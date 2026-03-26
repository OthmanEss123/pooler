import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateAbTestDto {
  @IsString()
  @IsNotEmpty()
  variantName: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  htmlContent: string;

  @IsInt()
  @Min(5)
  @Max(50)
  splitPercent: number;
}
