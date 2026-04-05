import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export enum AttributionModel {
  LAST_TOUCH = 'last_touch',
  LAST_CLICK = 'last_click',
  FIRST_TOUCH = 'first_touch',
  FIRST_CLICK = 'first_click',
  LINEAR = 'linear',
  TIME_DECAY = 'time_decay',
  POSITION_BASED = 'position_based',
}

export class QueryAttributionDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsEnum(AttributionModel)
  @IsOptional()
  model?: AttributionModel = AttributionModel.LAST_TOUCH;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number = 10;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  lookbackDays?: number = 30;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  emailWindowHours?: number = 72;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  googleWindowDays?: number = 7;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  organicWindowDays?: number = 30;
}
