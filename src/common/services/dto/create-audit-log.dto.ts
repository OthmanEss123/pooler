export class CreateAuditLogDto {
  tenantId!: string;
  userId?: string | null;
  action!: string;
  entity!: string;
  entityId?: string | null;
  metadata!: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}
