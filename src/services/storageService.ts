import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

export async function uploadCampaignImage(file: File, folder = 'campaigns'): Promise<string> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${folder}/${timestamp}_${safeName}`;

  try {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (err) {
    console.warn('Firebase Storage upload threw an error, falling back to base64 Data URL for preview resilience:', err);
    // Fallback to FileReader base64 Data URL so the application never breaks even without storage bucket setup
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert file to data URL'));
        }
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }
}
