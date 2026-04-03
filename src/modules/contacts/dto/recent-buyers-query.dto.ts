import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class RecentBuyersQueryDto {
  @Transform(({ value }) => Number(value ?? 30))
  @IsInt()
  @Min(1)
  @Max(90)
  days = 30;
}
