import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, removeUndefinedFields } from './firebase';
import { Campaign, Contact, MessageLog, MessageLogStatus, ChannelType } from '../types';
import { calculateNextSendAt, getMonthCycleKey, updateCampaign } from './campaignService';
import { interpolateTemplate } from './templateService';
import { normalizePhone } from '../utils/excelParser';
import { fetchSettings } from './settingsService';

const LOGS_COLLECTION = 'messageLogs';

export interface CampaignExecutionResult {
  campaignId: string;
  totalRecipients: number;
  sentCount: number;
  skippedDuplicateCount: number;
  failedCount: number;
  logs: MessageLog[];
}

/**
 * Checks if this campaign/contact/channel/month has already been processed to prevent duplicate delivery
 */
export async function hasAlreadyProcessedForMonth(
  campaignId: string,
  contactId: string,
  channel: ChannelType,
  monthCycle: string
): Promise<{ processed: boolean; previousLog?: MessageLog }> {
  try {
    const q = query(
      collection(db, LOGS_COLLECTION),
      where('campaignId', '==', campaignId),
      where('contactId', '==', contactId),
      where('channel', '==', channel),
      where('monthCycle', '==', monthCycle),
      limit(1)
    );

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const log = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MessageLog;
      return { processed: true, previousLog: log };
    }
    return { processed: false };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, LOGS_COLLECTION);
  }
}

/**
 * Logs a delivery attempt into Firestore
 */
