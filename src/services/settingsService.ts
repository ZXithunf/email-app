import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { PlatformSettings } from '../types';

const SETTINGS_COLLECTION = 'settings';
const DEFAULT_DOC_ID = 'global_config';

export const DEFAULT_SETTINGS: PlatformSettings = {
  sesRegion: 'us-east-1',
  sesFromEmail: 'digest@contactautomation.io',
  sesAccessKeyId: 'AKIA****************',
  sesSecretKeyConfigured: true,
  twilioPhone: '+18555902341',
  twilioWhatsAppNumber: 'whatsapp:+14155238886',
  twilioAccountSid: 'AC********************************',
  twilioAuthTokenConfigured: true,
  schedulerCron: '0 9 * * *', // Daily at 09:00 UTC
  rateLimitPerMinute: 60,
  simulationMode: true,
  updatedAt: new Date().toISOString(),
};

export async function fetchSettings(): Promise<PlatformSettings> {
  try {
    const d = await getDoc(doc(db, SETTINGS_COLLECTION, DEFAULT_DOC_ID));
    if (d.exists()) {
      return { id: d.id, ...d.data() } as PlatformSettings;
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${SETTINGS_COLLECTION}/${DEFAULT_DOC_ID}`);
  }
}

export async function saveSettings(settings: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const now = new Date().toISOString();
  const updated: PlatformSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, DEFAULT_DOC_ID), updated);
    return updated;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SETTINGS_COLLECTION}/${DEFAULT_DOC_ID}`);
  }
}
