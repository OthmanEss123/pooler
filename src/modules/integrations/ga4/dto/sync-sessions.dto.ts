import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class SyncSessionsDto {
  @IsDateString()
  date!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessions!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newContacts?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  revenue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orders?: number;
}
