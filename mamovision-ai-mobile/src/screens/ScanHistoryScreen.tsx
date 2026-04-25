import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useUser } from '../contexts/UserContext';
import { loadLocalScans, deleteLocalScan } from '../lib/storage';
import { Card } from '../components/Card';
import { Badge, classificationToBadgeType } from '../components/Badge';
import { Button } from '../components/Button';
import { ScanResult } from '../types';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ScanHistoryScreen() {
  const user = useUser();
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScan, setSelectedScan] = useState<ScanResult | null>(null);

  const loadScans = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await loadLocalScans(user.uid);
    setScans(data);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadScans();
    }, [loadScans]),
  );

  async function handleDelete(scanId: string) {
    if (!user) return;
    Alert.alert('Delete Scan', 'Remove this scan from records?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLocalScan(user.uid, scanId);
          setSelectedScan(null);
          await loadScans();
        },
      },
    ]);
  }

  function renderScanItem({ item }: { item: ScanResult }) {
    return (
      <TouchableOpacity onPress={() => setSelectedScan(item)} activeOpacity={0.8}>
        <Card style={styles.scanCard}>
          <View style={styles.scanRow}>
            <View style={styles.scanInfo}>
              <Text style={styles.scanPatient}>{item.patientId}</Text>
              <Text style={styles.scanDate}>{formatDate(item.createdAt)}</Text>
            </View>
            <View style={styles.scanRight}>
              {item.classification && (
                <Badge
                  label={item.classification}
                  type={classificationToBadgeType(item.classification)}
                />
              )}
              {item.confidence != null && (
                <Text style={styles.confText}>{(item.confidence * 100).toFixed(1)}%</Text>
              )}
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan History</Text>
        <Text style={styles.subtitle}>{scans.length} record{scans.length !== 1 ? 's' : ''}</Text>
      </View>

      <FlatList
        data={scans}
        keyExtractor={(item) => item.id}
        renderItem={renderScanItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadScans}
            tintColor="#00F2FF"
            colors={['#00F2FF']}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No Scans Yet</Text>
              <Text style={styles.emptySub}>
                Analyze an ultrasound image in the Diagnostics tab to create your first record.
              </Text>
            </View>
          ) : null
        }
      />

      {/* Scan detail modal */}
      <Modal
        visible={selectedScan !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedScan(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedScan && (
                <>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={styles.modalPatient}>{selectedScan.patientId}</Text>
                      <Text style={styles.modalDate}>{formatDate(selectedScan.createdAt)}</Text>
                    </View>
                    {selectedScan.classification && (
                      <Badge
                        label={selectedScan.classification}
                        type={classificationToBadgeType(selectedScan.classification)}
                      />
                    )}
                  </View>

                  {selectedScan.confidence != null && (
                    <Card style={styles.confCard}>
                      <Text style={styles.detailLabel}>Confidence Score</Text>
                      <Text style={styles.detailConfValue}>
                        {(selectedScan.confidence * 100).toFixed(1)}%
                      </Text>
                      <View style={styles.confBarTrack}>
                        <View
                          style={[
                            styles.confBarFill,
                            { width: `${selectedScan.confidence * 100}%` as any },
                          ]}
                        />
                      </View>
                    </Card>
                  )}

                  {selectedScan.observations && selectedScan.observations.length > 0 && (
                    <Card style={styles.detailCard}>
                      <Text style={styles.detailLabel}>Observations</Text>
                      {selectedScan.observations.map((obs, i) => (
                        <View key={i} style={styles.obsRow}>
                          <View style={styles.obsDot} />
                          <Text style={styles.obsText}>{obs}</Text>
                        </View>
                      ))}
                    </Card>
                  )}

                  {selectedScan.analysisText && (
                    <Card style={styles.detailCard}>
                      <Text style={styles.detailLabel}>Clinical Analysis</Text>
                      <Text style={styles.analysisText}>{selectedScan.analysisText}</Text>
                    </Card>
                  )}

                  <View style={styles.modalActions}>
                    <Button
                      onPress={() => handleDelete(selectedScan.id)}
                      title="Delete Record"
                      variant="danger"
                      style={styles.deleteBtn}
                    />
                    <Button
                      onPress={() => setSelectedScan(null)}
                      title="Close"
                      variant="outline"
                    />
                  </View>
                </>
              )}
            </ScrollView>
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
  scanCard: { padding: 14 },
  scanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanInfo: { flex: 1, marginRight: 12 },
  scanPatient: { fontSize: 15, fontWeight: '600', color: '#E2E8F0' },
  scanDate: { fontSize: 12, color: '#8B8FA8', marginTop: 3 },
  scanRight: { alignItems: 'flex-end', gap: 4 },
  confText: { fontSize: 12, color: '#8B8FA8' },
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
    paddingBottom: 40,
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalPatient: { fontSize: 18, fontWeight: '700', color: '#E2E8F0' },
  modalDate: { fontSize: 13, color: '#8B8FA8', marginTop: 3 },
  confCard: { marginBottom: 12 },
  detailCard: { marginBottom: 12 },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8B8FA8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  detailConfValue: { fontSize: 28, fontWeight: '700', color: '#00F2FF', marginBottom: 8 },
  confBarTrack: { height: 6, backgroundColor: '#2A2A4A', borderRadius: 3, overflow: 'hidden' },
  confBarFill: { height: '100%', backgroundColor: '#00F2FF', borderRadius: 3 },
  obsRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  obsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00F2FF', marginTop: 5, marginRight: 10 },
  obsText: { flex: 1, fontSize: 14, color: '#E2E8F0', lineHeight: 20 },
  analysisText: { fontSize: 13, color: '#C4C9D9', lineHeight: 20 },
  modalActions: { gap: 10, marginTop: 8 },
  deleteBtn: {},
});
