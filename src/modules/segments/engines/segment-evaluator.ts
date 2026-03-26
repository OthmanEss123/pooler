import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailStatus, Prisma } from '@prisma/client';
import {
  SegmentConditionGroup,
  SegmentRule,
  SegmentRuleField,
  SegmentRuleOperator,
} from '../types/segment.types';

@Injectable()
export class SegmentEvaluator {
  buildWhere(
    tenantId: string,
    conditions: SegmentConditionGroup,
  ): Prisma.ContactWhereInput {
    this.validateConditions(conditions);

    const nestedWhere = this.buildGroup(conditions);

    return {
      tenantId,
      ...nestedWhere,
    };
  }

  validateConditions(conditions: SegmentConditionGroup): void {
    if (!conditions || typeof conditions !== 'object') {
      throw new BadRequestException('Conditions are required.');
    }

    if (!['AND', 'OR'].includes(conditions.operator)) {
      throw new BadRequestException('Root operator must be AND or OR.');
    }

    if (!Array.isArray(conditions.rules) || conditions.rules.length === 0) {
      throw new BadRequestException(
        'Conditions.rules must be a non-empty array.',
      );
    }

    this.validateGroup(conditions);
  }

  private validateGroup(group: SegmentConditionGroup): void {
    if (!['AND', 'OR'].includes(group.operator)) {
      throw new BadRequestException('Invalid logical operator.');
    }

    if (!Array.isArray(group.rules) || group.rules.length === 0) {
      throw new BadRequestException(
        'Each group must contain at least one rule.',
      );
    }

    for (const item of group.rules) {
      if (this.isGroup(item)) {
        this.validateGroup(item);
      } else {
        this.validateRule(item);
      }
    }
  }

  private validateRule(rule: SegmentRule): void {
    const allowedFields: SegmentRuleField[] = [
      'emailStatus',
      'totalRevenue',
      'totalOrders',
      'firstOrderAt',
      'lastOrderAt',
      'rfmSegment',
    ];

    const allowedOperatorsByField: Record<
      SegmentRuleField,
      SegmentRuleOperator[]
    > = {
      emailStatus: ['eq', 'neq', 'in'],
      totalRevenue: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'],
      totalOrders: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'],
      firstOrderAt: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'],
      lastOrderAt: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'],
      rfmSegment: ['eq', 'in', 'neq'],
    };

    if (!allowedFields.includes(rule.field)) {
      throw new BadRequestException(`Unsupported field: ${rule.field}`);
    }

    if (!allowedOperatorsByField[rule.field].includes(rule.operator)) {
      throw new BadRequestException(
        `Unsupported operator "${rule.operator}" for field "${rule.field}"`,
      );
    }

    if (rule.operator === 'in' && !Array.isArray(rule.value)) {
      throw new BadRequestException('Operator "in" requires an array value.');
    }
  }

  private buildGroup(group: SegmentConditionGroup): Prisma.ContactWhereInput {
    const children = group.rules.map((item) => {
      if (this.isGroup(item)) {
        return this.buildGroup(item);
      }

      return this.buildRule(item);
    });

    if (group.operator === 'AND') {
      return { AND: children };
    }

    return { OR: children };
  }

  private buildRule(rule: SegmentRule): Prisma.ContactWhereInput {
    switch (rule.field) {
      case 'emailStatus':
        return this.buildEmailStatusRule(rule);

      case 'totalRevenue':
        return this.buildDecimalRule('totalRevenue', rule);

      case 'totalOrders':
        return this.buildNumberRule('totalOrders', rule);

      case 'firstOrderAt':
        return this.buildDateRule('firstOrderAt', rule);

      case 'lastOrderAt':
        return this.buildDateRule('lastOrderAt', rule);

      case 'rfmSegment':
        return this.buildRfmSegmentRule(rule);
    }

    throw new BadRequestException('Unhandled segment field.');
  }

