/**
 * Inference entry point for MobileFCMViTv3.
 *
 * Currently runs a fake model that exercises the full preprocessing pipeline
 * and produces realistic BI-RADS results based on the actual tensor content.
 *
 * To plug in the real model:
 *   1. Follow model_integration.md to load your .onnx session.
 *   2. Replace the body of runModel() below — keep everything else unchanged.
 */

import { AnalysisResult, BiRadsClass } from '../types';
import { preprocessForModel, ModelInputs } from './preprocessing';

// ─── BI-RADS display content ──────────────────────────────────────────────────
const OBSERVATIONS: Record<BiRadsClass, string[]> = {
  'BI-RADS 1': [
    'No suspicious findings detected',
    'Normal breast tissue architecture',
    'No mass, distortion, or calcification',
    'Negative study',
  ],
  'BI-RADS 2': [
    'Benign finding present',
    'Simple cyst identified',
    'No malignant features observed',
    'Routine follow-up recommended',
  ],
  'BI-RADS 3': [
    'Probably benign finding',
    'Short-interval follow-up suggested',
    'Low suspicion for malignancy',
    'Six-month follow-up recommended',
  ],
  'BI-RADS 4': [
    'Suspicious abnormality detected',
    'Biopsy should be considered',
    'Irregular hypoechoic mass noted',
    'Moderate to high suspicion for malignancy',
  ],
  'BI-RADS 5': [
    'Highly suspicious for malignancy',
    'Biopsy strongly recommended',
    'Spiculated mass with posterior shadowing',
    'High probability of malignancy',
  ],
};

const ANALYSIS_TEXTS: Record<BiRadsClass, string> = {
  'BI-RADS 1':
    'NEGATIVE\n\nThe ultrasound examination demonstrates normal breast parenchyma without evidence of suspicious masses, architectural distortion, or abnormal calcifications. Breast tissue appears homogeneous with normal ductal architecture.\n\nRecommendation: Routine annual screening as per age-appropriate guidelines.',
  'BI-RADS 2':
    'BENIGN\n\nA benign finding is identified. The lesion demonstrates classic benign features including well-circumscribed margins, anechoic interior, and posterior acoustic enhancement consistent with a simple cyst.\n\nRecommendation: Routine follow-up. No additional imaging or intervention required.',
  'BI-RADS 3':
    'PROBABLY BENIGN\n\nA probably benign finding is present with less than 2% risk of malignancy based on imaging characteristics. The lesion demonstrates predominantly benign features.\n\nRecommendation: Short-interval follow-up ultrasound in 6 months to assess stability.',
  'BI-RADS 4':
    'SUSPICIOUS\n\nA suspicious lesion requiring tissue sampling is identified. The mass demonstrates irregular margins, heterogeneous echotexture, and shadowing raising concern for malignancy.\n\nRecommendation: Ultrasound-guided core needle biopsy is recommended for histological diagnosis.',
  'BI-RADS 5':
    'HIGHLY SUGGESTIVE OF MALIGNANCY\n\nHighly suspicious findings are present. A spiculated hypoechoic mass with posterior acoustic shadowing, taller-than-wide orientation, and angular margins is identified, consistent with invasive malignancy.\n\nRecommendation: Tissue biopsy required. Multidisciplinary oncology consultation recommended.',
};

// ─── Metrics ──────────────────────────────────────────────────────────────────
export interface InferenceMetrics {
  modelStatus: 'placeholder' | 'loading' | 'ready';
  modelSizeBytes: number | null;
  lastInferenceMs: number | null;
  avgInferenceMs: number | null;
  totalInferences: number;
  lastInferenceAt: string | null;
}

const metrics: InferenceMetrics = {
  modelStatus: 'placeholder',
  modelSizeBytes: null,
  lastInferenceMs: null,
  avgInferenceMs: null,
  totalInferences: 0,
  lastInferenceAt: null,
};

export function getInferenceMetrics(): InferenceMetrics { return { ...metrics }; }
export function setModelMetrics(status: InferenceMetrics['modelStatus'], sizeBytes: number | null) {
  metrics.modelStatus = status;
  metrics.modelSizeBytes = sizeBytes;
}

