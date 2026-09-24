export type ChannelType = 'email' | 'sms' | 'whatsapp';

export type ContactStatus = 'subscribed' | 'unsubscribed' | 'bounced';

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  tags: string[];
  status: ContactStatus;
  consentGiven: boolean;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExcelImportRow {
  name: string;
  email: string;
  phone: string;
  company?: string;
  tags?: string;
}

export interface ValidatedImportRecord {
  rowIndex: number;
  data: {
    name: string;
    email: string;
    phone: string;
    company: string;
    tags: string[];
  };
  isValid: boolean;
  errors: string[];
  isDuplicateInFile?: boolean;
  isExistingInDb?: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  emailSubject: string;
  emailBody: string;
  emailImageUrl?: string;
  smsBody: string;
  smsImageUrl?: string;
  channels: ChannelType[];
  recipientFilter?: {
    type: 'all' | 'tags' | 'company' | 'manual';
    tags?: string[];
    company?: string;
    contactIds?: string[];
  };
  recipientCount: number;
  startDate: string;
  sendTime: string; // e.g. "09:00"
  timezone: string; // e.g. "UTC"
  monthlyRecurrence: boolean;
  dayOfMonth: number; // 1 - 31
  active: boolean;
  lastSentAt?: string;
  nextSendAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecipient {
  id?: string;
  campaignId: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  addedAt: string;
}

export type MessageLogStatus = 'queued' | 'sent' | 'failed' | 'skipped_duplicate';

export interface MessageLog {
  id: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactName: string;
  destination: string;
  channel: ChannelType;
  provider: 'amazon_ses' | 'twilio' | 'simulator';
  providerMessageId?: string;
  monthCycle: string; // e.g. "2026-09"
  status: MessageLogStatus;
  error?: string;
  scheduledAt: string;
  sentAt?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  channel: ChannelType;
  subject?: string;
  content: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSettings {
  id?: string;
  sesRegion: string;
  sesFromEmail: string;
  sesAccessKeyId?: string;
  sesSecretKeyConfigured?: boolean;
  twilioPhone: string;
  twilioWhatsAppNumber: string;
  twilioAccountSid?: string;
  twilioAuthTokenConfigured?: boolean;
  schedulerCron: string;
  rateLimitPerMinute: number;
  simulationMode: boolean;
  updatedAt: string;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'superadmin';
  photoURL?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalContacts: number;
  activeCampaigns: number;
  messagesSent: number;
  failedMessages: number;
  pendingMessages: number;
  skippedDuplicates: number;
}
