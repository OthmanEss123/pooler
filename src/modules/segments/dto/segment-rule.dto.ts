import { IsDefined, IsIn, IsString } from 'class-validator';
import type {
  SegmentRule,
  SegmentRuleField,
  SegmentRuleOperator,
} from '../types/segment.types';

const SEGMENT_RULE_FIELDS: SegmentRuleField[] = [
  'emailStatus',
  'totalRevenue',
  'totalOrders',
  'firstOrderAt',
  'lastOrderAt',
  'rfmSegment',
];

const SEGMENT_RULE_OPERATORS: SegmentRuleOperator[] = [
  'eq',
  'neq',
  'in',
  'gt',
  'gte',
  'lt',
  'lte',
];

export class SegmentRuleDto implements SegmentRule {
  @IsString()
  @IsIn(SEGMENT_RULE_FIELDS)
  field!: SegmentRuleField;

  @IsString()
  @IsIn(SEGMENT_RULE_OPERATORS)
  operator!: SegmentRuleOperator;

  @IsDefined()
  value!: SegmentRule['value'];
}
