import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScanResult, UserProfile } from '../types';

const SCANS_KEY = (uid: string) => `mamovision-scans:${uid}`;
const PROFILE_KEY = (uid: string) => `mamovision-profile:${uid}`;

export async function saveLocalScan(uid: string, scan: ScanResult): Promise<void> {
  const existing = await loadLocalScans(uid);
  const updated = [scan, ...existing.filter((s) => s.id !== scan.id)];
  await AsyncStorage.setItem(SCANS_KEY(uid), JSON.stringify(updated));
}

export async function loadLocalScans(uid: string): Promise<ScanResult[]> {
  try {
    const raw = await AsyncStorage.getItem(SCANS_KEY(uid));
    if (!raw) return [];
    return JSON.parse(raw) as ScanResult[];
  } catch {
    return [];
  }
}

export async function deleteLocalScan(uid: string, scanId: string): Promise<void> {
  const existing = await loadLocalScans(uid);
  const updated = existing.filter((s) => s.id !== scanId);
  await AsyncStorage.setItem(SCANS_KEY(uid), JSON.stringify(updated));
}

export async function saveLocalProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY(profile.uid), JSON.stringify(profile));
}

export async function loadLocalProfile(uid: string): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY(uid));
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function generateScanId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generatePatientId(): string {
  return `PT-${Math.random().toString(36).toUpperCase().slice(2, 8)}`;
}
