import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class AskCopilotDto {
  @IsString()
  @MinLength(3)
  question!: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
