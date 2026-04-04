import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { SegmentType } from '@prisma/client';

export class CreateSegmentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(SegmentType)
  type!: SegmentType;

  @IsObject()
  conditions!: Record<string, unknown>;
}
