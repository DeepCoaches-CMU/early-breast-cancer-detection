import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { createUserProfile } from '../lib/firebase';
import { saveLocalProfile } from '../lib/storage';
import { Button } from '../components/Button';

interface Props {
  onLogin: (user: User) => void;
}

export default function AuthScreen({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [institution, setInstitution] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (!displayName.trim()) {
        setError('Display name is required.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        onLogin(cred.user);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const profile = {
          uid: cred.user.uid,
          email: email.trim(),
          displayName: displayName.trim(),
          institution: institution.trim(),
        };
        await saveLocalProfile({ ...profile, createdAt: new Date().toISOString() });
        try {
          await createUserProfile(profile);
        } catch {
          // Firestore not available; local profile already saved
        }
        onLogin(cred.user);
      }
    } catch (e: any) {
      const msg = e?.code ?? e?.message ?? 'Authentication failed.';
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Invalid email or password.');
      } else if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists.');
      } else if (msg.includes('weak-password')) {
        setError('Password must be at least 6 characters.');
      } else {
        setError('Authentication failed. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <View style={styles.logoDot} />
              <Text style={styles.logoText}>MamoVision AI</Text>
            </View>
            <Text style={styles.tagline}>AI-Assisted Breast Ultrasound Diagnostics</Text>
            <View style={styles.hipaaRow}>
              <View style={styles.hipaaDot} />
              <Text style={styles.hipaaText}>HIPAA Compliant Environment</Text>
            </View>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {mode === 'login' ? 'Practitioner Login' : 'Create Account'}
            </Text>

            {error !== '' && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Work Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="doctor@hospital.com"
                placeholderTextColor="#4A4A6A"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            {mode === 'register' && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Full Name</Text>
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
              </>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#4A4A6A"
                secureTextEntry
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </View>

            {mode === 'register' && (
              <View style={styles.field}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#4A4A6A"
                  secureTextEntry
                />
              </View>
            )}

            <Button
              onPress={handleSubmit}
              title={mode === 'login' ? 'Sign In' : 'Create Account'}
              loading={loading}
              style={styles.submitBtn}
            />

            <TouchableOpacity
              onPress={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
              style={styles.toggle}
            >
              <Text style={styles.toggleText}>
                {mode === 'login'
                  ? "Don't have an account? Register"
                  : 'Already have an account? Sign In'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            For authorized medical practitioners only. All diagnostic data is stored securely.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00F2FF',
    marginRight: 10,
    shadowColor: '#00F2FF',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  logoText: { fontSize: 26, fontWeight: '700', color: '#E2E8F0', letterSpacing: 0.5 },
  tagline: { fontSize: 13, color: '#8B8FA8', marginBottom: 12, textAlign: 'center' },
  hipaaRow: { flexDirection: 'row', alignItems: 'center' },
  hipaaDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00FF88', marginRight: 6 },
  hipaaText: { fontSize: 11, color: '#00FF88', fontWeight: '600', letterSpacing: 0.5 },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    padding: 24,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#E2E8F0', marginBottom: 20 },
  errorBox: {
    backgroundColor: '#FF3B3B18',
    borderWidth: 1,
    borderColor: '#FF3B3B40',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { fontSize: 13, color: '#FF3B3B' },
  field: { marginBottom: 16 },
  label: { fontSize: 12, color: '#8B8FA8', fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  input: {
    backgroundColor: '#111120',
    borderWidth: 1,
    borderColor: '#2A2A4A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#E2E8F0',
  },
  submitBtn: { marginTop: 8 },
  toggle: { marginTop: 16, alignItems: 'center' },
  toggleText: { fontSize: 13, color: '#00F2FF' },
  footer: { fontSize: 11, color: '#4A4A6A', textAlign: 'center', marginTop: 24, lineHeight: 16 },
});
