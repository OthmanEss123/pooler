import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum FlowTriggerType {
  POST_PURCHASE = 'post_purchase',
  CONTACT_CREATED = 'contact_created',
  SEGMENT_ENTER = 'segment_enter',
  SEGMENT_EXIT = 'segment_exit',
  ORDER_CREATED = 'order_created',
  MANUAL = 'manual',
}

export enum FlowNodeType {
  SEND_EMAIL = 'send_email',
  WAIT = 'wait',
  CONDITION = 'condition',
  UPDATE_CONTACT = 'update_contact',
  EXIT = 'exit',
}

export class FlowTriggerDto {
  @IsEnum(FlowTriggerType)
  type!: FlowTriggerType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class FlowNodeDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsEnum(FlowNodeType)
  type!: FlowNodeType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  nextId?: string;

  @IsOptional()
  @IsString()
  trueNextId?: string;

  @IsOptional()
  @IsString()
  falseNextId?: string;
}

export class CreateFlowDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @ValidateNested()
  @Type(() => FlowTriggerDto)
  trigger!: FlowTriggerDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowNodeDto)
  nodes!: FlowNodeDto[];
}
