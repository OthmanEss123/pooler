export type DeliverabilityStatus = 'good' | 'warning' | 'critical';

export interface BounceRateResult {
  rate: number;
  bounced: number;
  sent: number;
  status: DeliverabilityStatus;
}

export interface ComplaintRateResult {
  rate: number;
  complained: number;
  sent: number;
  status: DeliverabilityStatus;
}

export interface DeliverabilityReport {
  bounceRate: BounceRateResult;
  complaintRate: ComplaintRateResult;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  period: number;
  alerts: string[];
}
