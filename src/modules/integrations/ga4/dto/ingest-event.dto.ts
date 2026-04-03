import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class IngestEventDto {
  @IsString()
  @IsNotEmpty()
  eventName!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionCount?: number;

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

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
