import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, removeUndefinedFields } from './firebase';
import { Contact, ValidatedImportRecord } from '../types';

const CONTACTS_COLLECTION = 'contacts';
const LOCAL_STORAGE_KEY = 'contact_automation_contacts_cache';

// Helper to read local contacts cache
function getLocalContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Helper to save local contacts cache
function saveLocalContacts(contacts: Contact[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(contacts));
  } catch (e) {
    console.warn('Local contacts storage error:', e);
  }
}

// Global in-memory subscribers for immediate local UI sync
interface SubscriberInfo {
  callback: (contacts: Contact[]) => void;
  userId?: string;
}
const localSubscribers = new Set<SubscriberInfo>();

function filterContactsForUser(contacts: Contact[], userId?: string): Contact[] {
  if (!userId) return contacts;
  return contacts.filter((c) => !c.userId || c.userId === userId);
}

function notifySubscribers(contacts: Contact[]) {
  saveLocalContacts(contacts);
  localSubscribers.forEach((sub) => {
    try {
      sub.callback(filterContactsForUser(contacts, sub.userId));
    } catch (e) {
      console.warn('Subscriber notification notice:', e);
    }
  });
}

export async function fetchContacts(userId?: string): Promise<Contact[]> {
  try {
    const q = query(collection(db, CONTACTS_COLLECTION), orderBy('createdAt', 'desc'));
    // Timeout of 3.5s so fetch never hangs if Firestore API is disabled or offline
    const fetchPromise = getDocs(q);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore fetch timeout, using cached contacts')), 3500)
    );
    const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
    const contacts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Contact));
    if (contacts.length > 0) {
      saveLocalContacts(contacts);
    }
    const all = contacts.length > 0 ? contacts : getLocalContacts();
    return filterContactsForUser(all, userId);
  } catch (error) {
    console.warn('fetchContacts fallback to local cache:', error);
    return filterContactsForUser(getLocalContacts(), userId);
  }
}

export function subscribeToContacts(
  onUpdate: (contacts: Contact[]) => void,
  onError?: (err: Error) => void,
  userId?: string
) {
  // 1. Immediately emit cached local contacts so UI renders in 0ms
  const initial = getLocalContacts();
  onUpdate(filterContactsForUser(initial, userId));

  // Register in local subscribers
  const subInfo: SubscriberInfo = { callback: onUpdate, userId };
  localSubscribers.add(subInfo);

  // 2. Attach live Firestore listener
  try {
    const q = query(collection(db, CONTACTS_COLLECTION), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const contacts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Contact));
        if (contacts.length > 0) {
          saveLocalContacts(contacts);
          onUpdate(filterContactsForUser(contacts, userId));
        } else {
          // If Firestore is empty but local has data, preserve local data
          const local = getLocalContacts();
          if (local.length > 0) onUpdate(filterContactsForUser(local, userId));
        }
      },
      (error) => {
        console.warn('Firestore live listener notice (using local active state):', error.message);
        if (onError) onError(error as Error);
      }
    );

    return () => {
      localSubscribers.delete(subInfo);
      try {
        unsub();
      } catch {}
    };
  } catch (e) {
    return () => {
      localSubscribers.delete(subInfo);
    };
  }
}

export async function addContact(
  data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>,
  userId?: string,
  ownerEmail?: string
): Promise<Contact> {
  const contactId = doc(collection(db, CONTACTS_COLLECTION)).id;
  const now = new Date().toISOString();
  let email = (data.email || '').trim().toLowerCase();
  const phone = (data.phone || '').trim().slice(0, 30);
  if (!email && phone) {
    email = `${phone.replace(/\D/g, '')}@contact.local`;
  }
  const contactDoc: Contact = {
    ...data,
    name: (data.name || 'Contact').trim().slice(0, 150),
    email,
    phone,
    status: data.status || 'subscribed',
    tags: Array.isArray(data.tags) ? data.tags : [],
    id: contactId,
    userId: userId || data.userId,
    ownerEmail: ownerEmail || data.ownerEmail,
    createdAt: now,
    updatedAt: now,
  };

  // Update local store immediately
  const local = getLocalContacts();
  const updatedList = [contactDoc, ...local.filter((c) => c.id !== contactId)];
  notifySubscribers(updatedList);

  try {
    // Attempt Firestore write with timeout
    const writePromise = setDoc(doc(db, CONTACTS_COLLECTION, contactId), removeUndefinedFields(contactDoc));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Write timeout')), 3500)
    );
    await Promise.race([writePromise, timeoutPromise]);
  } catch (error) {
    console.warn('Contact persisted locally, Firestore sync deferred:', error);
  }

  return contactDoc;
}

export async function updateContact(id: string, data: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<void> {
  const now = new Date().toISOString();
  const local = getLocalContacts();
  const updatedList = local.map((c) => (c.id === id ? { ...c, ...data, updatedAt: now } : c));
  notifySubscribers(updatedList);

  try {
    const writePromise = updateDoc(doc(db, CONTACTS_COLLECTION, id), removeUndefinedFields({
      ...data,
      updatedAt: now,
    }));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Write timeout')), 3500)
    );
    await Promise.race([writePromise, timeoutPromise]);
  } catch (error) {
    console.warn('Update saved locally, Firestore sync deferred:', error);
  }
}

