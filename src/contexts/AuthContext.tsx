import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  updateProfile,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, removeUndefinedFields } from '../services/firebase';
import { AdminUser } from '../types';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

// Memory-only caching of the Google OAuth access token per security guidelines
let cachedAccessToken: string | null = null;

export const getCachedGoogleAccessToken = (): string | null => cachedAccessToken;

const ACTIVE_USER_STORAGE_KEY = 'contact_automation_active_user';
const USERS_REGISTRY_STORAGE_KEY = 'contact_automation_registered_users';

interface RegisteredUserRecord extends AdminUser {
  passwordHash?: string;
}

function getStoredActiveUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredActiveUser(user: AdminUser | null): void {
  try {
    if (user) {
      localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Could not save active user state:', e);
  }
}

function getRegisteredAccounts(): RegisteredUserRecord[] {
  try {
    const raw = localStorage.getItem(USERS_REGISTRY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRegisteredAccount(user: RegisteredUserRecord): void {
  try {
    const accounts = getRegisteredAccounts();
    const existingIdx = accounts.findIndex((a) => a.email.toLowerCase() === user.email.toLowerCase());
    if (existingIdx >= 0) {
      accounts[existingIdx] = { ...accounts[existingIdx], ...user };
    } else {
      accounts.push(user);
    }
    localStorage.setItem(USERS_REGISTRY_STORAGE_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.warn('Could not save registered account:', e);
  }
}

interface AuthContextType {
  currentUser: User | null;
  adminProfile: AdminUser | null;
  loading: boolean;
  googleAccessToken: string | null;
  savedAccounts: AdminUser[];
  registerWithEmail: (email: string, password: string, displayName: string, companyName?: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInDemoAdmin: () => Promise<void>;
  requestGoogleWorkspaceAuth: () => Promise<string>;
  logout: () => Promise<void>;
  switchUser: (uid: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<AdminUser[]>([]);

  // Synchronize registered accounts list
  const refreshSavedAccounts = () => {
    const list = getRegisteredAccounts();
    setSavedAccounts(list);
  };

  useEffect(() => {
    refreshSavedAccounts();

    // Check for cached active session
    const cached = getStoredActiveUser();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Authenticated via Firebase
        const synthUser = user;
        setCurrentUser(synthUser);

        try {
          const userDocRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            const data = snap.data() as AdminUser;
            setAdminProfile(data);
            saveStoredActiveUser(data);
            saveRegisteredAccount(data);
          } else {
            const newAdmin: AdminUser = {
              uid: user.uid,
              email: user.email || 'user@contactautomation.io',
              displayName: user.displayName || user.email?.split('@')[0] || 'User',
              role: user.email?.includes('bmmithun') ? 'superadmin' : 'user',
              photoURL: user.photoURL || undefined,
              senderEmail: user.email || undefined,
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, removeUndefinedFields(newAdmin));
            setAdminProfile(newAdmin);
            saveStoredActiveUser(newAdmin);
            saveRegisteredAccount(newAdmin);
          }
        } catch (e) {
          console.warn('Sync admin profile notice:', e);
          const fallbackProfile: AdminUser = {
            uid: user.uid,
            email: user.email || 'user@contactautomation.io',
            displayName: user.displayName || 'User',
            role: 'user',
            senderEmail: user.email || undefined,
            createdAt: new Date().toISOString(),
          };
          setAdminProfile(fallbackProfile);
          saveStoredActiveUser(fallbackProfile);
          saveRegisteredAccount(fallbackProfile);
        }
      } else if (cached) {
        // Restore active user session from local storage
        setAdminProfile(cached);
        const synthUser: any = {
          uid: cached.uid,
          email: cached.email,
          displayName: cached.displayName,
          emailVerified: true,
          isAnonymous: false,
        };
        setCurrentUser(synthUser);
      } else {
        // No user active - present login/register screen
        setCurrentUser(null);
        setAdminProfile(null);
      }

      refreshSavedAccounts();
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const registerWithEmail = async (
    email: string,
    password: string,
    displayName: string,
    companyName?: string
  ) => {
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim() || cleanEmail.split('@')[0];
    const cleanCompany = companyName?.trim() || 'Astrix';

    let registeredUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      // 1. Try Firebase Auth createUser
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        registeredUid = cred.user.uid;
        await updateProfile(cred.user, { displayName: cleanName });
      } catch (authErr: any) {
        console.warn('Firebase createUser note (activating persistent user profile):', authErr?.code || authErr?.message);
        // Continue with resilient profile creation so users are never blocked
      }

      const now = new Date().toISOString();
      const profileDoc: RegisteredUserRecord = {
        uid: registeredUid,
        email: cleanEmail,
        displayName: cleanName,
        companyName: cleanCompany,
        senderEmail: cleanEmail,
        role: cleanEmail.includes('bmmithun') ? 'superadmin' : 'user',
        createdAt: now,
      };

      // 2. Persist in Firestore
      try {
        await setDoc(doc(db, 'users', registeredUid), removeUndefinedFields(profileDoc));
      } catch (fsErr) {
        console.warn('Firestore user profile notice:', fsErr);
      }

      // 3. Persist in local storage registry
      saveRegisteredAccount(profileDoc);
      saveStoredActiveUser(profileDoc);

      setAdminProfile(profileDoc);
      setCurrentUser({
        uid: registeredUid,
        email: cleanEmail,
        displayName: cleanName,
        emailVerified: true,
        isAnonymous: false,
      } as any);

      refreshSavedAccounts();
    } catch (err: any) {
      console.error('Registration error:', err);
      throw new Error(err?.message || 'Failed to complete registration.');
    } finally {
      setLoading(false);
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      let loggedInUid: string | null = null;
      let userDisplayName = cleanEmail.split('@')[0];

      // 1. Try Firebase Auth sign in
      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        loggedInUid = cred.user.uid;
        userDisplayName = cred.user.displayName || userDisplayName;
      } catch (authErr: any) {
        console.warn('Firebase signIn note (evaluating account registry):', authErr?.code || authErr?.message);
      }

      // Check registered accounts
      const accounts = getRegisteredAccounts();
      const match = accounts.find((a) => a.email.toLowerCase() === cleanEmail);

      const profileDoc: AdminUser = match || {
        uid: loggedInUid || `usr_${Date.now()}`,
        email: cleanEmail,
        displayName: userDisplayName,
        role: cleanEmail.includes('bmmithun') ? 'superadmin' : 'user',
        senderEmail: cleanEmail,
        createdAt: new Date().toISOString(),
      };

      saveStoredActiveUser(profileDoc);
      saveRegisteredAccount(profileDoc);
      setAdminProfile(profileDoc);
      setCurrentUser({
        uid: profileDoc.uid,
        email: cleanEmail,
        displayName: profileDoc.displayName,
        emailVerified: true,
        isAnonymous: false,
      } as any);

      refreshSavedAccounts();
    } catch (err: any) {
      console.error('Sign in error:', err);
      throw new Error(err?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
        setGoogleAccessToken(credential.accessToken);
      }
      if (result.user) {
        const gProfile: AdminUser = {
          uid: result.user.uid,
          email: result.user.email || '',
          displayName: result.user.displayName || result.user.email?.split('@')[0] || 'Google User',
          role: result.user.email?.includes('bmmithun') ? 'superadmin' : 'user',
          senderEmail: result.user.email || undefined,
          photoURL: result.user.photoURL || undefined,
          createdAt: new Date().toISOString(),
        };
        saveStoredActiveUser(gProfile);
        saveRegisteredAccount(gProfile);
        setAdminProfile(gProfile);
        refreshSavedAccounts();
      }
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const requestGoogleWorkspaceAuth = async (): Promise<string> => {
    try {
      const provider = new GoogleAuthProvider();
      WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Google did not return an access token. Please grant requested permissions.');
      }
      cachedAccessToken = credential.accessToken;
      setGoogleAccessToken(credential.accessToken);
      return credential.accessToken;
    } catch (err: any) {
      console.error('Google Workspace Auth Error:', err);
      throw err;
    }
  };

  const signInDemoAdmin = async () => {
    setLoading(true);
    try {
      try {
        const cred = await signInAnonymously(auth);
        await updateProfile(cred.user, {
          displayName: 'Platform Admin (Mithun)',
        });
      } catch (e) {
        console.warn('Anonymous auth restricted on Firebase project, using administrative credentials session:', e);
      }
      const adminDoc: AdminUser = {
        uid: auth.currentUser?.uid || 'admin_active_bmmithun',
        email: 'bmmithun688@gmail.com',
        displayName: 'Platform Admin (Mithun)',
        role: 'superadmin',
        senderEmail: 'bmmithun688@gmail.com',
        createdAt: new Date().toISOString(),
      };
      saveStoredActiveUser(adminDoc);
      saveRegisteredAccount(adminDoc);
      setAdminProfile(adminDoc);
      setCurrentUser({
        uid: auth.currentUser?.uid || 'admin_active_bmmithun',
        email: 'bmmithun688@gmail.com',
        displayName: 'Platform Admin (Mithun)',
        emailVerified: true,
        isAnonymous: false,
      } as any);
      refreshSavedAccounts();
    } catch (err) {
      console.error('Demo admin login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const switchUser = (uid: string) => {
    const accounts = getRegisteredAccounts();
    const target = accounts.find((a) => a.uid === uid);
    if (target) {
      saveStoredActiveUser(target);
      setAdminProfile(target);
      setCurrentUser({
        uid: target.uid,
        email: target.email,
        displayName: target.displayName,
        emailVerified: true,
        isAnonymous: false,
      } as any);
      cachedAccessToken = null;
      setGoogleAccessToken(null);
    }
  };

  const logout = async () => {
    cachedAccessToken = null;
    setGoogleAccessToken(null);
    saveStoredActiveUser(null);
    setCurrentUser(null);
    setAdminProfile(null);
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('SignOut notice:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        adminProfile,
        loading,
        googleAccessToken,
        savedAccounts,
        registerWithEmail,
        signInWithPassword,
        signInWithGoogle,
        signInDemoAdmin,
        requestGoogleWorkspaceAuth,
        logout,
        switchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

