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
import { db, handleFirestoreError, OperationType, removeUndefinedFields } from './firebase';
import { Contact, MessageTemplate } from '../types';

const TEMPLATES_COLLECTION = 'templates';

export const STARTER_TEMPLATES: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Astrix Monthly Executive Newsletter',
    category: 'Newsletter',
    channel: 'email',
    subject: 'Astrix Monthly Account & Industry Digest - {{company}}',
    content: `<h2>Hi {{name}},</h2>
<p>Welcome to your monthly edition of the <strong>Astrix</strong> Executive Digest. Here is a summary of performance metrics, system updates, and automated highlights tailored for <strong>{{company}}</strong>.</p>
<hr />
<h3>What's New from Astrix This Month:</h3>
<ul>
  <li><strong>Multi-Channel Dispatch:</strong> Automated SMS, WhatsApp, and Email delivery with Indian timezone support.</li>
  <li><strong>Audience Segmentation:</strong> Enhanced targeting and intelligent duplicate suppression.</li>
</ul>
<p>If you have any questions or feedback, simply reply to this email.</p>
<p>Warm regards,<br /><strong>The Astrix Team</strong><br /><small style="color: #64748b;">Astrix Automation & Communications</small></p>`,
    variables: ['name', 'company', 'email'],
  },
  {
    name: 'Astrix Monthly Statement & Service Notice',
    category: 'Billing',
    channel: 'email',
    subject: 'Astrix Monthly Service Statement for {{name}} - {{company}}',
    content: `<p>Hello {{name}},</p>
<p>This is a friendly confirmation from <strong>Astrix</strong> that your monthly service and subscription cycle for <strong>{{company}}</strong> has completed successfully.</p>
<p>Your Astrix automated messaging pipeline remains fully active with zero dispatch disruptions.</p>
<p>Thank you for partnering with <strong>Astrix</strong>!</p>
<p>Best regards,<br /><strong>Astrix Account Services</strong></p>`,
    variables: ['name', 'company'],
  },
  {
    name: 'Astrix SMS Monthly Check-in',
    category: 'SMS Check-in',
    channel: 'sms',
    content: `[Astrix] Hi {{name}}! This is your monthly check-in from Astrix for {{company}}. All systems and dispatches are active. Reply YES if you need support or text STOP to opt out.`,
    variables: ['name', 'company'],
  },
  {
    name: 'Astrix WhatsApp Monthly Briefing',
    category: 'WhatsApp',
    channel: 'whatsapp',
    content: `👋 *Hello {{name}} from Astrix!*

Your monthly account briefing for *{{company}}* is now live. All multi-channel automation pipelines are operating smoothly.

_Message delivered by Astrix Automated Communications. Reply STOP to opt out._`,
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
    await setDoc(doc(db, TEMPLATES_COLLECTION, id), removeUndefinedFields(templateDoc));
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
    await updateDoc(doc(db, TEMPLATES_COLLECTION, id), removeUndefinedFields({
      ...data,
      updatedAt: now,
    }));
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
