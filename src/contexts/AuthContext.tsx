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

interface AuthContextType {
  currentUser: User | null;
  adminProfile: AdminUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInDemoAdmin: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Sync or fetch admin profile document in Firestore
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            setAdminProfile(snap.data() as AdminUser);
          } else {
            const newAdmin: AdminUser = {
              uid: user.uid,
              email: user.email || 'admin@contactautomation.io',
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
            email: user.email || 'admin@contactautomation.io',
            displayName: user.displayName || 'Platform Admin',
            role: 'superadmin',
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        setAdminProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInDemoAdmin = async () => {
    setLoading(true);
    try {
      const cred = await signInAnonymously(auth);
      await updateProfile(cred.user, {
        displayName: 'Demo Administrator',
      });
      const adminDoc: AdminUser = {
        uid: cred.user.uid,
        email: 'bmmithun688@gmail.com',
        displayName: 'Demo Administrator',
        role: 'superadmin',
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'users', cred.user.uid), adminDoc);
      setAdminProfile(adminDoc);
    } catch (err) {
      console.error('Demo admin login error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        adminProfile,
        loading,
        signInWithGoogle,
        signInDemoAdmin,
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
