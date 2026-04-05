import { BillingPlan } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SubscribeDto {
  @IsEnum(BillingPlan)
  plan!: BillingPlan;
}
