# Optional trained palmprint model

Place an ONNX CCNet palmprint encoder here as `palm_ccnet.onnx` only if your institution has confirmed the model and training-data licensing permits this use and distribution. The build workflow copies it into the APK. The app expects float32 input `[1,1,128,128]` and a normalized embedding output. See the project README for model provenance and limitations.
