# Palm & QR Attendance 2.3 — Offline ML + separate records + encrypted transfer

## Offline behavior
The installed app makes no network requests for attendance. The GitHub Actions build downloads the MediaPipe Hand Landmarker model and packages it, its WASM runtime, and ONNX Runtime WASM into the APK. All inference is local on the phone. Internet is needed only to build/download the APK and is not needed after installation.

## Included
- Existing QR attendance, manual attendance, QR records, roster import, export, and PIN lock.
- Separate Palm Attendance history, duplicate prevention per student per day, independent search, CSV export, and clear action. Palm entries never write to QR attendance sessions.
- Front/rear camera selection.
- MediaPipe Hand Landmarker (21 hand landmarks) packaged for offline palm localization and alignment.
- Palm ROI aligned from hand landmarks, excluding most fingers and wrist; grayscale and contrast normalization.
- Randomized open-palm/fist/open-palm challenge-response before registration and recognition.
- ONNX Runtime Web WASM packaged locally for CPU inference.
- CCNet palmprint embedding integration: expects `www/models/palm_ccnet.onnx` with input float32 `[1,1,128,128]` and an L2-normalized embedding output (the referenced export uses 2048 dimensions).
- Three registration embeddings, encrypted local template storage using AES-GCM, cosine comparison, second-best separation check, and human confirmation before attendance.

## Important: the trained palmprint model is not bundled in this source ZIP
The CCNet ONNX export referenced during integration is listed with a non-standard `other` license on its model page, and the upstream CCNet project asks users to respect the Tongji dataset terms. Do not redistribute or deploy that file until you have checked and obtained the required model/dataset permissions. This project therefore does not silently bundle or download that model.

To enable trained palm identity matching:
1. Obtain a CCNet ONNX export that you are authorized to use and redistribute/deploy.
2. Confirm its contract is float32 NCHW `[1,1,128,128]` and output embedding `[1,2048]` (or adapt the code to the model's actual contract).
3. Put the file at `models/palm_ccnet.onnx` in the repository, **or** add a GitHub Actions repository secret named `PALM_CCNET_MODEL_URL` containing a direct HTTPS download URL to the approved model.
4. Rebuild the APK. The model is copied into the APK, so runtime recognition remains offline.

If the CCNet model is absent, QR/manual attendance and offline hand landmark detection remain available, but biometric identity registration/matching correctly refuses to run. This is intentional fail-closed behavior, not a fake fallback matcher.

## Liveness limitations
The randomized gesture challenge checks live hand landmarks and requires a sequence of open-palm/fist movements. This can deter a static photograph, but it is **not** certified presentation-attack detection and may be defeated by replay video or sophisticated displays. It must not be represented as secure liveness. For high-stakes deployment, add a separately trained and independently tested PAD model, preferably using depth/IR sensing where available.

## Accuracy and deployment limitations
CCNet is a domain-pretrained research encoder, not validated on your class, phones, camera conditions, or lighting. The example similarity gate in the app is provisional and is not a calibrated probability, false-accept rate, or false-reject rate. Before using it operationally, collect consented validation data, measure FAR/FRR and demographic/device performance, calibrate thresholds, and keep QR/manual attendance as an equally usable alternative. Never use an unvalidated palm match as the sole basis for grading, discipline, payroll, or access decisions.

## Privacy and data protection
Palm templates are sensitive biometric data. Obtain documented informed consent, provide a non-biometric alternative, define retention/deletion rules, restrict device access, encrypt backups, perform a privacy impact assessment, and consult the institution's data-protection officer and applicable Philippine privacy requirements. Raw camera frames are not intentionally persisted by the palm engine. Local AES-GCM template encryption is useful protection but is not hardware-backed key management; anyone with control of the unlocked device/app origin may still access app functionality.

## Build
1. Put the contents of this ZIP at the root of a GitHub repository.
2. Add your authorized CCNet model as described above if you want biometric matching enabled.
3. Push to `main` or run **Actions → Build Offline Palm Attendance APK → Run workflow**.
4. Download `palm-attendance-offline-debug-apk`.
5. Install on a physical Android phone and test both cameras, QR scanning, offline hand detection, gesture challenge, model matching (only if CCNet was supplied), attendance confirmation, export, and app relaunch.

Local build requires Node.js 22, Android SDK, and JDK 21:
```bash
npm install
mkdir -p www/models www/mediapipe/wasm www/ort
cp node_modules/jsqr/dist/jsQR.js www/jsQR.js
cp node_modules/pdfjs-dist/build/pdf.min.js www/pdf.min.js
cp node_modules/pdfjs-dist/build/pdf.worker.min.js www/pdf.worker.min.js
cp node_modules/@mediapipe/tasks-vision/wasm/* www/mediapipe/wasm/
cp node_modules/onnxruntime-web/dist/*.wasm www/ort/
# Download the official hand_landmarker.task model into www/models/hand_landmarker.task
npm run build:palm
# Place an approved palm_ccnet.onnx at www/models/palm_ccnet.onnx
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

## App identity
- Application ID: `com.evc.qrattendance` (preserves the original QR Attendance package ID)
- App name: `QR Attendance`
- Version: `2.3.0`

This is intended to update the existing QR Attendance app rather than install a second app. Back up existing QR attendance data before installing an update, and verify the signing key matches the currently installed app.

## Model references
- MediaPipe Hand Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- CCNet paper/code: https://github.com/Zi-YuanYang/CCNet


## Encrypted palm database transfer (v2.2 update)
- Settings now includes **Export & share palms** and **Import palm backup**.
- Export packages registered CCNet palm templates and the student roster in a `.palmbackup` file. QR attendance records and attendance sessions are intentionally excluded.
- The backup is encrypted with AES-256-GCM using a password-derived key (PBKDF2-HMAC-SHA-256, 310,000 iterations). The phone's non-exportable device key is never copied.
- On import, the target phone decrypts the portable backup and re-encrypts every template using its own local AES-GCM device key. Existing templates for matching student IDs are replaced; other templates remain. Roster entries are merged.
- Share the backup file and password through separate channels. Do not send both together. A lost backup password cannot be recovered.
- This transfer works offline after the APK is installed. Android's share sheet can use Bluetooth, Quick Share, USB/file transfer, or any available local sharing method.
- This backup currently transfers palm registrations and roster only; it does not transfer QR attendance data or attendance history.


## v2.3 change: independent attendance records
Palm recognition writes to its own local attendance history (`palm_attendance_records_v1`). The Records screen has separate QR and Palm views. Palm CSV export and clear operations do not modify QR sessions. Palm records are stored on the current phone and are not included in the palm-registration transfer backup; the backup remains registrations + roster only.

## Model licensing gate
