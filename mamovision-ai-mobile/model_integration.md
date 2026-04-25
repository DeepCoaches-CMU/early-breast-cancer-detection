# MobileFCMViTv3 — Model Integration Guide

This document explains how to replace the current fake model in `inference.ts` with your
trained MobileFCMViTv3 ONNX model. The preprocessing pipeline is already complete and
does not need to change — only `runModel()` needs to be replaced.

---

## Architecture Recap

The app feeds **two separate tensors** into the model from the same preprocessed image:

```
Image URI  →  preprocessing.ts  →  imageTensor  [1, 1, 224, 224]  ┐
                                →  fcmTensor    [1, 3, 224, 224]  ┴→  MobileFCMViTv3  →  [normal, benign, malignant]
```

| Tensor       | Shape             | dtype   | Value range  | Description                          |
|-------------|-------------------|---------|--------------|--------------------------------------|
| imageTensor | [1, 1, 224, 224]  | float32 | ≈ [−2.2, +2.2] | Grayscale image, ImageNet-normalised |
| fcmTensor   | [1, 3, 224, 224]  | float32 | [0, 1]       | Per-pixel FCM membership maps        |

Model output: float32 logits `[normal, benign, malignant]` — apply softmax for probabilities.

---

## Step 1 — Export to ONNX

Run this after training. The model must accept two named inputs.

```python
import torch

model = MobileFCMViTv3(num_classes=3)
model.load_state_dict(torch.load("mobilefcmvitv3_best.pth"))
model.eval()

dummy_image = torch.randn(1, 1, 224, 224)   # grayscale, normalised
dummy_fcm   = torch.randn(1, 3, 224, 224)   # FCM membership maps

torch.onnx.export(
    model,
    (dummy_image, dummy_fcm),
    "mobilefcmvitv3.onnx",
    input_names=["image", "fcm"],
    output_names=["logits"],
    dynamic_axes={
        "image":  {0: "batch"},
        "fcm":    {0: "batch"},
        "logits": {0: "batch"},
    },
    opset_version=12,
)
```

Verify the exported model:

```python
import onnx
m = onnx.load("mobilefcmvitv3.onnx")
print("Inputs: ", [i.name for i in m.graph.input])    # ['image', 'fcm']
print("Outputs:", [o.name for o in m.graph.output])   # ['logits']
```

---

## Step 2 — Compress the Model (recommended)

Run INT8 dynamic quantisation before deploying to mobile:

```python
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    "mobilefcmvitv3.onnx",
    "mobilefcmvitv3_int8.onnx",
    weight_type=QuantType.QInt8,
)
```

| Format  | Typical size | Latency (mid-range phone) | Accuracy impact |
|---------|-------------|--------------------------|-----------------|
| FP32    | ~22 MB      | 800–1200 ms              | baseline        |
| FP16    | ~11 MB      | 400–600 ms               | negligible      |
| INT8    | ~5–6 MB     | 200–400 ms               | ~1–2%           |

Target: INT8 for production. Developer Options in the app will show you real latency numbers
once the model is loaded.

---

## Step 3 — Place the Model File

```
assets/
  models/
    mobilefcmvitv3_int8.onnx
```

---

## Step 4 — Register in app.json

Add `assetBundlePatterns` so Expo includes the model in the app bundle:

```json
{
  "expo": {
    "assetBundlePatterns": ["assets/models/*"]
  }
}
```

---

## Step 5 — Install Runtime Packages

```bash
npx expo install onnxruntime-react-native expo-asset
```

---

## Step 6 — Replace runModel() in inference.ts

Open [`src/lib/inference.ts`](src/lib/inference.ts) and replace the `runModel` function.
Everything else — preprocessing, metrics, BI-RADS mapping — stays unchanged.

