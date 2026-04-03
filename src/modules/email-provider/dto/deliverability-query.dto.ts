import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class DeliverabilityQueryDto {
  @Transform(({ value }) => Number(value ?? 7))
  @IsInt()
  @Min(1)
  @Max(90)
  days = 7;
}
