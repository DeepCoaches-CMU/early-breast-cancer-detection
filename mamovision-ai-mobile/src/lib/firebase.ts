import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, inMemoryPersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// getReactNativePersistence is not in Firebase 11 type declarations but exists at runtime.
// Fall back to inMemoryPersistence if unavailable so the app never crashes on startup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => typeof inMemoryPersistence;
};
const rnPersistence = getReactNativePersistence
  ? getReactNativePersistence(AsyncStorage)
  : inMemoryPersistence;
import {
  initializeFirestore,
  persistentLocalCache,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { ScanResult, UserProfile } from '../types';

const firebaseConfig = {
  projectId: 'gen-lang-client-0357714171',
  appId: '1:699807172876:web:a2368d4c0f64222fd12129',
  apiKey: 'AIzaSyADcAdeSb-yhaJ8SxY2EmAz4YUPXjBBNg8',
  authDomain: 'gen-lang-client-0357714171.firebaseapp.com',
  storageBucket: 'gen-lang-client-0357714171.firebasestorage.app',
  messagingSenderId: '699807172876',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = (() => {
  try {
    return initializeAuth(app, { persistence: rnPersistence });
  } catch {
    return getAuth(app);
  }
})();

export const db = initializeFirestore(
  app,
  { localCache: persistentLocalCache() },
  'ai-studio-244e59c3-8aa9-456e-9622-a180284fbf35',
);

export async function createUserProfile(profile: Omit<UserProfile, 'createdAt'>): Promise<void> {
  await setDoc(doc(db, 'users', profile.uid), {
    ...profile,
    createdAt: serverTimestamp(),
  });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: data.uid,
    email: data.email,
    displayName: data.displayName ?? '',
    institution: data.institution ?? '',
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  };
}

export async function updateUserProfile(
  uid: string,
  updates: { displayName?: string; institution?: string },
): Promise<void> {
  await setDoc(doc(db, 'users', uid), updates, { merge: true });
}

export async function saveCloudScan(scan: ScanResult): Promise<void> {
  await setDoc(doc(db, 'scans', scan.id), {
    ...scan,
    imageBase64: undefined,
    createdAt: serverTimestamp(),
  });
}

export async function loadCloudScans(uid: string): Promise<ScanResult[]> {
  const q = query(
    collection(db, 'scans'),
    where('practitionerId', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      patientId: data.patientId,
      imageUri: data.imageUri,
      fileName: data.fileName,
      fileType: data.fileType,
      classification: data.classification,
      confidence: data.confidence,
      observations: data.observations,
      analysisText: data.analysisText,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      practitionerId: data.practitionerId,
    } as ScanResult;
  });
}
