export type SegmentType = "DYNAMIC" | "STATIC" | "GA4";

export type Segment = {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  type: SegmentType;
  conditions: Record<string, any>;
  contactCount: number;
  lastSyncAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
