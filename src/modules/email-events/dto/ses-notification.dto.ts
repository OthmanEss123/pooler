/**
 * Simplified types for SNS → SES event notifications.
 * Real payloads have more fields; we only type what we use.
 */

export interface SesMailTag {
  name: string;
  value: string[];
}

export interface SesMail {
  messageId: string;
  tags?: SesMailTag[];
}

export interface SesBounce {
  bounceType: string;
}

export interface SesComplaint {
  complaintFeedbackType?: string;
}

export interface SesNotificationPayload {
  notificationType: string;
  eventType?: string;
  mail: SesMail;
  bounce?: SesBounce;
  complaint?: SesComplaint;
}

export interface SnsMessage {
  Type: string;
  TopicArn?: string;
  SubscribeURL?: string;
  Message: string;
  MessageId?: string;
}
