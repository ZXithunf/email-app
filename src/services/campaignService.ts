import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Campaign, CampaignRecipient, Contact } from '../types';

const CAMPAIGNS_COLLECTION = 'campaigns';
const RECIPIENTS_COLLECTION = 'campaignRecipients';

/**
 * Calculates the next send timestamp based on dayOfMonth (1-31) and sendTime (HH:mm)
 */
export function calculateNextSendAt(
  dayOfMonth: number,
  sendTime = '09:00',
  fromDate: Date = new Date()
): string {
  const [hours, minutes] = sendTime.split(':').map((n) => parseInt(n, 10) || 0);

  const year = fromDate.getFullYear();
  const month = fromDate.getMonth(); // 0-indexed

  // Helper to get max days in a specific month
  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

  // Try current month first
  const currentMonthMaxDays = getDaysInMonth(year, month);
  const targetDayCurrent = Math.min(dayOfMonth, currentMonthMaxDays);
  const targetDateCurrent = new Date(year, month, targetDayCurrent, hours, minutes, 0, 0);

  if (targetDateCurrent.getTime() > fromDate.getTime()) {
    return targetDateCurrent.toISOString();
  }

  // Next month
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear++;
  }

  const nextMonthMaxDays = getDaysInMonth(nextYear, nextMonth);
  const targetDayNext = Math.min(dayOfMonth, nextMonthMaxDays);
  const targetDateNext = new Date(nextYear, nextMonth, targetDayNext, hours, minutes, 0, 0);

  return targetDateNext.toISOString();
}

/**
 * Returns the current month cycle string e.g. "2026-09"
 */
export function getMonthCycleKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export const formatMonthlyCycleKey = getMonthCycleKey;

export async function fetchCampaigns(): Promise<Campaign[]> {
  try {
    const q = query(collection(db, CAMPAIGNS_COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Campaign));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, CAMPAIGNS_COLLECTION);
  }
}

export function subscribeToCampaigns(
  onUpdate: (campaigns: Campaign[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, CAMPAIGNS_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const campaigns = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Campaign));
      onUpdate(campaigns);
    },
    (error) => {
      if (onError) onError(error as Error);
      handleFirestoreError(error, OperationType.LIST, CAMPAIGNS_COLLECTION);
    }
  );
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  try {
    const d = await getDoc(doc(db, CAMPAIGNS_COLLECTION, id));
    if (!d.exists()) return null;
    return { id: d.id, ...d.data() } as Campaign;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${CAMPAIGNS_COLLECTION}/${id}`);
  }
}

export async function createCampaign(
  data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'nextSendAt'>,
  selectedContacts: Contact[] = []
): Promise<Campaign> {
  const campaignId = doc(collection(db, CAMPAIGNS_COLLECTION)).id;
  const now = new Date().toISOString();
  const nextSendAt = calculateNextSendAt(data.dayOfMonth, data.sendTime);

  const campaignDoc: Campaign = {
    ...data,
    id: campaignId,
    recipientCount: selectedContacts.length,
    nextSendAt,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, CAMPAIGNS_COLLECTION, campaignId), campaignDoc);

    // Save recipients mapping
    for (const contact of selectedContacts) {
      const recipientDocId = `${campaignId}_${contact.id}`;
      const recipientDoc: CampaignRecipient = {
        campaignId,
        contactId: contact.id,
        contactName: contact.name,
        contactEmail: contact.email,
        contactPhone: contact.phone,
        addedAt: now,
      };
      await setDoc(doc(db, RECIPIENTS_COLLECTION, recipientDocId), recipientDoc);
    }

    return campaignDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${CAMPAIGNS_COLLECTION}/${campaignId}`);
  }
}

export async function updateCampaign(
  id: string,
  data: Partial<Omit<Campaign, 'id' | 'createdAt'>>,
  selectedContacts?: Contact[]
): Promise<void> {
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    ...data,
    updatedAt: now,
  };

  if (data.dayOfMonth !== undefined || data.sendTime !== undefined) {
    const day = data.dayOfMonth ?? 1;
    const time = data.sendTime ?? '09:00';
    updates.nextSendAt = calculateNextSendAt(day, time);
  }

  if (selectedContacts !== undefined) {
    updates.recipientCount = selectedContacts.length;
  }

  try {
    await updateDoc(doc(db, CAMPAIGNS_COLLECTION, id), updates);

    // If new contact list provided, update campaignRecipients
    if (selectedContacts) {
      // Fetch existing recipients
      const existing = await getDocs(
        query(collection(db, RECIPIENTS_COLLECTION), where('campaignId', '==', id))
      );
      for (const d of existing.docs) {
        await deleteDoc(d.ref);
      }

      for (const contact of selectedContacts) {
        const recipientDocId = `${id}_${contact.id}`;
        await setDoc(doc(db, RECIPIENTS_COLLECTION, recipientDocId), {
          campaignId: id,
          contactId: contact.id,
          contactName: contact.name,
          contactEmail: contact.email,
          contactPhone: contact.phone,
          addedAt: now,
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${CAMPAIGNS_COLLECTION}/${id}`);
  }
}

export async function toggleCampaignActive(id: string, active: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, CAMPAIGNS_COLLECTION, id), {
      active,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${CAMPAIGNS_COLLECTION}/${id}`);
  }
}

export async function deleteCampaign(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, CAMPAIGNS_COLLECTION, id));
    // Clean up recipients
    const recipients = await getDocs(
      query(collection(db, RECIPIENTS_COLLECTION), where('campaignId', '==', id))
    );
    for (const r of recipients.docs) {
      await deleteDoc(r.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${CAMPAIGNS_COLLECTION}/${id}`);
  }
}

export async function fetchCampaignRecipients(campaignId: string): Promise<CampaignRecipient[]> {
  try {
    const q = query(collection(db, RECIPIENTS_COLLECTION), where('campaignId', '==', campaignId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as CampaignRecipient);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, RECIPIENTS_COLLECTION);
  }
}
