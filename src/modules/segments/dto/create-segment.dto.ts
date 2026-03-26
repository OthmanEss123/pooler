import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { SegmentType } from '@prisma/client';
import { SegmentConditionDto } from './segment-condition.dto';

export class CreateSegmentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(SegmentType)
  type!: SegmentType;

  @ValidateNested()
  @Type(() => SegmentConditionDto)
  conditions!: SegmentConditionDto;
}
