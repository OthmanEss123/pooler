export type SegmentLogicalOperator = 'AND' | 'OR';

export type SegmentRuleField =
  | 'emailStatus'
  | 'totalRevenue'
  | 'totalOrders'
  | 'firstOrderAt'
  | 'lastOrderAt'
  | 'rfmSegment';

export type SegmentRuleOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export interface SegmentRule {
  field: SegmentRuleField;
  operator: SegmentRuleOperator;
  value: string | number | string[] | null;
}

export interface SegmentConditionGroup {
  operator: SegmentLogicalOperator;
  rules: Array<SegmentRule | SegmentConditionGroup>;
}