  private buildEmailStatusRule(rule: SegmentRule): Prisma.ContactWhereInput {
    if (rule.operator === 'in') {
      const values = this.toEmailStatusList(rule.value);

      return {
        emailStatus: {
          in: values,
        },
      };
    }

    const value = this.toEmailStatus(rule.value);

    if (rule.operator === 'eq') {
      return { emailStatus: value };
    }

    if (rule.operator === 'neq') {
      return { NOT: { emailStatus: value } };
    }

    throw new BadRequestException(
      `Invalid operator for emailStatus: ${rule.operator}`,
    );
  }

  private buildDecimalRule(
    field: 'totalRevenue',
    rule: SegmentRule,
  ): Prisma.ContactWhereInput {
    const value = new Prisma.Decimal(Number(rule.value));

    switch (rule.operator) {
      case 'eq':
        return { [field]: value };

      case 'neq':
        return { NOT: { [field]: value } };

      case 'gt':
        return { [field]: { gt: value } };

      case 'gte':
        return { [field]: { gte: value } };

      case 'lt':
        return { [field]: { lt: value } };

      case 'lte':
        return { [field]: { lte: value } };

      default:
        throw new BadRequestException(
          `Invalid operator for ${field}: ${rule.operator}`,
        );
    }
  }

  private buildNumberRule(
    field: 'totalOrders',
    rule: SegmentRule,
  ): Prisma.ContactWhereInput {
    const value = Number(rule.value);

    switch (rule.operator) {
      case 'eq':
        return { [field]: value };

      case 'neq':
        return { NOT: { [field]: value } };

      case 'gt':
        return { [field]: { gt: value } };

      case 'gte':
        return { [field]: { gte: value } };

      case 'lt':
        return { [field]: { lt: value } };

      case 'lte':
        return { [field]: { lte: value } };

      default:
        throw new BadRequestException(
          `Invalid operator for ${field}: ${rule.operator}`,
        );
    }
  }

  private buildDateRule(
    field: 'firstOrderAt' | 'lastOrderAt',
    rule: SegmentRule,
  ): Prisma.ContactWhereInput {
    const value = new Date(String(rule.value));

    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException(`Invalid date for field "${field}"`);
    }

    switch (rule.operator) {
      case 'eq':
        return { [field]: value };

      case 'neq':
        return { NOT: { [field]: value } };

      case 'gt':
        return { [field]: { gt: value } };

      case 'gte':
        return { [field]: { gte: value } };

      case 'lt':
        return { [field]: { lt: value } };

      case 'lte':
        return { [field]: { lte: value } };

      default:
        throw new BadRequestException(
          `Invalid operator for ${field}: ${rule.operator}`,
        );
    }
  }

  private buildRfmSegmentRule(rule: SegmentRule): Prisma.ContactWhereInput {
    if (rule.operator === 'eq') {
      return {
        healthScore: {
          path: ['segment'],
          equals: rule.value as string,
        },
      };
    }

    if (rule.operator === 'neq') {
      return {
        NOT: {
          healthScore: {
            path: ['segment'],
            equals: rule.value as string,
          },
        },
      };
    }

    if (rule.operator === 'in') {
      const values = rule.value as string[];

      return {
        OR: values.map((value) => ({
          healthScore: {
            path: ['segment'],
            equals: value,
          },
        })),
      };
    }

    throw new BadRequestException(
      `Invalid operator for rfmSegment: ${rule.operator}`,
    );
  }

  private toEmailStatus(value: SegmentRule['value']): EmailStatus {
    if (typeof value !== 'string' || !(value in EmailStatus)) {
      throw new BadRequestException('Invalid email status value.');
    }

    return EmailStatus[value as keyof typeof EmailStatus];
  }

  private toEmailStatusList(value: SegmentRule['value']): EmailStatus[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Email status list must be an array.');
    }

    return value.map((item) => this.toEmailStatus(item));
  }

  private isGroup(
    value: SegmentRule | SegmentConditionGroup,
  ): value is SegmentConditionGroup {
    return 'rules' in value && Array.isArray(value.rules);
  }
}
