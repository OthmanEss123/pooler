import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class QueryOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit? = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset? = 0;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
