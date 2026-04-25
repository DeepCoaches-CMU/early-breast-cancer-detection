import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { auth, updateUserProfile } from '../lib/firebase';
import { loadLocalProfile, saveLocalProfile, loadLocalScans } from '../lib/storage';
import { useUser } from '../contexts/UserContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { UserProfile } from '../types';
import { getInferenceMetrics, InferenceMetrics } from '../lib/inference';

function DevRow({ label, value, color = '#E2E8F0' }: { label: string; value: string; color?: string }) {
  return (
    <View style={devRowStyle.row}>
      <Text style={devRowStyle.label}>{label}</Text>
      <Text style={[devRowStyle.value, { color }]}>{value}</Text>
    </View>
  );
}

const devRowStyle = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#1A1A2E' },
  label: { fontSize: 12, color: '#8B8FA8' },
  value: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export default function SettingsScreen() {
  const user = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [institution, setInstitution] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [devOpen, setDevOpen] = useState(false);
  const [devMetrics, setDevMetrics] = useState<InferenceMetrics>(getInferenceMetrics());
  const devInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    loadLocalProfile(user.uid).then((p) => {
      if (p) {
        setProfile(p);
        setDisplayName(p.displayName);
        setInstitution(p.institution);
      } else {
        setDisplayName('');
        setInstitution('');
      }
    });
    loadLocalScans(user.uid).then((scans) => setScanCount(scans.length));
  }, [user]);

  useEffect(() => {
    if (devOpen) {
      setDevMetrics(getInferenceMetrics());
      devInterval.current = setInterval(() => setDevMetrics(getInferenceMetrics()), 2000);
    } else {
      if (devInterval.current) clearInterval(devInterval.current);
    }
    return () => { if (devInterval.current) clearInterval(devInterval.current); };
  }, [devOpen]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const updated: UserProfile = {
        uid: user.uid,
        email: user.email ?? '',
        displayName: displayName.trim(),
        institution: institution.trim(),
        createdAt: profile?.createdAt ?? new Date().toISOString(),
      };
      await saveLocalProfile(updated);
      setProfile(updated);
      try {
        await updateUserProfile(user.uid, {
          displayName: updated.displayName,
          institution: updated.institution,
        });
      } catch {
        // Cloud update failed; local save succeeded
      }
      Alert.alert('Saved', 'Profile updated successfully.');
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => signOut(auth),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Practitioner Profile & Preferences</Text>

        {/* Account info */}
        <Card style={styles.accountCard}>
          <View style={styles.accountRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(displayName || user?.email || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName}>{displayName || 'Practitioner'}</Text>
              <Text style={styles.accountEmail}>{user?.email}</Text>
            </View>
          </View>
        </Card>

        {/* Profile edit */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Information</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Dr. Jane Smith"
              placeholderTextColor="#4A4A6A"
              autoComplete="name"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Institution</Text>
            <TextInput
              style={styles.input}
              value={institution}
              onChangeText={setInstitution}
              placeholder="General Hospital"
              placeholderTextColor="#4A4A6A"
            />
          </View>

          <Button
            onPress={handleSave}
            title="Save Profile"
            loading={saving}
            style={{ marginTop: 4 }}
          />
        </Card>

        {/* Storage stats */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Data Storage</Text>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{scanCount}</Text>
              <Text style={styles.statLabel}>Local Scans</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.storageIndicator}>
                <View style={styles.storageIndicatorDot} />
                <Text style={styles.storageIndicatorText}>Local</Text>
              </View>
              <Text style={styles.statLabel}>Storage Mode</Text>
            </View>
          </View>
          <Text style={styles.storageNote}>
            All patient data is stored locally on this device with optional Firestore cloud sync
            when a connection is available.
          </Text>
        </Card>

        {/* Security */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.securityRow}>
            <View style={styles.securityDot} />
            <Text style={styles.securityText}>HIPAA Compliant Environment</Text>
          </View>
          <Text style={styles.securityNote}>
            Patient data is stored with end-to-end encryption. Access is restricted to
            authenticated practitioners only. All sessions are secured with Firebase Auth.
          </Text>
        </Card>

        {/* App info */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Model</Text>
            <Text style={styles.infoValue}>MobileViT BI-RADS v1</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Classifications</Text>
            <Text style={styles.infoValue}>BI-RADS 1–5</Text>
          </View>
        </Card>

        {/* Developer Options */}
        <Card style={styles.section}>
          <TouchableOpacity onPress={() => setDevOpen((v) => !v)} style={styles.devHeader}>
            <Text style={styles.sectionTitle}>Developer Options</Text>
            <Text style={styles.devChevron}>{devOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {devOpen && (
            <View style={styles.devBody}>
              <DevRow
                label="Model Status"
                value={devMetrics.modelStatus.toUpperCase()}
                color={devMetrics.modelStatus === 'ready' ? '#00FF88' : devMetrics.modelStatus === 'loading' ? '#FFB822' : '#8B8FA8'}
              />
              <DevRow
                label="Model Size"
                value={
                  devMetrics.modelSizeBytes !== null
                    ? `${(devMetrics.modelSizeBytes / 1024 / 1024).toFixed(2)} MB`
                    : 'No model loaded'
                }
              />
              <DevRow
                label="Last Inference"
                value={devMetrics.lastInferenceMs !== null ? `${devMetrics.lastInferenceMs} ms` : '—'}
                color={
                  devMetrics.lastInferenceMs === null ? '#8B8FA8'
                  : devMetrics.lastInferenceMs < 300 ? '#00FF88'
                  : devMetrics.lastInferenceMs < 700 ? '#FFB822'
                  : '#FF6B35'
                }
              />
              <DevRow
                label="Avg Inference"
                value={devMetrics.avgInferenceMs !== null ? `${devMetrics.avgInferenceMs} ms` : '—'}
              />
              <DevRow
                label="Total Inferences"
                value={String(devMetrics.totalInferences)}
              />
              <DevRow
                label="Last Run At"
                value={
                  devMetrics.lastInferenceAt
                    ? new Date(devMetrics.lastInferenceAt).toLocaleTimeString()
                    : '—'
                }
              />
              <Text style={styles.devNote}>Auto-refreshes every 2 seconds</Text>
            </View>
          )}
        </Card>

        {/* Sign out */}
        <Button
          onPress={handleSignOut}
          title="Sign Out"
          variant="danger"
          style={styles.signOutBtn}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { flex: 1 },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#E2E8F0', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#8B8FA8', marginBottom: 20 },
  accountCard: { marginBottom: 16 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#00F2FF20',
    borderWidth: 1,
    borderColor: '#00F2FF40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#00F2FF' },
  accountName: { fontSize: 16, fontWeight: '600', color: '#E2E8F0' },
  accountEmail: { fontSize: 13, color: '#8B8FA8', marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#8B8FA8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: '#8B8FA8', fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  input: {
    backgroundColor: '#111120',
    borderWidth: 1,
    borderColor: '#2A2A4A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#E2E8F0',
  },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '700', color: '#00F2FF' },
  statLabel: { fontSize: 11, color: '#8B8FA8', marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: '#2A2A4A', marginHorizontal: 16 },
  storageIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storageIndicatorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00FF88' },
  storageIndicatorText: { fontSize: 15, fontWeight: '700', color: '#00FF88' },
  storageNote: { fontSize: 12, color: '#8B8FA8', lineHeight: 18 },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  securityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00FF88' },
  securityText: { fontSize: 14, color: '#00FF88', fontWeight: '600' },
  securityNote: { fontSize: 12, color: '#8B8FA8', lineHeight: 18 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2A2A4A' },
  infoLabel: { fontSize: 13, color: '#8B8FA8' },
  infoValue: { fontSize: 13, color: '#E2E8F0', fontWeight: '500' },
  signOutBtn: { marginTop: 8 },
  devHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  devChevron: { fontSize: 11, color: '#8B8FA8' },
  devBody: { marginTop: 10 },
  devNote: { fontSize: 11, color: '#4A4A6A', marginTop: 10, textAlign: 'center' },
});
