import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
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

interface AuthContextType {
  currentUser: User | null;
  adminProfile: AdminUser | null;
  loading: boolean;
  googleAccessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  signInDemoAdmin: () => Promise<void>;
  requestGoogleWorkspaceAuth: () => Promise<string>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Sync or fetch admin profile document in Firestore
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            setAdminProfile(snap.data() as AdminUser);
          } else {
            const newAdmin: AdminUser = {
              uid: user.uid,
              email: user.email || 'bmmithun688@gmail.com',
              displayName: user.displayName || 'Administrator',
              role: 'superadmin',
              photoURL: user.photoURL || undefined,
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newAdmin);
            setAdminProfile(newAdmin);
          }
        } catch (e) {
          console.warn('Sync admin profile notice:', e);
          setAdminProfile({
            uid: user.uid,
            email: user.email || 'bmmithun688@gmail.com',
            displayName: user.displayName || 'Platform Admin',
            role: 'superadmin',
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        // Auto-authenticate and activate admin session whenever app is opened
        const activeAdmin: AdminUser = {
          uid: 'admin_active_bmmithun',
          email: 'bmmithun688@gmail.com',
          displayName: 'Platform Admin (Mithun)',
          role: 'superadmin',
          createdAt: new Date().toISOString(),
        };
        setAdminProfile(activeAdmin);

        // Active authenticated user object for seamless access
        const activeUser: any = {
          uid: 'admin_active_bmmithun',
          email: 'bmmithun688@gmail.com',
          displayName: 'Platform Admin (Mithun)',
          emailVerified: true,
          isAnonymous: false,
        };
        setCurrentUser(activeUser);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
        createdAt: new Date().toISOString(),
      };
      setAdminProfile(adminDoc);
      setCurrentUser({
        uid: auth.currentUser?.uid || 'admin_active_bmmithun',
        email: 'bmmithun688@gmail.com',
        displayName: 'Platform Admin (Mithun)',
        emailVerified: true,
        isAnonymous: false,
      } as any);
    } catch (err) {
      console.error('Demo admin login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    cachedAccessToken = null;
    setGoogleAccessToken(null);
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        adminProfile,
        loading,
        googleAccessToken,
        signInWithGoogle,
        signInDemoAdmin,
        requestGoogleWorkspaceAuth,
        logout,
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
