# MamoVision AI — Mobile

A React Native / Expo mobile app for AI-assisted breast ultrasound classification.
Runs the full preprocessing pipeline and MobileFCMViTv3 inference entirely on-device.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Running the App](#3-running-the-app)
4. [How the App Works](#4-how-the-app-works)
5. [Preprocessing Pipeline](#5-preprocessing-pipeline)
6. [Project Structure](#6-project-structure)
7. [Offline Support](#7-offline-support)
8. [Developer Options](#8-developer-options)
9. [Firebase Setup](#9-firebase-setup)
10. [BI-RADS Reference](#10-bi-rads-reference)
11. [Tech Stack](#11-tech-stack)

---

## 1. Prerequisites

Install these before anything else.

### Node.js
Download and install Node.js v18 or newer from https://nodejs.org  
Verify:
```bash
node --version   # should print v18.x.x or higher
npm --version
```

### Expo Go (on your phone)
Install **Expo Go** from the App Store or Google Play Store.
Make sure you install the version that supports **SDK 54**.

### (Optional) Android Studio — only if you want an Android emulator
Download from https://developer.android.com/studio  
After installing, open Android Studio → Virtual Device Manager → create a device → start it.

### (Optional) Xcode — only if you want an iOS simulator (Mac only)
Install from the Mac App Store, then run:
```bash
xcode-select --install
```

---

## 2. Installation

### Clone or download the project
If you have the zip, extract it. If you have git:
```bash
git clone <your-repo-url>
cd mamovision-ai-mobile
```

### Install dependencies
```bash
npm install --legacy-peer-deps
```

> The `--legacy-peer-deps` flag is required because some React Navigation packages
> have not yet updated their peer dependency declarations for React 19,
> even though they work correctly with it.

### What gets installed
The install command pulls down all packages listed in `package.json`, including:

| Package | What it does |
|--------|-------------|
| `expo` ~54.0.0 | Core Expo SDK and CLI |
| `react-native` 0.81.5 | Mobile UI framework |
| `react` 19.1.0 | UI library |
| `firebase` ^11.0.0 | Authentication and cloud database |
| `@react-navigation/*` | Screen navigation |
| `@react-native-async-storage/async-storage` | Local offline storage |
| `expo-image-picker` | Camera and photo library access |
| `expo-image-manipulator` | Pre-resize images before the JS pipeline |
| `expo-file-system` | Read files and model assets from disk |
| `expo-linear-gradient` | UI gradients |
| `expo-print` + `expo-sharing` | PDF export of scan reports |
| `jpeg-js` | Decode JPEG bytes to raw RGBA pixels for preprocessing |
| `react-native-safe-area-context` | Safe area insets for notches |
| `react-native-screens` | Native screen containers |

---

## 3. Running the App

### On your phone — recommended, works immediately
```bash
npx expo start
```
A QR code appears in the terminal. Open **Expo Go** on your phone and scan it.
Your phone and computer must be on the same Wi-Fi network.

### On an Android emulator
Start your emulator in Android Studio first, then:
```bash
npm run android
```

### On an iOS simulator (Mac only)
```bash
npm run ios
```

### In a web browser
```bash
npx expo start --web
```
> Note: camera, image picker, and ONNX inference do not work in the browser.
> Use this only for basic UI review.

---

## 4. How the App Works

### User flow

```
Sign up / Log in
       │
       ▼
   Home tabs
   ┌────────────────────────────────────────────────────┐
   │  Diagnostics  │  Scan History  │  Patients  │  Settings  │
   └────────────────────────────────────────────────────┘
       │
       ▼  (Diagnostics tab)
Enter patient ID  →  pick ultrasound image (camera or library)
       │
       ▼
Run AI Analysis button
       │
       ▼
Full preprocessing pipeline runs on-device  (~500–1000 ms)
       │
       ▼
Model produces class probabilities  [normal, benign, malignant]
       │
       ▼
Mapped to BI-RADS 1–5 + confidence score
       │
       ▼
Results screen: classification badge, confidence bar,
                observations, clinical analysis text
       │
       ├──→  Save to Records  (local AsyncStorage + Firestore sync)
       └──→  Export PDF       (shareable diagnostic report)
```

### Authentication
- Email and password via Firebase Auth.
- Session is stored in AsyncStorage so users stay logged in across app restarts.
- Works offline after the first login.

### Data storage
- All scan results are saved locally first using AsyncStorage.
- When internet is available, results also sync to Firestore automatically.
- Patient records and scan history are always accessible offline.

### AI inference
- Currently runs a **fake model** that derives realistic scores from actual
  tensor content (FCM cluster distributions and image variance).
- The full preprocessing pipeline — grayscale, anisotropic diffusion, CLAHE,
  resize, normalization, FCM — runs on every image regardless.
- When your trained MobileFCMViTv3 ONNX file is ready, only one function
  (`runModel` in `src/lib/inference.ts`) needs to change.
  See [model_integration.md](./model_integration.md).

---

## 5. Preprocessing Pipeline

Every image goes through this fixed pipeline before the model sees it.
All stages run in JavaScript on-device — no server required.

```
Image URI (from camera or photo library)
    │
    ▼
[decode]  expo-image-manipulator pre-resizes to max 512 px wide
          jpeg-js decodes JPEG bytes → raw RGBA pixel array
    │
    ▼
[Stage 1]  Grayscale conversion
           BT.601 luminance:  0.299×R + 0.587×G + 0.114×B
           Output: single-channel float array, values 0–255
    │
    ▼
[Stage 2]  Anisotropic diffusion  (Perona–Malik)
           Reduces ultrasound speckle noise while keeping tissue edges sharp.
           10 iterations, step size λ=0.20, edge sensitivity K=50
    │
    ▼
[Stage 3]  CLAHE
           Contrast Limited Adaptive Histogram Equalization.
           8×8 tile grid, clip limit 2.0.
           Enhances subtle tissue density differences tile by tile.
    │
    ▼
[Stage 4]  Bilinear resize to 224×224
           Standardises spatial dimensions across all ultrasound machines.
    │
    ├─────────────────────────────────────────┐
    │                                         │
    ▼  Path A                                 ▼  Path B
[Stage 5a]  ImageNet normalisation       [Stage 5b]  Fuzzy C-Means (FCM)
            (pixel/255 − 0.485) / 0.229              3 clusters, fuzziness m=2
            Output range ≈ [−2.2, +2.2]              Centers init: 64, 128, 192
            Shape: [1, 1, 224, 224]                  Segments image into:
                                                       ch0 = background (dark)
                                                       ch1 = normal tissue (mid)
                                                       ch2 = suspicious (bright)
                                                     Shape: [1, 3, 224, 224]
    │                                         │
    └──────────────────┬──────────────────────┘
                       │
                       ▼
            MobileFCMViTv3  (ONNX)
            Two-input model fuses both streams
                       │
                       ▼
            Logits [normal, benign, malignant]
            → softmax → probabilities
                       │
                       ▼
            BI-RADS 1–5  +  confidence
```

**Key files:**
- Pipeline implementation: [`src/lib/preprocessing.ts`](src/lib/preprocessing.ts)
- Model runner + BI-RADS mapping: [`src/lib/inference.ts`](src/lib/inference.ts)

---

## 6. Project Structure

```
mamovision-ai-mobile/
│
├── App.tsx                       # Entry point — Firebase auth listener, navigation root
├── app.json                      # Expo config — permissions, asset bundle patterns
├── package.json                  # Dependencies and npm scripts
├── tsconfig.json                 # TypeScript config
├── babel.config.js               # Babel config (expo preset)
│
├── README.md                     # This file
├── model_integration.md          # Step-by-step guide to plug in the real ONNX model
│
├── assets/
│   └── models/                   # ← place mobilefcmvitv3_int8.onnx here when ready
│
└── src/
    │
    ├── screens/
    │   ├── AuthScreen.tsx         # Login + register form, Firebase Auth
    │   ├── DiagnosticsScreen.tsx  # Main screen: pick image → analyze → view results
    │   ├── ScanHistoryScreen.tsx  # Scrollable list of past scans, per-patient filter
    │   ├── PatientsScreen.tsx     # Patient list derived from scan history
    │   └── SettingsScreen.tsx     # Profile edit, storage stats, developer options
    │
    ├── navigation/
    │   └── AppNavigator.tsx       # Bottom tab navigator + auth stack switcher
    │
    ├── contexts/
    │   └── UserContext.tsx        # React context exposing the Firebase User object
    │
    ├── lib/
    │   ├── preprocessing.ts       # Full 5-stage image preprocessing pipeline
    │   ├── inference.ts           # runModel() (fake now), BI-RADS mapping, metrics
    │   ├── firebase.ts            # initializeAuth (AsyncStorage persistence) + Firestore
    │   └── storage.ts             # AsyncStorage CRUD for scans and user profiles
    │
    ├── components/
    │   ├── Button.tsx             # Reusable button (primary / outline / danger / ghost)
    │   ├── Card.tsx               # Dark-themed card container
    │   └── Badge.tsx              # BI-RADS classification badge with colour coding
    │
    └── types/
        └── index.ts               # ScanResult, UserProfile, AnalysisResult, BiRadsClass
```

---

## 7. Offline Support

| Feature | Behaviour without internet |
|--------|---------------------------|
| Login | Works if previously logged in — session stored in AsyncStorage |
| AI inference | Fully on-device, never needs internet |
| View scan history | Always available — stored locally |
| Save new scan | Saved locally immediately; syncs to Firestore when back online |
| Patient list | Derived from local scans — always available |
| Profile updates | Saved locally; cloud sync resumes on reconnect |

---

## 8. Developer Options

In the app go to **Settings → Developer Options** (tap the header to expand).

| Metric | Description |
|--------|-------------|
| Model Status | `placeholder` (fake model) → `loading` → `ready` (real ONNX) |
| Model Size | File size of the loaded `.onnx` file in MB |
| Last Inference | Time taken for the most recent full pipeline + model run |
| Avg Inference | Rolling average across the current app session |
| Total Inferences | Count since app launched |
| Last Run At | Timestamp of the most recent inference |

Latency is colour-coded: **green** < 300 ms · **orange** < 700 ms · **red** ≥ 700 ms

The panel polls every 2 seconds and updates automatically.

---

## 9. Firebase Setup

Credentials are currently hardcoded in [`src/lib/firebase.ts`](src/lib/firebase.ts).
This is fine for development. Before sharing or deploying publicly:

**Step 1** — Create a `.env` file in the project root:
```
FIREBASE_API_KEY=your_api_key
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_APP_ID=your_app_id
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
```

**Step 2** — Add to `.gitignore`:
```
.env
```

**Step 3** — Install expo-constants:
```bash
npx expo install expo-constants
```

**Step 4** — Add to `app.json` under `"expo"`:
```json
"extra": {
  "firebaseApiKey": "FIREBASE_API_KEY"
}
```

**Step 5** — Read in `firebase.ts`:
```typescript
import Constants from 'expo-constants';
const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey,
  ...
};
```

---

## 10. BI-RADS Reference

| Class | Model output | Clinical meaning | Recommended action |
|-------|-------------|-----------------|-------------------|
| BI-RADS 1 | normal dominant | Negative — no findings | Routine annual screening |
| BI-RADS 2 | benign ≥ 0.55 | Benign finding | Routine follow-up |
| BI-RADS 3 | benign < 0.55 | Probably benign (< 2% risk) | 6-month follow-up ultrasound |
| BI-RADS 4 | malignant < 0.65 | Suspicious | Biopsy recommended |
| BI-RADS 5 | malignant ≥ 0.65 | Highly suggestive of malignancy | Biopsy required |

> All AI outputs are assistive only. Clinical decisions must be validated
> by a qualified radiologist or medical professional.

---

## 11. Tech Stack

| Library | Version | Purpose |
|--------|---------|---------|
| Expo | ~54.0.0 | Managed workflow, build tooling, device APIs |
| React Native | 0.81.5 | Mobile UI framework |
| React | 19.1.0 | UI rendering |
| TypeScript | ^5.3.0 | Type safety |
| Firebase JS SDK | ^11.0.0 | Auth (persistent) + Firestore (offline cache) |
| React Navigation | ^6.x | Bottom tabs + stack navigation |
| AsyncStorage | 2.2.0 | Local key-value store for scans and profiles |
| expo-image-picker | ~17.0.10 | Camera and photo library access |
| expo-image-manipulator | ~14.0.8 | Pre-resize images before JS pipeline |
| expo-file-system | ~19.0.21 | Read model asset from device storage |
| expo-linear-gradient | ~15.0.8 | UI gradient backgrounds |
| expo-print | ~15.0.8 | Generate PDF reports |
| expo-sharing | ~14.0.8 | Share PDF reports |
| jpeg-js | latest | Decode JPEG bytes to RGBA pixels |
| onnxruntime-react-native | pending | On-device ONNX model inference |
| expo-asset | pending | Bundle and load `.onnx` model file |
