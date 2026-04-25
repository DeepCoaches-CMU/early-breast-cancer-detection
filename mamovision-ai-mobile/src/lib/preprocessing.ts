/**
 * Preprocessing pipeline for MobileFCMViTv3
 *
 * Requires: npx expo install jpeg-js
 *
 * Pipeline:
 *   Load → Grayscale → Anisotropic Diffusion → CLAHE → Resize 224×224
 *   ├─ Path A: (pixel/255 − 0.485) / 0.229  → imageTensor [1, 1, 224, 224]
 *   └─ Path B: Fuzzy C-Means (3 clusters)   → fcmTensor   [1, 3, 224, 224]
 */

import * as ImageManipulator from 'expo-image-manipulator';

// ─── Constants ────────────────────────────────────────────────────────────────
const IMG_SIZE       = 224;
const FCM_CLUSTERS   = 3;
const FCM_FUZZINESS  = 2;          // m parameter — standard choice
const FCM_MAX_ITER   = 15;
const FCM_EPSILON    = 0.001;
const CLAHE_GRID     = 8;          // 8×8 tile grid → 28×28 px tiles on 224 image
const CLAHE_CLIP     = 2.0;
const AD_ITERATIONS  = 10;         // anisotropic diffusion steps
const AD_LAMBDA      = 0.20;       // step size — must be ≤ 0.25 for stability
const AD_K           = 50.0;       // edge sensitivity (0–255 scale)
const PRE_RESIZE_MAX = 512;        // cap before JS ops for performance
const IMAGENET_MEAN  = 0.485;
const IMAGENET_STD   = 0.229;

// ─── Public types ─────────────────────────────────────────────────────────────
export interface ModelInputs {
  imageTensor: Float32Array;                        // [1, 1, 224, 224]
  fcmTensor:   Float32Array;                        // [1, 3, 224, 224]
  imageShape:  [number, number, number, number];
  fcmShape:    [number, number, number, number];
}

// ─── Stage 1 helper: decode image URI → raw RGBA pixels ──────────────────────
async function decodeToRGBA(uri: string): Promise<{
  data: Uint8Array; width: number; height: number;
}> {
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: PRE_RESIZE_MAX } }],
    { base64: true, format: ImageManipulator.SaveFormat.JPEG, compress: 1.0 },
  );
  const b64 = resized.base64!;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jpeg = require('jpeg-js') as {
    decode: (b: Uint8Array, o: object) => { data: Uint8Array; width: number; height: number };
  };
  const decoded = jpeg.decode(bytes, { useTArray: true });
  return { data: decoded.data, width: decoded.width, height: decoded.height };
}

// ─── Stage 1: Grayscale (ITU-R BT.601 luminance) ─────────────────────────────
// Weighted average: 0.299 R + 0.587 G + 0.114 B → [0, 255]
function toGrayscale(rgba: Uint8Array, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return gray;
}

// ─── Stage 2: Anisotropic diffusion (Perona–Malik) ───────────────────────────
// Smooths speckle noise while preserving tissue boundaries.
// Edge-stopping function: c(x) = exp(-(x/K)^2)
function anisotropicDiffusion(gray: Float32Array, w: number, h: number): Float32Array {
  let current = gray.slice();
  const next = new Float32Array(w * h);

  for (let iter = 0; iter < AD_ITERATIONS; iter++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const val = current[idx];

        const dN = y > 0     ? current[(y - 1) * w + x] - val : 0;
        const dS = y < h - 1 ? current[(y + 1) * w + x] - val : 0;
        const dE = x < w - 1 ? current[y * w + (x + 1)] - val : 0;
        const dW = x > 0     ? current[y * w + (x - 1)] - val : 0;

        const cN = Math.exp(-((dN / AD_K) ** 2));
        const cS = Math.exp(-((dS / AD_K) ** 2));
        const cE = Math.exp(-((dE / AD_K) ** 2));
        const cW = Math.exp(-((dW / AD_K) ** 2));

        next[idx] = val + AD_LAMBDA * (cN * dN + cS * dS + cE * dE + cW * dW);
      }
    }
    current.set(next);
  }
  return current;
}

