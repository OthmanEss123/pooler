import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryContactsDto {
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
  @IsString()
  search?: string;
}
