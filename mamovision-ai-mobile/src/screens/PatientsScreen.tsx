import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useUser } from '../contexts/UserContext';
import { loadLocalScans } from '../lib/storage';
import { Card } from '../components/Card';
import { Badge, classificationToBadgeType } from '../components/Badge';
import { ScanResult, Patient } from '../types';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function groupByPatient(scans: ScanResult[]): Patient[] {
  const map = new Map<string, ScanResult[]>();
  for (const scan of scans) {
    if (!map.has(scan.patientId)) map.set(scan.patientId, []);
    map.get(scan.patientId)!.push(scan);
  }

  const patients: Patient[] = [];
  map.forEach((patientScans, id) => {
    const sorted = patientScans.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    patients.push({
      id,
      scanCount: patientScans.length,
      lastActivity: sorted[0].createdAt,
      latestClassification: sorted[0].classification,
    });
  });

  return patients.sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  );
}

export default function PatientsScreen() {
  const user = useUser();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [allScans, setAllScans] = useState<ScanResult[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientScans, setPatientScans] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);
      loadLocalScans(user.uid).then((scans) => {
        setAllScans(scans);
        setPatients(groupByPatient(scans));
        setLoading(false);
      });
    }, [user]),
  );

  function openPatient(patient: Patient) {
    const scans = allScans
      .filter((s) => s.patientId === patient.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setPatientScans(scans);
    setSelectedPatient(patient);
  }

  function renderPatient({ item }: { item: Patient }) {
    return (
      <TouchableOpacity onPress={() => openPatient(item)} activeOpacity={0.8}>
        <Card style={styles.patientCard}>
          <View style={styles.patientRow}>
            <View style={styles.patientAvatar}>
              <Text style={styles.patientAvatarText}>{item.id.slice(0, 2)}</Text>
            </View>
            <View style={styles.patientInfo}>
              <Text style={styles.patientId}>{item.id}</Text>
              <Text style={styles.patientMeta}>
                {item.scanCount} scan{item.scanCount !== 1 ? 's' : ''} ·{' '}
                Last: {formatDate(item.lastActivity)}
              </Text>
            </View>
            {item.latestClassification && (
              <Badge
                label={item.latestClassification}
                type={classificationToBadgeType(item.latestClassification)}
              />
            )}
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Patients</Text>
        <Text style={styles.subtitle}>
          {patients.length} patient{patients.length !== 1 ? 's' : ''} on record
        </Text>
      </View>

      <FlatList
        data={patients}
        keyExtractor={(item) => item.id}
        renderItem={renderPatient}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyTitle}>No Patients Yet</Text>
              <Text style={styles.emptySub}>
                Save scans in the Diagnostics tab to build a patient registry.
              </Text>
            </View>
          ) : null
        }
      />

      {/* Patient detail modal */}
      <Modal
        visible={selectedPatient !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPatient(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {selectedPatient && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.patientAvatarLarge}>
                    <Text style={styles.patientAvatarLargeText}>
                      {selectedPatient.id.slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalPatientId}>{selectedPatient.id}</Text>
                    <Text style={styles.modalPatientMeta}>
                      {selectedPatient.scanCount} scan
                      {selectedPatient.scanCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedPatient(null)}>
                    <Text style={styles.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.scanHistoryLabel}>Scan History</Text>

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  {patientScans.map((scan) => (
                    <Card key={scan.id} style={styles.modalScanCard}>
                      <View style={styles.modalScanRow}>
                        <View>
                          <Text style={styles.modalScanDate}>{formatDate(scan.createdAt)}</Text>
                          {scan.confidence != null && (
                            <Text style={styles.modalScanConf}>
                              Confidence: {(scan.confidence * 100).toFixed(1)}%
                            </Text>
                          )}
                        </View>
                        {scan.classification && (
                          <Badge
                            label={scan.classification}
                            type={classificationToBadgeType(scan.classification)}
                          />
                        )}
                      </View>

                      {scan.observations && scan.observations.length > 0 && (
                        <View style={styles.obsContainer}>
                          {scan.observations.slice(0, 2).map((obs, i) => (
                            <Text key={i} style={styles.obsItem}>
                              · {obs}
                            </Text>
                          ))}
                          {scan.observations.length > 2 && (
                            <Text style={styles.obsMore}>
                              +{scan.observations.length - 2} more...
                            </Text>
                          )}
                        </View>
                      )}
                    </Card>
                  ))}
                  <View style={{ height: 40 }} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#E2E8F0' },
  subtitle: { fontSize: 12, color: '#8B8FA8', marginTop: 2 },
  list: { padding: 16, gap: 10 },
  patientCard: { padding: 14 },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  patientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00F2FF20',
    borderWidth: 1,
    borderColor: '#00F2FF40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientAvatarText: { fontSize: 14, fontWeight: '700', color: '#00F2FF' },
  patientInfo: { flex: 1 },
  patientId: { fontSize: 15, fontWeight: '600', color: '#E2E8F0' },
  patientMeta: { fontSize: 12, color: '#8B8FA8', marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#E2E8F0', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#8B8FA8', textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2A2A4A',
    padding: 24,
    paddingBottom: 0,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#2A2A4A',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  patientAvatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#00F2FF20',
    borderWidth: 1,
    borderColor: '#00F2FF40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientAvatarLargeText: { fontSize: 18, fontWeight: '700', color: '#00F2FF' },
  modalPatientId: { fontSize: 18, fontWeight: '700', color: '#E2E8F0' },
  modalPatientMeta: { fontSize: 13, color: '#8B8FA8', marginTop: 2 },
  closeBtn: { fontSize: 18, color: '#8B8FA8', padding: 4 },
  scanHistoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8B8FA8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  modalScroll: { flex: 1 },
  modalScanCard: { marginBottom: 10 },
  modalScanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalScanDate: { fontSize: 14, fontWeight: '600', color: '#E2E8F0' },
  modalScanConf: { fontSize: 12, color: '#8B8FA8', marginTop: 2 },
  obsContainer: { marginTop: 10 },
  obsItem: { fontSize: 12, color: '#8B8FA8', marginBottom: 3, lineHeight: 18 },
  obsMore: { fontSize: 11, color: '#4A4A6A', marginTop: 2 },
});