// ─── Stage 3: CLAHE ───────────────────────────────────────────────────────────
// Tile-based contrast enhancement with clip limit to prevent over-amplification.
function applyCLAHE(gray: Float32Array, w: number, h: number): Float32Array {
  const tileW = Math.ceil(w / CLAHE_GRID);
  const tileH = Math.ceil(h / CLAHE_GRID);
  const luts: Float32Array[] = [];

  for (let ty = 0; ty < CLAHE_GRID; ty++) {
    for (let tx = 0; tx < CLAHE_GRID; tx++) {
      const x0 = tx * tileW,             y0 = ty * tileH;
      const x1 = Math.min(x0 + tileW, w), y1 = Math.min(y0 + tileH, h);
      const area = (x1 - x0) * (y1 - y0);

      const hist = new Float32Array(256);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++)
          hist[Math.min(255, Math.floor(gray[y * w + x]))]++;

      const clipLimit = CLAHE_CLIP * area / 256;
      let excess = 0;
      for (let b = 0; b < 256; b++) {
        if (hist[b] > clipLimit) { excess += hist[b] - clipLimit; hist[b] = clipLimit; }
      }
      const redistribute = excess / 256;
      for (let b = 0; b < 256; b++) hist[b] += redistribute;

      const lut = new Float32Array(256);
      let cdf = 0;
      for (let b = 0; b < 256; b++) { cdf += hist[b]; lut[b] = (cdf / area) * 255; }
      luts.push(lut);
    }
  }

  // Bilinear interpolation between tile LUTs for smooth transitions
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tx  = (x - tileW / 2) / tileW;
      const ty  = (y - tileH / 2) / tileH;
      const tx0 = Math.max(0, Math.floor(tx)), tx1 = Math.min(CLAHE_GRID - 1, tx0 + 1);
      const ty0 = Math.max(0, Math.floor(ty)), ty1 = Math.min(CLAHE_GRID - 1, ty0 + 1);
      const fx = tx - tx0, fy = ty - ty0;
      const bin = Math.min(255, Math.floor(gray[y * w + x]));

      out[y * w + x] =
        luts[ty0 * CLAHE_GRID + tx0][bin] * (1 - fx) * (1 - fy) +
        luts[ty0 * CLAHE_GRID + tx1][bin] * fx        * (1 - fy) +
        luts[ty1 * CLAHE_GRID + tx0][bin] * (1 - fx)  * fy       +
        luts[ty1 * CLAHE_GRID + tx1][bin] * fx         * fy;
    }
  }
  return out;
}

