import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Contact, MessageTemplate } from '../types';

const TEMPLATES_COLLECTION = 'templates';

export const STARTER_TEMPLATES: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Monthly Executive Newsletter',
    category: 'Newsletter',
    channel: 'email',
    subject: 'Your Monthly Industry & Account Digest - {{company}}',
    content: `<h2>Hi {{name}},</h2>
<p>Welcome to your monthly edition of the Executive Digest. Here is a summary of performance metrics and product highlights tailored for <strong>{{company}}</strong>.</p>
<hr />
<h3>What's New This Month:</h3>
<ul>
  <li><strong>Feature Upgrades:</strong> Enhanced reporting and automated multi-channel messaging.</li>
  <li><strong>Strategic Insights:</strong> How peer organizations are optimizing engagement cycles.</li>
</ul>
<p>If you have any questions or feedback, simply reply to this email.</p>
<p>Best regards,<br />The Account Management Team</p>`,
    variables: ['name', 'company', 'email'],
  },
  {
    name: 'Monthly Billing & Subscription Notice',
    category: 'Billing',
    channel: 'email',
    subject: 'Monthly Account Statement for {{name}} - {{company}}',
    content: `<p>Hello {{name}},</p>
<p>This is a friendly reminder that your monthly subscription renewal for {{company}} has been processed successfully.</p>
<p>Your account remains fully active with unlimited automated dispatches.</p>
<p>To view your detailed invoice or adjust payment methods, please access your billing portal.</p>
<p>Thank you for partnering with us!</p>`,
    variables: ['name', 'company'],
  },
  {
    name: 'SMS Monthly Check-in',
    category: 'SMS Check-in',
    channel: 'sms',
    content: `Hi {{name}}! This is your monthly check-in from our team. Everything is running smoothly for {{company}}. Reply YES if you'd like to schedule a 15-min review call. Text STOP to opt out.`,
    variables: ['name', 'company'],
  },
  {
    name: 'WhatsApp Monthly Exclusive Update',
    category: 'WhatsApp',
    channel: 'whatsapp',
    content: `👋 *Hello {{name}}!* 

Your monthly briefing for *{{company}}* is now live. We've unlocked new automation capabilities for your team this month.

Tap here to review details: https://app.contactautomation.io/digest

_Reply STOP to unsubscribe at any time._`,
    variables: ['name', 'company'],
  },
];

export async function fetchTemplates(): Promise<MessageTemplate[]> {
  try {
    const q = query(collection(db, TEMPLATES_COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MessageTemplate));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, TEMPLATES_COLLECTION);
  }
}

export function subscribeToTemplates(
  onUpdate: (templates: MessageTemplate[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, TEMPLATES_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const templates = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MessageTemplate));
      onUpdate(templates);
    },
    (error) => {
      if (onError) onError(error as Error);
      handleFirestoreError(error, OperationType.LIST, TEMPLATES_COLLECTION);
    }
  );
}

export async function seedStarterTemplatesIfEmpty(): Promise<void> {
  try {
    const existing = await getDocs(collection(db, TEMPLATES_COLLECTION));
    if (existing.empty) {
      const now = new Date().toISOString();
      for (const t of STARTER_TEMPLATES) {
        const id = doc(collection(db, TEMPLATES_COLLECTION)).id;
        await setDoc(doc(db, TEMPLATES_COLLECTION, id), {
          ...t,
          id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  } catch (error) {
    console.warn('Templates seed check notice:', error);
  }
}

export async function createTemplate(
  data: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<MessageTemplate> {
  const id = doc(collection(db, TEMPLATES_COLLECTION)).id;
  const now = new Date().toISOString();
  const templateDoc: MessageTemplate = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, TEMPLATES_COLLECTION, id), templateDoc);
    return templateDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${TEMPLATES_COLLECTION}/${id}`);
  }
}

export async function updateTemplate(
  id: string,
  data: Partial<Omit<MessageTemplate, 'id' | 'createdAt'>>
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, TEMPLATES_COLLECTION, id), {
      ...data,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TEMPLATES_COLLECTION}/${id}`);
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, TEMPLATES_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${TEMPLATES_COLLECTION}/${id}`);
  }
}

/**
 * Replaces placeholders like {{name}}, {{company}}, {{email}}, {{phone}}
 */
export function interpolateTemplate(text: string, contact: Partial<Contact>): string {
  if (!text) return '';
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, contact.name || 'Valued Contact')
    .replace(/\{\{\s*company\s*\}\}/gi, contact.company || 'your organization')
    .replace(/\{\{\s*email\s*\}\}/gi, contact.email || '')
    .replace(/\{\{\s*phone\s*\}\}/gi, contact.phone || '')
    .replace(/\{\{\s*status\s*\}\}/gi, contact.status || 'subscribed');
}
