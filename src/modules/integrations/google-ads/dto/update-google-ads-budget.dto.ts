import { IsInt, Min } from 'class-validator';

export class UpdateGoogleAdsBudgetDto {
  @IsInt()
  @Min(1)
  budgetMicros!: number;
}