// ─── Stage 4: Bilinear resize to 224×224 ─────────────────────────────────────
// Each output pixel is the weighted average of its four nearest neighbours.
function bilinearResize(src: Float32Array, srcW: number, srcH: number): Float32Array {
  const dst = new Float32Array(IMG_SIZE * IMG_SIZE);
  const xScale = srcW / IMG_SIZE;
  const yScale = srcH / IMG_SIZE;
  for (let y = 0; y < IMG_SIZE; y++) {
    for (let x = 0; x < IMG_SIZE; x++) {
      const sx = (x + 0.5) * xScale - 0.5;
      const sy = (y + 0.5) * yScale - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(srcW - 1, x0 + 1);
      const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(srcH - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;

      dst[y * IMG_SIZE + x] =
        src[y0 * srcW + x0] * (1 - fx) * (1 - fy) +
        src[y0 * srcW + x1] * fx        * (1 - fy) +
        src[y1 * srcW + x0] * (1 - fx)  * fy       +
        src[y1 * srcW + x1] * fx         * fy;
    }
  }
  return dst; // values still in [0, 255]
}

// ─── Stage 5a: ImageNet normalization ─────────────────────────────────────────
// (pixel / 255 − 0.485) / 0.229  →  roughly [−2.2, +2.2]
function normalizeImageNet(gray224: Float32Array): Float32Array {
  const out = new Float32Array(gray224.length);
  for (let i = 0; i < gray224.length; i++) {
    out[i] = (gray224[i] / 255 - IMAGENET_MEAN) / IMAGENET_STD;
  }
  return out;
}

// ─── Stage 5b: Fuzzy C-Means clustering ──────────────────────────────────────
// Operates on the same uint8-range [0, 255] resized image.
// Centers initialized at {64, 128, 192} for deterministic, ordered clusters:
//   cluster 0 → dark   (background)
//   cluster 1 → mid    (normal tissue)
//   cluster 2 → bright (suspicious / dense tissue)
// Output: membership maps reshaped to CHW [C, 224, 224].

function computeFCM(gray224: Float32Array): Float32Array {
  const n = gray224.length; // 224×224 = 50 176
  const C = FCM_CLUSTERS;
  const m = FCM_FUZZINESS;

  // Normalize to [0, 1] for numerically stable distance computation
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = gray224[i] / 255;

  // Deterministic initial centers: 64/255, 128/255, 192/255
  const centers = new Float32Array(C);
  for (let k = 0; k < C; k++) centers[k] = (k + 1) * 64 / 255;

  const U = new Float32Array(n * C); // membership matrix [n × C]

  for (let iter = 0; iter < FCM_MAX_ITER; iter++) {
    const prevCenters = centers.slice();

    // Update membership for each pixel
    for (let i = 0; i < n; i++) {
      const dists = new Float32Array(C);
      for (let k = 0; k < C; k++) dists[k] = Math.abs(x[i] - centers[k]);

      // Handle pixel sitting exactly on a center
      let exact = -1;
      for (let k = 0; k < C; k++) if (dists[k] < 1e-10) { exact = k; break; }

      if (exact >= 0) {
        for (let k = 0; k < C; k++) U[i * C + k] = k === exact ? 1.0 : 0.0;
      } else {
        const exp = 2.0 / (m - 1); // = 2 when m=2
        for (let k = 0; k < C; k++) {
          let sum = 0;
          for (let j = 0; j < C; j++) sum += (dists[k] / dists[j]) ** exp;
          U[i * C + k] = 1.0 / sum;
        }
      }
    }

    // Update cluster centers
    for (let k = 0; k < C; k++) {
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        const uPow = U[i * C + k] ** m;
        num += uPow * x[i];
        den += uPow;
      }
      centers[k] = num / (den + 1e-10);
    }

    // Convergence check
    let delta = 0;
    for (let k = 0; k < C; k++) delta += Math.abs(centers[k] - prevCenters[k]);
    if (delta < FCM_EPSILON) break;
  }

  // Reshape from row-major [n × C] to channel-first [C × n] for ONNX CHW convention
  const out = new Float32Array(C * n);
  for (let k = 0; k < C; k++)
    for (let i = 0; i < n; i++)
      out[k * n + i] = U[i * C + k];

  return out; // shape [3, 224, 224] flattened
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
export async function preprocessForModel(imageUri: string): Promise<ModelInputs> {
  const { data: rgba, width, height } = await decodeToRGBA(imageUri);

  const gray      = toGrayscale(rgba, width, height);       // Stage 1 — [0,255]
  const denoised  = anisotropicDiffusion(gray, width, height); // Stage 2
  const enhanced  = applyCLAHE(denoised, width, height);    // Stage 3
  const resized   = bilinearResize(enhanced, width, height); // Stage 4 — [0,255]

  const imageTensor = normalizeImageNet(resized);            // Stage 5a — [~−2.2, +2.2]
  const fcmTensor   = computeFCM(resized);                   // Stage 5b — [0, 1] memberships

  return {
    imageTensor,
    fcmTensor,
    imageShape: [1, 1, IMG_SIZE, IMG_SIZE],
    fcmShape:   [1, FCM_CLUSTERS, IMG_SIZE, IMG_SIZE],
  };
}
