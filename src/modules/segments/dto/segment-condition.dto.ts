import { ArrayMinSize, IsArray, IsIn } from 'class-validator';
import type {
  SegmentConditionGroup,
  SegmentLogicalOperator,
} from '../types/segment.types';
import { SegmentRuleDto } from './segment-rule.dto';

export class SegmentConditionDto implements SegmentConditionGroup {
  @IsIn(['AND', 'OR'])
  operator!: SegmentLogicalOperator;

  @IsArray()
  @ArrayMinSize(1)
  rules!: Array<SegmentRuleDto | SegmentConditionDto>;
}