// ─── Softmax helper ───────────────────────────────────────────────────────────
function softmax(logits: [number, number, number]): [number, number, number] {
  const max = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - max));
  const sum  = exps.reduce((a, b) => a + b, 0);
  return [exps[0] / sum, exps[1] / sum, exps[2] / sum];
}

// ─── Fake model ───────────────────────────────────────────────────────────────
// Derives class scores directly from the preprocessed tensors so the output
// responds to actual image content rather than being random.
// Output order: [P(normal), P(benign), P(malignant)]
//
// Replace this function body with your ONNX session.run() call once the model
// file is in assets/models/. Keep the [normal, benign, malignant] return format.
function runModel(inputs: ModelInputs): [number, number, number] {
  const { imageTensor, fcmTensor } = inputs;
  const n = imageTensor.length; // 224×224 = 50 176

  // --- Image branch: measure heterogeneity from normalised tensor ---
  let imgSum = 0, imgSumSq = 0;
  for (let i = 0; i < n; i++) {
    imgSum   += imageTensor[i];
    imgSumSq += imageTensor[i] * imageTensor[i];
  }
  const imgMean = imgSum / n;
  const imgVar  = imgSumSq / n - imgMean * imgMean;

  // --- FCM branch: mean membership per cluster ---
  // cluster 0 = background (dark), 1 = normal tissue, 2 = suspicious / dense
  let c0 = 0, c1 = 0, c2 = 0;
  for (let i = 0; i < n; i++) {
    c0 += fcmTensor[i];
    c1 += fcmTensor[n + i];
    c2 += fcmTensor[2 * n + i];
  }
  c0 /= n; c1 /= n; c2 /= n;

  // --- Score derivation ---
  // High c2 (bright / dense tissue) + high image variance → malignant signal
  // High c1, low c2                                       → benign signal
  // High c0 (background dominant)                         → normal signal
  const malignantLogit = c2 * 3.0 + imgVar * 1.5 - c0 * 0.5;
  const benignLogit    = c1 * 2.5 - c2 * 1.0;
  const normalLogit    = c0 * 2.0 + (1.0 - imgVar) * 0.8;

  return softmax([normalLogit, benignLogit, malignantLogit]);
}

// ─── BI-RADS mapping ──────────────────────────────────────────────────────────
// Maps the 3-class model output to the BI-RADS scale used in clinical display.
// normal    → BI-RADS 1
// benign    → BI-RADS 2 (high confidence) or 3 (moderate)
// malignant → BI-RADS 4 (< 0.65) or 5 (≥ 0.65)
function mapToResult(probs: [number, number, number]): AnalysisResult {
  const [normal, benign, malignant] = probs;

  let classification: BiRadsClass;
  let confidence: number;

  if (normal >= benign && normal >= malignant) {
    classification = 'BI-RADS 1';
    confidence = normal;
  } else if (benign >= malignant) {
    classification = benign >= 0.55 ? 'BI-RADS 2' : 'BI-RADS 3';
    confidence = benign;
  } else {
    classification = malignant >= 0.65 ? 'BI-RADS 5' : 'BI-RADS 4';
    confidence = malignant;
  }

  return {
    classification,
    confidence,
    observations: OBSERVATIONS[classification],
    analysisText:  ANALYSIS_TEXTS[classification],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function analyzeImage(imageUri: string): Promise<AnalysisResult> {
  const start = Date.now();

  const inputs  = await preprocessForModel(imageUri);
  const probs   = runModel(inputs);
  const result  = mapToResult(probs);

  const elapsed = Date.now() - start;
  metrics.totalInferences += 1;
  metrics.lastInferenceMs  = elapsed;
  metrics.lastInferenceAt  = new Date().toISOString();
  metrics.avgInferenceMs   =
    metrics.avgInferenceMs === null
      ? elapsed
      : Math.round(
          (metrics.avgInferenceMs * (metrics.totalInferences - 1) + elapsed) /
          metrics.totalInferences,
        );

  return result;
}

export function getClassificationColor(classification?: string): string {
  switch (classification) {
    case 'BI-RADS 1': return '#00FF88';
    case 'BI-RADS 2': return '#00F2FF';
    case 'BI-RADS 3': return '#FFB822';
    case 'BI-RADS 4': return '#FF6B35';
    case 'BI-RADS 5': return '#FF3B3B';
    default:          return '#8B8FA8';
  }
}
