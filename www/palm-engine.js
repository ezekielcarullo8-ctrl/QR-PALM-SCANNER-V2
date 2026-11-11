import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';

const MODEL_HAND = './models/hand_landmarker.task';
const MODEL_PALM = './models/palm_ccnet.onnx';
let landmarker = null;
let session = null;
let lastTimestamp = 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

async function initHand() {
  if (!landmarker) {
    const vision = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_HAND, delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.65,
      minHandPresenceConfidence: 0.65,
      minTrackingConfidence: 0.65
    });
  }
  return { handReady: true };
}

async function initPalm() {
  await initHand();
  if (!session) {
    ort.env.wasm.wasmPaths = './ort/';
    ort.env.wasm.numThreads = 1;
    session = await ort.InferenceSession.create(MODEL_PALM, {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all'
    });
  }
  return { handReady: true, palmModelReady: true };
}

function detect(video) {
  if (!landmarker) throw new Error('Hand landmark model is not initialized.');
  const now = Math.max(performance.now(), lastTimestamp + 1);
  lastTimestamp = now;
  const result = landmarker.detectForVideo(video, now);
  const points = result.landmarks && result.landmarks[0];
  if (!points || points.length < 21) throw new Error('No clear hand detected. Place one open palm in the guide.');
  return points;
}

function palmRoi(video, p) {
  // Align the ROI to the palm: index MCP -> pinky MCP is horizontal;
  // wrist -> middle MCP defines the vertical axis.
  const a = p[5], b = p[17], wrist = p[0], middle = p[9];
  let ux = (b.x - a.x) * video.videoWidth;
  let uy = (b.y - a.y) * video.videoHeight;
  const width = Math.hypot(ux, uy);
  if (width < 70) throw new Error('Move your palm closer to the camera.');
  ux /= width; uy /= width;
  let vx = (middle.x - wrist.x) * video.videoWidth;
  let vy = (middle.y - wrist.y) * video.videoHeight;
  const dot = ux * vx + uy * vy;
  vx -= dot * ux; vy -= dot * uy;
  const vl = Math.hypot(vx, vy) || 1;
  vx /= vl; vy /= vl;
  const cx = ((a.x + b.x + p[9].x + p[13].x) / 4) * video.videoWidth;
  const cy = ((a.y + b.y + p[9].y + p[13].y) / 4) * video.videoHeight;
  const side = clamp(width * 1.18, 96, Math.min(video.videoWidth, video.videoHeight) * 0.72);
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d', { willReadFrequently: true });
  const k = 128 / side;
  const A = k * ux, C = k * uy, B = k * vx, D = k * vy;
  const E = 64 - A * cx - C * cy;
  const F = 64 - B * cx - D * cy;
  g.setTransform(A, B, C, D, E, F);
  g.drawImage(video, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const im = g.getImageData(0, 0, 128, 128);
  const input = new Float32Array(128 * 128);
  let mean = 0;
  for (let i = 0, j = 0; i < im.data.length; i += 4, j++) {
    const v = (0.299 * im.data[i] + 0.587 * im.data[i + 1] + 0.114 * im.data[i + 2]) / 255;
    input[j] = v; mean += v;
  }
  mean /= input.length;
  let variance = 0;
  for (let i = 0; i < input.length; i++) { const d = input[i] - mean; variance += d * d; }
  const sd = Math.sqrt(variance / input.length) || 0.0001;
  for (let i = 0; i < input.length; i++) input[i] = clamp((input[i] - mean) / (2.5 * sd) + 0.5, 0, 1);
  return input;
}

async function embedding(video) {
  if (!session) throw new Error('The trained CCNet palm model is missing. Install palm_ccnet.onnx in www/models before using biometric attendance. QR/manual attendance remains available.');
  const points = detect(video);
  const pixels = palmRoi(video, points);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const tensor = new ort.Tensor('float32', pixels, [1, 1, 128, 128]);
  const result = await session.run({ [inputName]: tensor });
  const raw = result[outputName].data;
  const out = Array.from(raw, Number);
  let norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
  return out.map(v => v / norm);
}

function handPose(points) {
  const wrist = points[0];
  const tips = [8, 12, 16, 20], pips = [6, 10, 14, 18];
  const distances = tips.map((id, i) => {
    const tip = points[id], pip = points[pips[i]];
    return Math.hypot(tip.x - wrist.x, tip.y - wrist.y) /
      (Math.hypot(pip.x - wrist.x, pip.y - wrist.y) || 1);
  });
  const extended = distances.filter(v => v > 1.18).length;
  return extended >= 3 ? 'OPEN' : extended <= 1 ? 'FIST' : 'OTHER';
}

async function livenessChallenge(video, onStep) {
  // Randomized gesture order makes a static photograph less likely to pass.
  // This is a basic challenge-response check, NOT certified presentation-attack detection.
  const first = Math.random() < 0.5 ? 'OPEN' : 'FIST';
  const steps = [first, first === 'OPEN' ? 'FIST' : 'OPEN', first];
  for (let s = 0; s < steps.length; s++) {
    const target = steps[s];
    onStep && onStep(target === 'OPEN' ? 'Show an open palm' : 'Make a fist');
    let hits = 0;
    const start = Date.now();
    while (Date.now() - start < 4500) {
      await new Promise(r => setTimeout(r, 180));
      try {
        const pts = detect(video);
        if (handPose(pts) === target) hits++; else hits = 0;
        if (hits >= 3) break;
      } catch (_) { hits = 0; }
    }
    if (hits < 3) throw new Error('Liveness gesture timed out. Follow the on-screen hand instruction and try again.');
  }
  return true;
}

async function capture(video) { return embedding(video); }
function close() { if (landmarker) { landmarker.close(); landmarker = null; } session = null; }
window.PalmEngine = { initHand, initPalm, detect, capture, livenessChallenge, close };
