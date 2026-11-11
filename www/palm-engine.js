/* Palm & QR Attendance — offline MediaPipe hand-geometry engine.
 * Uses the already-packaged MediaPipe Hand Landmarker task only.
 * This is NOT a secure palmprint biometric and NOT certified liveness/PAD.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

(function () {
  "use strict";

  const WASM_DIR = "mediapipe/wasm";
  const MODEL_PATH = "models/hand_landmarker.task";
  let landmarkerPromise = null;
  let lastVideoTimestamp = -1;

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function loadLandmarker() {
    if (landmarkerPromise) return landmarkerPromise;
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
      const options = {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.65,
        minHandPresenceConfidence: 0.65,
        minTrackingConfidence: 0.65
      };
      return HandLandmarker.createFromOptions(fileset, options);
    })().catch(error => {
      landmarkerPromise = null;
      throw error;
    });
    return landmarkerPromise;
  }

  function detect(video) {
    if (!video || video.readyState < 2 || !video.videoWidth) {
      throw new Error("Camera is not ready. Keep your hand visible and try again.");
    }
    const t = Math.max(performance.now(), lastVideoTimestamp + 0.01);
    lastVideoTimestamp = t;
    const result = window.__palmLandmarker.detectForVideo(video, t);
    const hand = result && result.landmarks && result.landmarks[0];
    if (!hand || hand.length !== 21) {
      throw new Error("No complete hand detected. Center your open palm inside the camera frame.");
    }
    const points = hand.map(p => [Number(p.x), Number(p.y), Number(p.z || 0)]);
    if (points.some(p => p.some(v => !Number.isFinite(v)))) {
      throw new Error("The hand landmarks are incomplete. Adjust your palm position and try again.");
    }
    return { landmarks: points, handedness: result.handedness && result.handedness[0] };
  }

  function norm(v) {
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
  }
  function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
  function cross(a, b) {
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  }

  function makeDescriptor(points) {
    // Use wrist-to-middle-MCP as the palm axis and index-to-pinky MCP as width.
    const wrist = points[0];
    const palmAxis = norm(sub(points[9], wrist));
    let widthAxis = norm(sub(points[17], points[5]));
    // Remove any component parallel to palmAxis to form an orthogonal frame.
    widthAxis = norm(sub(widthAxis, palmAxis.map(v => v * dot(widthAxis, palmAxis))));
    let depthAxis = norm(cross(widthAxis, palmAxis));
    if (!widthAxis.every(Number.isFinite) || !depthAxis.every(Number.isFinite)) {
      throw new Error("Hand position is unclear. Flatten your palm toward the camera.");
    }
    const scale = Math.hypot(...sub(points[9], wrist));
    if (!Number.isFinite(scale) || scale < 0.04) {
      throw new Error("Move your hand closer and keep the full palm visible.");
    }

    const f = [];
    for (const p of points) {
      const d = sub(p, wrist);
      f.push(dot(d, widthAxis) / scale, dot(d, palmAxis) / scale, dot(d, depthAxis) / scale);
    }

    // Add stable segment-length proportions and joint bend cosines.
    const segments = [[0,5],[0,9],[0,13],[0,17],[5,6],[6,7],[7,8],
      [9,10],[10,11],[11,12],[13,14],[14,15],[15,16],[17,18],[18,19],[19,20]];
    for (const [a,b] of segments) f.push(Math.hypot(...sub(points[a], points[b])) / scale);

    const triples = [[5,6,7],[6,7,8],[9,10,11],[10,11,12],[13,14,15],
      [14,15,16],[17,18,19],[18,19,20],[1,2,3],[2,3,4]];
    for (const [a,b,c] of triples) {
      const u = norm(sub(points[a], points[b]));
      const v = norm(sub(points[c], points[b]));
      f.push(Math.max(-1, Math.min(1, dot(u,v))));
    }

    // Normalize descriptor to unit length for cosine comparison.
    const length = Math.hypot(...f) || 1;
    return f.map(v => v / length);
  }

  function fingerExtended(points, mcp, pip, tip) {
    // Tip should be farther from wrist than the PIP joint for an extended finger.
    const wrist = points[0];
    const tipD = Math.hypot(points[tip][0]-wrist[0], points[tip][1]-wrist[1]);
    const pipD = Math.hypot(points[pip][0]-wrist[0], points[pip][1]-wrist[1]);
    const mcpD = Math.hypot(points[mcp][0]-wrist[0], points[mcp][1]-wrist[1]);
    return tipD > pipD * 1.08 && pipD > mcpD * 0.75;
  }
  function openPalm(points) {
    return [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]
      .filter(x => fingerExtended(points, x[0], x[1], x[2])).length >= 3;
  }
  function closedFist(points) {
    return [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]
      .filter(x => fingerExtended(points, x[0], x[1], x[2])).length <= 1;
  }

  window.PalmEngine = {
    async initHand() {
      window.__palmLandmarker = await loadLandmarker();
      return true;
    },
    async initPalm() {
      await this.initHand();
      return true;
    },
    async capture(video) {
      await this.initHand();
      // Require two consecutive valid detections to reduce transient tracking noise.
      const first = detect(video);
      await wait(90);
      const second = detect(video);
      const d1 = makeDescriptor(first.landmarks);
      const d2 = makeDescriptor(second.landmarks);
      if (d1.length !== d2.length) throw new Error("Hand feature extraction was inconsistent. Try again.");
      // Average and normalize the two frame descriptors.
      const out = d1.map((v, i) => (v + d2[i]) / 2);
      const n = Math.hypot(...out) || 1;
      return out.map(v => v / n);
    },
    async livenessChallenge(video, onStatus) {
      await this.initHand();
      const steps = [
        { name: "open palm", test: openPalm },
        { name: "make a fist", test: closedFist },
        { name: "open palm again", test: openPalm }
      ];
      for (const step of steps) {
        if (onStatus) onStatus("Show " + step.name + " and hold still…");
        let passed = 0;
        const deadline = Date.now() + 6500;
        while (Date.now() < deadline && passed < 3) {
          try {
            const hand = detect(video).landmarks;
            passed = step.test(hand) ? passed + 1 : 0;
          } catch (_) { passed = 0; }
          await wait(180);
        }
        if (passed < 3) {
          throw new Error("Movement check timed out. Follow the open-palm / fist / open-palm instructions and try again.");
        }
      }
      if (onStatus) onStatus("Movement sequence completed. This is only a basic replay deterrent, not secure liveness.");
      return true;
    }
  };
})();
