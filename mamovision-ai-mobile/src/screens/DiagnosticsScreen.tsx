import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useUser } from '../contexts/UserContext';
import { analyzeImage, getClassificationColor } from '../lib/inference';
import { saveLocalScan, generateScanId, generatePatientId } from '../lib/storage';
import { saveCloudScan } from '../lib/firebase';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge, classificationToBadgeType } from '../components/Badge';
import { AnalysisResult, ScanResult } from '../types';

export default function DiagnosticsScreen() {
  const user = useUser();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [patientId, setPatientId] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [savedScanId, setSavedScanId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showPickerModal, setShowPickerModal] = useState(false);

  async function pickImage(source: 'camera' | 'library') {
    setShowPickerModal(false);
    setError('');
    setResult(null);
    setSavedScanId(null);

    let permResult;
    if (source === 'camera') {
      permResult = await ImagePicker.requestCameraPermissionsAsync();
    } else {
      permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }

    if (!permResult.granted) {
      setError('Permission denied. Please enable access in Settings.');
      return;
    }

    const pickerResult =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: 'images',
            allowsEditing: false,
            quality: 0.7,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            allowsEditing: false,
            quality: 0.7,
            base64: true,
          });

    if (!pickerResult.canceled && pickerResult.assets[0]) {
      const asset = pickerResult.assets[0];
      setImageUri(asset.uri);
      setImageBase64(asset.base64 ?? null);
      if (!patientId.trim()) {
        setPatientId(generatePatientId());
      }
    }
  }

  async function handleAnalyze() {
    if (!imageUri || !user) return;
    setIsAnalyzing(true);
    setError('');
    setResult(null);
    setSavedScanId(null);
    try {
      const analysisResult = await analyzeImage(imageUri);
      setResult(analysisResult);
    } catch (e: any) {
      setError('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!result || !user) return;

    const scanId = generateScanId();
    const scan: ScanResult = {
      id: scanId,
      patientId: patientId.trim() || generatePatientId(),
      imageUri: imageUri ?? undefined,
      imageBase64: imageBase64 ?? undefined,
      classification: result.classification,
      confidence: result.confidence,
      observations: result.observations,
      analysisText: result.analysisText,
      createdAt: new Date().toISOString(),
      practitionerId: user.uid,
    };

    await saveLocalScan(user.uid, scan);
    try {
      await saveCloudScan(scan);
    } catch {
      // Cloud unavailable; local save succeeded
    }

    setSavedScanId(scanId);
    Alert.alert('Saved', 'Scan saved to patient record.');
  }

  async function handleExport() {
    if (!result) return;

    const date = new Date().toLocaleString();
    const confPct = (result.confidence * 100).toFixed(1);
    const observationsHtml = result.observations
      .map((o) => `<li>${o}</li>`)
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
          h1 { color: #0A0A5F; font-size: 22px; border-bottom: 2px solid #0A0A5F; padding-bottom: 8px; }
          h2 { color: #1A1A6E; font-size: 16px; margin-top: 20px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 700;
                   background: #0A0A5F22; color: #0A0A5F; font-size: 14px; }
          .meta { color: #555; font-size: 13px; margin: 4px 0; }
          ul { margin: 8px 0; padding-left: 20px; }
          li { margin: 4px 0; font-size: 14px; }
          pre { background: #f5f5f5; padding: 16px; border-radius: 6px; font-size: 13px;
                white-space: pre-wrap; word-wrap: break-word; }
          .footer { margin-top: 40px; color: #888; font-size: 11px; border-top: 1px solid #ddd;
                    padding-top: 12px; }
        </style>
      </head>
      <body>
        <h1>MamoVision AI — Diagnostic Report</h1>
        <p class="meta"><strong>Patient ID:</strong> ${patientId || 'N/A'}</p>
        <p class="meta"><strong>Date:</strong> ${date}</p>
        <p class="meta"><strong>Practitioner:</strong> ${user?.email ?? 'N/A'}</p>

        <h2>Classification</h2>
        <span class="badge">${result.classification}</span>
        <p class="meta">Confidence: ${confPct}%</p>

        <h2>Observations</h2>
        <ul>${observationsHtml}</ul>

        <h2>Analysis</h2>
        <pre>${result.analysisText}</pre>

        <div class="footer">
          Generated by MamoVision AI · For clinical use by authorized practitioners only ·
          This report is AI-assisted and requires clinical validation.
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Diagnostic Report',
        });
      } else {
        Alert.alert('Sharing unavailable', 'PDF saved at: ' + uri);
      }
    } catch {
      Alert.alert('Export failed', 'Unable to generate PDF.');
    }
  }

  function resetScan() {
    setImageUri(null);
    setImageBase64(null);
    setPatientId('');
    setResult(null);
    setSavedScanId(null);
    setError('');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>Diagnostics</Text>
            <Text style={styles.screenSub}>Breast Ultrasound Analysis</Text>
          </View>
          {imageUri && (
            <TouchableOpacity onPress={resetScan} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Patient ID */}
        <Card style={styles.patientCard}>
          <Text style={styles.fieldLabel}>Patient ID</Text>
          <View style={styles.patientRow}>
            <TextInput
              style={[styles.input, styles.patientInput]}
              value={patientId}
              onChangeText={setPatientId}
              placeholder="Enter patient ID or auto-generate"
              placeholderTextColor="#4A4A6A"
              autoCapitalize="characters"
            />
            <TouchableOpacity
              onPress={() => setPatientId(generatePatientId())}
              style={styles.genBtn}
            >
              <Text style={styles.genBtnText}>Auto</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Image area */}
        {!imageUri ? (
          <TouchableOpacity
            style={styles.uploadArea}
            onPress={() => setShowPickerModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.uploadIcon}>
              <Text style={styles.uploadIconText}>↑</Text>
            </View>
            <Text style={styles.uploadTitle}>Upload Ultrasound Image</Text>
            <Text style={styles.uploadSub}>Tap to select from gallery or capture with camera</Text>
            <Text style={styles.uploadFormats}>Supported: JPEG · PNG</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.imageWrapper}>
            <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
            <TouchableOpacity
              style={styles.changeImageBtn}
              onPress={() => setShowPickerModal(true)}
            >
              <Text style={styles.changeImageText}>Change Image</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Error */}
        {error !== '' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Analyze button */}
        {imageUri && !result && (
          <Button
            onPress={handleAnalyze}
            title={isAnalyzing ? 'Analyzing...' : 'Run AI Analysis'}
            loading={isAnalyzing}
            style={styles.analyzeBtn}
          />
        )}

        {/* Analyzing indicator */}
        {isAnalyzing && (
          <Card style={styles.analyzingCard}>
            <ActivityIndicator color="#00F2FF" style={{ marginBottom: 10 }} />
            <Text style={styles.analyzingText}>Processing ultrasound image...</Text>
            <Text style={styles.analyzingSub}>Running BI-RADS classification model</Text>
          </Card>
        )}

        {/* Results */}
        {result && (
          <View style={styles.resultsSection}>
            <Text style={styles.sectionTitle}>Analysis Results</Text>

            {/* Classification */}
            <Card style={styles.classCard}>
              <View style={styles.classRow}>
                <Badge
                  label={result.classification}
                  type={classificationToBadgeType(result.classification)}
                  style={styles.classBadge}
                />
                <View style={styles.confContainer}>
                  <Text style={styles.confLabel}>Confidence</Text>
                  <Text
                    style={[
                      styles.confValue,
                      { color: getClassificationColor(result.classification) },
                    ]}
                  >
                    {(result.confidence * 100).toFixed(1)}%
                  </Text>
                </View>
              </View>

              {/* Confidence bar */}
              <View style={styles.confBarTrack}>
                <View
                  style={[
                    styles.confBarFill,
                    {
                      width: `${result.confidence * 100}%` as any,
                      backgroundColor: getClassificationColor(result.classification),
                    },
                  ]}
                />
              </View>
            </Card>

            {/* Observations */}
            <Card style={styles.observCard}>
              <Text style={styles.cardSectionTitle}>Observations</Text>
              {result.observations.map((obs, i) => (
                <View key={i} style={styles.obsRow}>
                  <View style={styles.obsDot} />
                  <Text style={styles.obsText}>{obs}</Text>
                </View>
              ))}
            </Card>

            {/* Analysis text */}
            <Card style={styles.analysisCard}>
              <Text style={styles.cardSectionTitle}>Clinical Analysis</Text>
              <Text style={styles.analysisText}>{result.analysisText}</Text>
            </Card>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <Button
                onPress={handleSave}
                title={savedScanId ? 'Saved ✓' : 'Save to Records'}
                variant={savedScanId ? 'outline' : 'primary'}
                disabled={savedScanId !== null}
                style={styles.actionBtn}
              />
              <Button
                onPress={handleExport}
                title="Export PDF"
                variant="outline"
                style={styles.actionBtn}
              />
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Image source picker modal */}
      <Modal
        visible={showPickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPickerModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPickerModal(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Image Source</Text>
            <Button
              onPress={() => pickImage('camera')}
              title="Camera"
              style={styles.modalBtn}
            />
            <Button
              onPress={() => pickImage('library')}
              title="Photo Library"
              variant="outline"
              style={styles.modalBtn}
            />
            <Button
              onPress={() => setShowPickerModal(false)}
              title="Cancel"
              variant="ghost"
              style={styles.modalBtn}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { flex: 1 },
  content: { padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: '#E2E8F0' },
  screenSub: { fontSize: 12, color: '#8B8FA8', marginTop: 2 },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  clearBtnText: { fontSize: 13, color: '#8B8FA8' },
  patientCard: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: '#8B8FA8', fontWeight: '600', marginBottom: 8, letterSpacing: 0.3 },
  patientRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: '#111120',
    borderWidth: 1,
    borderColor: '#2A2A4A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#E2E8F0',
  },
  patientInput: { flex: 1 },
  genBtn: {
    backgroundColor: '#00F2FF20',
    borderWidth: 1,
    borderColor: '#00F2FF40',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  genBtnText: { fontSize: 13, color: '#00F2FF', fontWeight: '600' },
  uploadArea: {
    borderWidth: 2,
    borderColor: '#2A2A4A',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 48,
    alignItems: 'center',
    marginBottom: 16,
  },
  uploadIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00F2FF15',
    borderWidth: 1,
    borderColor: '#00F2FF40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  uploadIconText: { fontSize: 24, color: '#00F2FF' },
  uploadTitle: { fontSize: 16, fontWeight: '600', color: '#E2E8F0', marginBottom: 6 },
  uploadSub: { fontSize: 13, color: '#8B8FA8', textAlign: 'center', paddingHorizontal: 24 },
  uploadFormats: { fontSize: 11, color: '#4A4A6A', marginTop: 12 },
  imageWrapper: { marginBottom: 16 },
  image: {
    width: '100%',
    height: 280,
    borderRadius: 14,
    backgroundColor: '#111120',
  },
  changeImageBtn: {
    marginTop: 8,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  changeImageText: { fontSize: 13, color: '#8B8FA8' },
  errorBox: {
    backgroundColor: '#FF3B3B18',
    borderWidth: 1,
    borderColor: '#FF3B3B40',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 13, color: '#FF3B3B' },
  analyzeBtn: { marginBottom: 16 },
  analyzingCard: { alignItems: 'center', marginBottom: 16 },
  analyzingText: { fontSize: 15, color: '#E2E8F0', fontWeight: '600' },
  analyzingSub: { fontSize: 12, color: '#8B8FA8', marginTop: 4 },
  resultsSection: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#E2E8F0', marginBottom: 4 },
  classCard: { padding: 16 },
  classRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  classBadge: {},
  confContainer: { alignItems: 'flex-end' },
  confLabel: { fontSize: 11, color: '#8B8FA8', marginBottom: 2 },
  confValue: { fontSize: 20, fontWeight: '700' },
  confBarTrack: {
    height: 6,
    backgroundColor: '#2A2A4A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confBarFill: { height: '100%', borderRadius: 3 },
  observCard: {},
  cardSectionTitle: { fontSize: 13, fontWeight: '700', color: '#8B8FA8', marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  obsRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  obsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00F2FF', marginTop: 5, marginRight: 10 },
  obsText: { flex: 1, fontSize: 14, color: '#E2E8F0', lineHeight: 20 },
  analysisCard: {},
  analysisText: { fontSize: 13, color: '#C4C9D9', lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000090',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2A2A4A',
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#E2E8F0', marginBottom: 16, textAlign: 'center' },
  modalBtn: { marginBottom: 10 },
});