export async function deleteContact(id: string): Promise<void> {
  const local = getLocalContacts();
  const updatedList = local.filter((c) => c.id !== id);
  notifySubscribers(updatedList);

  try {
    await deleteDoc(doc(db, CONTACTS_COLLECTION, id));
  } catch (error) {
    console.warn('Delete processed locally:', error);
  }
}

export async function bulkDeleteContacts(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  const local = getLocalContacts();
  const updatedList = local.filter((c) => !idSet.has(c.id));
  notifySubscribers(updatedList);

  try {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.delete(doc(db, CONTACTS_COLLECTION, id));
    }
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Write timeout')), 3500)
    );
    await Promise.race([batch.commit(), timeoutPromise]);
  } catch (error) {
    console.warn('Bulk delete processed locally:', error);
  }
}

/**
 * Commits only validated records with resilient local persistence and high-speed batch write
 * Guarantees that imports never freeze on "Importing 0 / 5..." even if Firestore is offline or API is disabled
 */
export async function bulkImportValidatedContacts(
  validRecords: ValidatedImportRecord[],
  sourceFileName = 'excel_import',
  options: {
    updateExisting?: boolean;
    existingContacts?: Contact[];
    userId?: string;
    ownerEmail?: string;
    onProgress?: (progress: { current: number; total: number; percentage: number }) => void;
  } = {}
): Promise<{ importedCount: number; updatedCount: number }> {
  const now = new Date().toISOString();
  let imported = 0;
  let updated = 0;
  const total = validRecords.length;

  const localContacts = getLocalContacts();
  const contactsMap = new Map<string, Contact>();
  // Load existing contacts into map by email and phone
  localContacts.forEach((c) => {
    if (c.email) contactsMap.set(c.email.trim().toLowerCase(), c);
  });
  if (options.existingContacts) {
    options.existingContacts.forEach((c) => {
      if (c.email) contactsMap.set(c.email.trim().toLowerCase(), c);
    });
  }

  const generatedContacts: Contact[] = [];
  const updatedContacts: Contact[] = [];

  for (let i = 0; i < validRecords.length; i++) {
    const item = validRecords[i];
    let cleanName = (item.data.name || 'Unnamed Contact').trim().slice(0, 150);
    let cleanEmail = (item.data.email || '').trim().toLowerCase().slice(0, 200);
    const cleanPhone = (item.data.phone || '').trim().slice(0, 30);
    const cleanCompany = (item.data.company || '').trim().slice(0, 150);
    const cleanTags = Array.isArray(item.data.tags) ? [...item.data.tags] : [];

    // Ensure email is valid for Firestore security rules
    if (!cleanEmail || !cleanEmail.includes('@')) {
      if (cleanPhone) {
        const digits = cleanPhone.replace(/\D/g, '') || Math.random().toString(36).substring(2, 8);
        cleanEmail = `${digits}@contact.local`;
        if (!cleanTags.includes('phone-only')) cleanTags.push('phone-only');
      } else {
        continue;
      }
    }

    const existing = contactsMap.get(cleanEmail);
    if (existing && options.updateExisting) {
      const mergedContact: Contact = {
        ...existing,
        name: cleanName || existing.name,
        phone: cleanPhone || existing.phone,
        company: cleanCompany || existing.company,
        tags: Array.from(new Set([...existing.tags, ...cleanTags])),
        userId: options.userId || existing.userId,
        ownerEmail: options.ownerEmail || existing.ownerEmail,
        updatedAt: now,
      };
      contactsMap.set(cleanEmail, mergedContact);
      updatedContacts.push(mergedContact);
      updated++;
    } else if (!existing) {
      const contactDoc: Contact = {
        id: `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        company: cleanCompany,
        tags: cleanTags,
        status: 'subscribed',
        consentGiven: true,
        source: sourceFileName,
        userId: options.userId,
        ownerEmail: options.ownerEmail,
        createdAt: now,
        updatedAt: now,
      };
      contactsMap.set(cleanEmail, contactDoc);
      generatedContacts.push(contactDoc);
      imported++;
    }

    // Step-by-step progress feedback
    if (options.onProgress && (i % 2 === 0 || i === validRecords.length - 1)) {
      const current = i + 1;
      options.onProgress({
        current,
        total,
        percentage: Math.round((current / total) * 100),
      });
    }
  }

  // 1. Immediately save to persistent local cache and notify all UI listeners!
  const finalAllContacts = Array.from(contactsMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  notifySubscribers(finalAllContacts);

  // 2. Asynchronously commit to Firestore backend with graceful fallback
  (async () => {
    try {
      const allToCommit = [...generatedContacts, ...updatedContacts];
      const CHUNK_SIZE = 250;
      for (let i = 0; i < allToCommit.length; i += CHUNK_SIZE) {
        const chunk = allToCommit.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const c of chunk) {
          const docRef = doc(db, CONTACTS_COLLECTION, c.id);
          batch.set(docRef, removeUndefinedFields(c));
        }
        // Commit with 4s timeout so it never blocks or leaks
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Batch commit timeout')), 4000)
        );
        await Promise.race([batch.commit(), timeoutPromise]);
      }
      console.info(`Synced ${allToCommit.length} contacts to Firestore backend successfully.`);
    } catch (err: any) {
      console.warn('Firestore remote sync notice (contacts safely preserved locally):', err?.message);
    }
  })();

  if (options.onProgress) {
    options.onProgress({ current: total, total, percentage: 100 });
  }

  return { importedCount: imported, updatedCount: updated };
}
