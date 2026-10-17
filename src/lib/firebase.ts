import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network. Operating in offline/cached mode.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');

let isSigningIn = false;
let cachedAccessToken: string | null = (typeof window !== 'undefined' ? sessionStorage.getItem('google_access_token') || localStorage.getItem('google_access_token') : null);

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (!cachedAccessToken && typeof window !== 'undefined') {
        cachedAccessToken = sessionStorage.getItem('google_access_token') || localStorage.getItem('google_access_token');
      }
      if (onAuthSuccess) {
        onAuthSuccess(user, cachedAccessToken);
      }
    } else {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('google_access_token');
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('google_access_token', cachedAccessToken);
        localStorage.setItem('google_access_token', cachedAccessToken);
      } catch (_) {}
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      console.log('Sign in canceled: popup closed by user.');
      throw new Error('Sign-in window was closed before completion. Please try again.');
    } else if (error.code === 'auth/cancelled-by-user') {
      console.log('Sign in canceled by user.');
      throw new Error('Sign-in was cancelled. Please try again.');
    } else if (error.code === 'auth/popup-blocked') {
      console.warn('Sign in warning: popup blocked by browser.');
      throw new Error('The sign-in popup was blocked by your browser. Please enable popups for this site.');
    } else if (error.code === 'auth/unauthorized-domain') {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'current domain';
      console.error(`Sign in error: Domain ${currentHost} is unauthorized in Firebase Auth.`);
      throw new Error(`Authentication domain not authorized. Domain "${currentHost}" needs to be added to Authorized Domains in Firebase Authentication console.`);
    }
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = () => {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('google_access_token') || localStorage.getItem('google_access_token');
  }
  return null;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('google_access_token');
      localStorage.removeItem('google_access_token');
    } catch (_) {}
  }
};

export const DEFAULT_WHITELIST = [
  'badthinkermorethanu@gmail.com',
  'reservation.kic@gmail.com',
  'reservation.lebaliblog@gmail.com'
];

/**
 * Official office accounts authorized for internal operational data & Drive Media Gallery.
 */
export const OFFICE_EMAILS = [
  'reservation.kic@gmail.com',
  'reservation.lebaliblog@gmail.com'
];

/**
 * Verifies if an email address belongs to the authorized office accounts.
 */
export function isOfficeEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return OFFICE_EMAILS.some(office => office.toLowerCase() === clean);
}

export async function getWhitelistedEmails(): Promise<string[]> {
  try {
    const docRef = doc(db, 'config', 'whitelist');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && Array.isArray(data.emails)) {
        return data.emails.map((e: string) => e.trim().toLowerCase());
      }
    }
  } catch (error) {
    console.warn("Failed to fetch dynamic whitelist from Firestore, falling back:", error);
  }
  return DEFAULT_WHITELIST.map(e => e.trim().toLowerCase());
}

export async function saveWhitelistedEmails(emails: string[]): Promise<void> {
  try {
    const docRef = doc(db, 'config', 'whitelist');
    await setDoc(docRef, {
      emails: emails.map(e => e.trim().toLowerCase()),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to save whitelist to Firestore:", error);
    throw error;
  }
}