```typescript
import * as ort from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';
import { setModelMetrics } from './inference';   // already exported

let session: ort.InferenceSession | null = null;

async function loadModel(): Promise<ort.InferenceSession> {
  if (session) return session;

  setModelMetrics('loading', null);

  const [asset] = await Asset.loadAsync(
    require('../../assets/models/mobilefcmvitv3_int8.onnx')
  );

  // Report model file size to Developer Options
  const info = await require('expo-file-system').getInfoAsync(asset.localUri!);
  session = await ort.InferenceSession.create(asset.localUri!);
  setModelMetrics('ready', info.size ?? null);

  return session;
}

// Replace the entire runModel() function body with this:
async function runModel(inputs: ModelInputs): Promise<[number, number, number]> {
  const sess = await loadModel();

  const imageTensor = new ort.Tensor('float32', inputs.imageTensor, inputs.imageShape);
  const fcmTensor   = new ort.Tensor('float32', inputs.fcmTensor,   inputs.fcmShape);

  const output = await sess.run({ image: imageTensor, fcm: fcmTensor });
  const logits = output['logits'].data as Float32Array; // [normal, benign, malignant]

  // Softmax
  const max  = Math.max(logits[0], logits[1], logits[2]);
  const exps = [Math.exp(logits[0] - max), Math.exp(logits[1] - max), Math.exp(logits[2] - max)];
  const sum  = exps[0] + exps[1] + exps[2];
  return [exps[0] / sum, exps[1] / sum, exps[2] / sum];
}
```

> **Note:** if your ONNX model already applies softmax internally, remove the softmax block
> above and use `logits` directly as probabilities.

---

## Step 7 — Warm Up on App Start (optional but recommended)

Loading the model on the first inference causes a noticeable delay. To pre-load it silently
when the app opens, add this to `App.tsx`:

```typescript
import { preprocessForModel } from './src/lib/preprocessing';  // triggers no-op warmup
// or just call loadModel() directly if you export it from inference.ts
```

Or call `loadModel()` inside a `useEffect` on the DiagnosticsScreen so the model is ready
before the user picks an image.

---

## Step 8 — Pre-export Checklist

Before exporting from Python, confirm these match the preprocessing pipeline:

| Property              | Required value          | Where set                      |
|-----------------------|-------------------------|-------------------------------|
| Image input shape     | `[1, 1, 224, 224]`      | training data loader           |
| FCM input shape       | `[1, 3, 224, 224]`      | training data loader           |
| Image input name      | `"image"`               | `torch.onnx.export` above      |
| FCM input name        | `"fcm"`                 | `torch.onnx.export` above      |
| Output name           | `"logits"`              | `torch.onnx.export` above      |
| Output classes        | `[normal, benign, malignant]` | training label order     |
| Image normalisation   | mean=0.485, std=0.229   | `preprocessing.ts` Stage 5a    |
| FCM clusters          | 3, init at 64/128/192   | `preprocessing.ts` Stage 5b    |
| FCM fuzziness (m)     | 2                       | `preprocessing.ts` constant    |
| CLAHE clip limit      | 2.0                     | `preprocessing.ts` constant    |
| CLAHE tile grid       | 8×8                     | `preprocessing.ts` constant    |
| Anisotropic diff K    | 50                      | `preprocessing.ts` constant    |
| Anisotropic diff λ    | 0.20                    | `preprocessing.ts` constant    |
| ONNX opset            | 12                      | `torch.onnx.export` above      |

If any of these differ from your training config, update the corresponding constant in
[`src/lib/preprocessing.ts`](src/lib/preprocessing.ts) **before** testing — mismatched
preprocessing is the most common cause of poor real-world accuracy.

---

## Troubleshooting

**Model loads but accuracy is poor**
→ Check that training preprocessing exactly matches the pipeline constants above.
   Even small differences in normalisation mean or CLAHE clip limit shift the distribution
   the model sees vs. what it was trained on.

**`InferenceSession.create` throws on device**
→ Confirm `onnxruntime-react-native` is installed and the ONNX opset is ≤ 14.
→ Check that the model file is registered in `assetBundlePatterns` in `app.json`.

**Latency is too high (> 700 ms)**
→ Apply INT8 quantisation (Step 2).
→ Reduce `AD_ITERATIONS` in `preprocessing.ts` from 10 to 5 and re-check accuracy.
→ Reduce `FCM_MAX_ITER` from 15 to 10.

**Output tensor name mismatch**
→ Run the Python verification snippet in Step 1 and update the `sess.run()` key in Step 6.
