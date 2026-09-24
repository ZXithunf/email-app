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
import { db, handleFirestoreError, OperationType } from './firebase';
import { Campaign, Contact, MessageLog, MessageLogStatus, ChannelType } from '../types';
import { calculateNextSendAt, getMonthCycleKey, updateCampaign } from './campaignService';
import { interpolateTemplate } from './templateService';

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
    await setDoc(doc(db, LOGS_COLLECTION, logId), fullLog);
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
    onProgress?: (progress: { current: number; total: number; latestLog: MessageLog }) => void;
  } = {}
): Promise<CampaignExecutionResult> {
  const now = new Date();
  const monthCycle = options.targetMonthCycle || getMonthCycleKey(now);
  const executionLogs: MessageLog[] = [];

  let sentCount = 0;
  let skippedDuplicateCount = 0;
  let failedCount = 0;

  const totalChannelsCount = recipients.length * campaign.channels.length;
  let progressStep = 0;

  for (const contact of recipients) {
    // Check if contact is unsubscribed
    if (contact.status === 'unsubscribed' || contact.status === 'bounced') {
      for (const channel of campaign.channels) {
        progressStep++;
        const log = await createMessageLog({
          campaignId: campaign.id,
          campaignName: campaign.name,
          contactId: contact.id,
          contactName: contact.name,
          destination: channel === 'email' ? contact.email : contact.phone,
          channel,
          provider: channel === 'email' ? 'amazon_ses' : 'twilio',
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
      const destination = channel === 'email' ? contact.email : contact.phone;

      // 1. Check for duplicate delivery in this monthly cycle
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
          monthCycle,
          status: 'skipped_duplicate',
          error: `Monthly cycle (${monthCycle}) already dispatched on ${new Date(
            previousLog?.scheduledAt || now
          ).toLocaleDateString()}`,
          scheduledAt: now.toISOString(),
          sentAt: undefined,
        });
        executionLogs.push(log);
        skippedDuplicateCount++;
        options.onProgress?.({ current: progressStep, total: totalChannelsCount, latestLog: log });
        continue;
      }

      // 2. Prepare message content
      let renderedSubject = '';
      let renderedBody = '';
      if (channel === 'email') {
        renderedSubject = interpolateTemplate(campaign.emailSubject, contact);
        renderedBody = interpolateTemplate(campaign.emailBody, contact);
      } else {
        renderedBody = interpolateTemplate(campaign.smsBody, contact);
      }

      // 3. Dispatch to Provider (simulated or proxy API)
      try {
        const providerMessageId =
          channel === 'email'
            ? `ses-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`
            : channel === 'sms'
            ? `SM${Math.random().toString(36).substring(2, 12).toUpperCase()}`
            : `WA${Math.random().toString(36).substring(2, 12).toUpperCase()}`;

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
  const nextSend = calculateNextSendAt(campaign.dayOfMonth, campaign.sendTime, new Date());
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
