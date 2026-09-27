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

export async function fetchContacts(): Promise<Contact[]> {
  try {
    const q = query(collection(db, CONTACTS_COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Contact));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, CONTACTS_COLLECTION);
  }
}

export function subscribeToContacts(
  onUpdate: (contacts: Contact[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, CONTACTS_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const contacts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Contact));
      onUpdate(contacts);
    },
    (error) => {
      if (onError) onError(error as Error);
      handleFirestoreError(error, OperationType.LIST, CONTACTS_COLLECTION);
    }
  );
}

export async function addContact(data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contact> {
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
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, CONTACTS_COLLECTION, contactId), removeUndefinedFields(contactDoc));
    return contactDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${CONTACTS_COLLECTION}/${contactId}`);
  }
}

export async function updateContact(id: string, data: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<void> {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, CONTACTS_COLLECTION, id), removeUndefinedFields({
      ...data,
      updatedAt: now,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${CONTACTS_COLLECTION}/${id}`);
  }
}

export async function deleteContact(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, CONTACTS_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${CONTACTS_COLLECTION}/${id}`);
  }
}

export async function bulkDeleteContacts(ids: string[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.delete(doc(db, CONTACTS_COLLECTION, id));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, CONTACTS_COLLECTION);
  }
}

/**
 * Commits only validated records to Firestore in chunks to obey Firestore batch limits (max 500 per batch)
 */
export async function bulkImportValidatedContacts(
  validRecords: ValidatedImportRecord[],
  sourceFileName = 'excel_import',
  options: {
    updateExisting?: boolean;
    existingContacts?: Contact[];
    onProgress?: (progress: { current: number; total: number; percentage: number }) => void;
  } = {}
): Promise<{ importedCount: number; updatedCount: number }> {
  try {
    // Maximize throughput: 400 docs per batch (Firestore max is 500)
    const CHUNK_SIZE = 400;
    const CONCURRENCY = 2; // Run 2 batch commits concurrently over HTTP/2
    const now = new Date().toISOString();
    let imported = 0;
    let updated = 0;
    let processedSoFar = 0;
    const total = validRecords.length;

    const existingMap = new Map<string, Contact>();
    if (options.updateExisting && options.existingContacts) {
      for (const c of options.existingContacts) {
        if (c.email) existingMap.set(c.email.trim().toLowerCase(), c);
      }
    }

    // Split records into chunks of 400
    const chunks: ValidatedImportRecord[][] = [];
    for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
      chunks.push(validRecords.slice(i, i + CHUNK_SIZE));
    }

    // Process chunks with controlled concurrency of 2 batches in flight at once
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const concurrentChunks = chunks.slice(i, i + CONCURRENCY);

      const batchPromises = concurrentChunks.map(async (chunk) => {
        const batch = writeBatch(db);
        let batchImported = 0;
        let batchUpdated = 0;

        for (const item of chunk) {
          let cleanName = (item.data.name || 'Unnamed Contact').trim().slice(0, 150);
          let cleanEmail = (item.data.email || '').trim().toLowerCase().slice(0, 200);
          const cleanPhone = (item.data.phone || '').trim().slice(0, 30);
          const cleanCompany = (item.data.company || '').trim().slice(0, 150);
          const cleanTags = Array.isArray(item.data.tags) ? [...item.data.tags] : [];

          // If email is missing or empty, but phone exists, generate a safe placeholder email
          // so Firestore rules (`data.email is string && data.email.size() > 3`) pass without rejection.
          if (!cleanEmail || !cleanEmail.includes('@')) {
            if (cleanPhone) {
              const digits = cleanPhone.replace(/\D/g, '') || Math.random().toString(36).substring(2, 8);
              cleanEmail = `${digits}@contact.local`;
              if (!cleanTags.includes('phone-only')) cleanTags.push('phone-only');
            } else {
              continue; // Skip if neither email nor phone
            }
          }

          const existing = existingMap.get(cleanEmail);
          if (existing) {
            const docRef = doc(db, CONTACTS_COLLECTION, existing.id);
            const updateData: Partial<Contact> = {
              name: cleanName || existing.name,
              phone: cleanPhone || existing.phone,
              company: cleanCompany || existing.company,
              tags: Array.from(new Set([...existing.tags, ...cleanTags])),
              updatedAt: now,
            };
            batch.update(docRef, removeUndefinedFields(updateData));
            batchUpdated++;
          } else {
            const docRef = doc(collection(db, CONTACTS_COLLECTION));
            const contactDoc: Contact = {
              id: docRef.id,
              name: cleanName,
              email: cleanEmail,
              phone: cleanPhone,
              company: cleanCompany,
              tags: cleanTags,
              status: 'subscribed',
              consentGiven: true,
              source: sourceFileName,
              createdAt: now,
              updatedAt: now,
            };
            batch.set(docRef, removeUndefinedFields(contactDoc));
            batchImported++;
          }
        }

        await batch.commit();
        return { batchImported, batchUpdated, count: chunk.length };
      });

      const results = await Promise.all(batchPromises);
      for (const res of results) {
        imported += res.batchImported;
        updated += res.batchUpdated;
        processedSoFar += res.count;
      }

      if (options.onProgress) {
        options.onProgress({
          current: Math.min(processedSoFar, total),
          total,
          percentage: Math.round((Math.min(processedSoFar, total) / total) * 100),
        });
      }
    }

    return { importedCount: imported, updatedCount: updated };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, CONTACTS_COLLECTION);
  }
}
