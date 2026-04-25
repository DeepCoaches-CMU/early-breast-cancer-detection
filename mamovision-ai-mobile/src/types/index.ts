export interface ScanResult {
  id: string;
  patientId: string;
  imageUri?: string;
  imageBase64?: string;
  fileName?: string;
  fileType?: string;
  classification?: string;
  confidence?: number;
  observations?: string[];
  analysisText?: string;
  createdAt: string;
  practitionerId: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  institution: string;
  createdAt: string;
}

export type BiRadsClass =
  | 'BI-RADS 1'
  | 'BI-RADS 2'
  | 'BI-RADS 3'
  | 'BI-RADS 4'
  | 'BI-RADS 5';

export interface AnalysisResult {
  classification: BiRadsClass;
  confidence: number;
  observations: string[];
  analysisText: string;
}

export interface Patient {
  id: string;
  scanCount: number;
  lastActivity: string;
  latestClassification?: string;
}
