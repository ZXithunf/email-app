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
import { db, handleFirestoreError, OperationType } from './firebase';
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
  const contactDoc: Contact = {
    ...data,
    id: contactId,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, CONTACTS_COLLECTION, contactId), contactDoc);
    return contactDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${CONTACTS_COLLECTION}/${contactId}`);
  }
}

export async function updateContact(id: string, data: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<void> {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, CONTACTS_COLLECTION, id), {
      ...data,
      updatedAt: now,
    });
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
  sourceFileName = 'excel_import'
): Promise<{ importedCount: number }> {
  try {
    const CHUNK_SIZE = 400;
    const now = new Date().toISOString();
    let imported = 0;

    for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
      const chunk = validRecords.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const item of chunk) {
        const docRef = doc(collection(db, CONTACTS_COLLECTION));
        const contactDoc: Contact = {
          id: docRef.id,
          name: item.data.name,
          email: item.data.email,
          phone: item.data.phone,
          company: item.data.company || '',
          tags: item.data.tags || [],
          status: 'subscribed',
          consentGiven: true,
          source: sourceFileName,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(docRef, contactDoc);
        imported++;
      }

      await batch.commit();
    }

    return { importedCount: imported };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, CONTACTS_COLLECTION);
  }
}