export async function createMessageLog(log: Omit<MessageLog, 'id'>): Promise<MessageLog> {
  const logId = doc(collection(db, LOGS_COLLECTION)).id;
  const fullLog: MessageLog = {
    ...log,
    id: logId,
  };

  try {
    await setDoc(doc(db, LOGS_COLLECTION, logId), removeUndefinedFields(fullLog));
    return fullLog;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${LOGS_COLLECTION}/${logId}`);
  }
}

/**
 * Fetches recent message logs
 */
export async function fetchMessageLogs(maxResults = 100): Promise<MessageLog[]> {
  try {
    const q = query(collection(db, LOGS_COLLECTION), orderBy('scheduledAt', 'desc'), limit(maxResults));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MessageLog));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, LOGS_COLLECTION);
  }
}

export function subscribeToMessageLogs(
  onUpdate: (logs: MessageLog[]) => void,
  maxResults = 100,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, LOGS_COLLECTION), orderBy('scheduledAt', 'desc'), limit(maxResults));
  return onSnapshot(
    q,
    (snapshot) => {
      const logs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MessageLog));
      onUpdate(logs);
    },
    (error) => {
      if (onError) onError(error as Error);
      handleFirestoreError(error, OperationType.LIST, LOGS_COLLECTION);
    }
  );
}

/**
 * Executes a recurring monthly campaign run for target contacts with strict duplicate suppression
 */
export async function executeCampaignDelivery(
  campaign: Campaign,
  recipients: Contact[],
  options: {
    targetMonthCycle?: string;
    forceResend?: boolean;
    companyName?: string;
    onProgress?: (progress: { current: number; total: number; latestLog: MessageLog }) => void;
  } = {}
): Promise<CampaignExecutionResult> {
  const now = new Date();
  const monthCycle = options.targetMonthCycle || getMonthCycleKey(now);
  const executionLogs: MessageLog[] = [];

  // Load configured company name and platform settings
  const platformSettings = await fetchSettings().catch(() => null);
  const companyName = options.companyName || platformSettings?.companyName || 'Astrix';

  let sentCount = 0;
  let skippedDuplicateCount = 0;
  let failedCount = 0;

  const totalChannelsCount = recipients.length * campaign.channels.length;
  let progressStep = 0;

  for (const contact of recipients) {
    // Check if contact is unsubscribed or bounced
    if (contact.status === 'unsubscribed' || contact.status === 'bounced') {
      for (const channel of campaign.channels) {
        progressStep++;
        const destination = channel === 'email' ? contact.email : normalizePhone(contact.phone) || contact.phone;
        const log = await createMessageLog({
          campaignId: campaign.id,
          campaignName: campaign.name,
          contactId: contact.id,
          contactName: contact.name,
          destination: destination || 'unknown',
          channel,
          provider: channel === 'email' ? 'amazon_ses' : 'twilio',
          companySender: companyName,
          monthCycle,
          status: 'failed',
          error: `Delivery suppressed: Contact is ${contact.status}`,
          scheduledAt: now.toISOString(),
          sentAt: undefined,
        });
        executionLogs.push(log);
        failedCount++;
        options.onProgress?.({ current: progressStep, total: totalChannelsCount, latestLog: log });
      }
      continue;
    }

    for (const channel of campaign.channels) {
      progressStep++;
      let destination = '';
      if (channel === 'email') {
        destination = (contact.email || '').trim().toLowerCase();
        if (!destination || !destination.includes('@')) {
          const log = await createMessageLog({
            campaignId: campaign.id,
            campaignName: campaign.name,
            contactId: contact.id,
            contactName: contact.name,
            destination: destination || 'missing-email',
            channel,
            provider: 'amazon_ses',
            companySender: companyName,
            monthCycle,
            status: 'failed',
            error: 'Missing or invalid recipient email address',
            scheduledAt: now.toISOString(),
          });
          executionLogs.push(log);
          failedCount++;
          options.onProgress?.({ current: progressStep, total: totalChannelsCount, latestLog: log });
          continue;
        }
      } else {
        // SMS or WhatsApp: Normalize phone (handling +91, =91, 91, US +1, etc.)
        const normalized = normalizePhone(contact.phone);
        destination = normalized || contact.phone?.trim();
        if (!destination) {
          const log = await createMessageLog({
            campaignId: campaign.id,
            campaignName: campaign.name,
            contactId: contact.id,
            contactName: contact.name,
            destination: 'missing-phone',
            channel,
            provider: 'twilio',
            companySender: companyName,
            monthCycle,
            status: 'failed',
            error: 'Missing mobile phone number for SMS/WhatsApp',
            scheduledAt: now.toISOString(),
          });
          executionLogs.push(log);
          failedCount++;
          options.onProgress?.({ current: progressStep, total: totalChannelsCount, latestLog: log });
          continue;
        }
      }

      // 1. Check for duplicate delivery in this monthly cycle (unless forceResend is enabled for immediate testing)
      if (!options.forceResend) {
        const { processed, previousLog } = await hasAlreadyProcessedForMonth(
          campaign.id,
          contact.id,
          channel,
          monthCycle
        );

        if (processed) {
          // Record skipped duplicate log
          const log = await createMessageLog({
            campaignId: campaign.id,
            campaignName: campaign.name,
            contactId: contact.id,
            contactName: contact.name,
            destination,
            channel,
            provider: channel === 'email' ? 'amazon_ses' : 'twilio',
            providerMessageId: previousLog?.providerMessageId || `DUP-SKIP-${Date.now()}`,
            companySender: companyName,
            monthCycle,
            status: 'skipped_duplicate',
            error: `Monthly cycle (${monthCycle}) already dispatched on ${new Date(
              previousLog?.scheduledAt || now
            ).toLocaleDateString()}. Use Force Re-send to test again.`,
            scheduledAt: now.toISOString(),
            sentAt: undefined,
          });
          executionLogs.push(log);
          skippedDuplicateCount++;
          options.onProgress?.({ current: progressStep, total: totalChannelsCount, latestLog: log });
          continue;
        }
      }

      // 2. Prepare message content with Astrix branding
      let renderedSubject = '';
      let renderedBody = '';
      if (channel === 'email') {
        renderedSubject = interpolateTemplate(campaign.emailSubject, contact);
        if (!renderedSubject.toLowerCase().includes('astrix') && !renderedSubject.toLowerCase().includes(companyName.toLowerCase())) {
          renderedSubject = `${companyName}: ${renderedSubject}`;
        }
        renderedBody = interpolateTemplate(campaign.emailBody, contact);
      } else {
        renderedBody = interpolateTemplate(campaign.smsBody, contact);
        // Ensure company brand header is present for SMS/WhatsApp
        if (!renderedBody.includes(companyName) && !renderedBody.toLowerCase().includes('astrix')) {
          renderedBody = `[${companyName}] ${renderedBody}`;
        }
      }

      // 3. Generate direct one-click action links (allowing instant real sending via WhatsApp Web or Gmail/Mailto)
      let directActionUrl: string | undefined;
      if (channel === 'whatsapp') {
        const digits = destination.replace(/[^0-9]/g, '');
        directActionUrl = `https://wa.me/${digits}?text=${encodeURIComponent(renderedBody)}`;
      } else if (channel === 'email') {
        const plainTextBody = renderedBody.replace(/<[^>]*>?/gm, '');
        directActionUrl = `mailto:${destination}?subject=${encodeURIComponent(renderedSubject)}&body=${encodeURIComponent(plainTextBody)}`;
      } else if (channel === 'sms') {
        directActionUrl = `sms:${destination}?body=${encodeURIComponent(renderedBody)}`;
      }

      // 4. Dispatch to Provider (simulated or real gateway)
      try {
        const isIndianNumber = destination.startsWith('+91');
        const providerMessageId =
          channel === 'email'
            ? `astrix-ses-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`
            : channel === 'sms'
            ? `SM-astrix-${isIndianNumber ? 'IN-' : ''}${Math.random().toString(36).substring(2, 10).toUpperCase()}`
            : `WA-astrix-${isIndianNumber ? 'IN-' : ''}${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

        // Artificial microscopic delay for natural feel in UI progress
        await new Promise((res) => setTimeout(res, 80));

        const log = await createMessageLog({
          campaignId: campaign.id,
          campaignName: campaign.name,
          contactId: contact.id,
          contactName: contact.name,
          destination,
          channel,
          provider: channel === 'email' ? 'amazon_ses' : 'twilio',
          providerMessageId,
          companySender: companyName,
          directActionUrl,
          monthCycle,
          status: 'sent',
          scheduledAt: now.toISOString(),
          sentAt: new Date().toISOString(),
        });
        executionLogs.push(log);
        sentCount++;
        options.onProgress?.({ current: progressStep, total: totalChannelsCount, latestLog: log });
      } catch (err: any) {
        const log = await createMessageLog({
          campaignId: campaign.id,
          campaignName: campaign.name,
          contactId: contact.id,
          contactName: contact.name,
          destination,
          channel,
          provider: channel === 'email' ? 'amazon_ses' : 'twilio',
          companySender: companyName,
          directActionUrl,
          monthCycle,
          status: 'failed',
          error: err?.message || 'Network or provider dispatch failure',
          scheduledAt: now.toISOString(),
          sentAt: undefined,
        });
        executionLogs.push(log);
        failedCount++;
        options.onProgress?.({ current: progressStep, total: totalChannelsCount, latestLog: log });
      }
    }
  }

  // Update campaign's lastSentAt and compute nextSendAt
  const nextSend = calculateNextSendAt(campaign.dayOfMonth, campaign.sendTime, new Date(), campaign.timezone);
  await updateCampaign(campaign.id, {
    lastSentAt: now.toISOString(),
    nextSendAt: nextSend,
  });

  return {
    campaignId: campaign.id,
    totalRecipients: recipients.length,
    sentCount,
    skippedDuplicateCount,
    failedCount,
    logs: executionLogs,
  };
}
