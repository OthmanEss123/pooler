import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SegmentType } from '@prisma/client';

export class CreateSegmentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(SegmentType)
  type!: SegmentType;

  @IsOptional()
  conditions?: any;
}
