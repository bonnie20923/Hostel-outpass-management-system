# Face-API.js Models Directory

Place the required `face-api.js` model weights files in this directory for the camera face verification kiosk.

## Models Needed

For tiny face detection and recognition, you must place the following files here:

1. **Tiny Face Detector**:
   - `tiny_face_detector_model-weights_manifest.json`
   - `tiny_face_detector_model-shard1`

2. **Face Landmark 68**:
   - `face_landmark_68_model-weights_manifest.json`
   - `face_landmark_68_model-shard1`

3. **Face Recognition**:
   - `face_recognition_model-weights_manifest.json`
   - `face_recognition_model-shard1`

## Where to Download

You can download these files from the official `face-api.js` models repository:
- GitHub: [justadudewhohacks/face-api.js/tree/master/weights](https://github.com/justadudewhohacks/face-api.js/tree/master/weights)

## Development Mock Mode

The system features a **graceful fallback verification system**! If these model weight files are not detected in `/models/` on launch, the kiosk runs a premium interactive video scan simulator. This allows full developer and user verification of the entire checkout gate kiosk flow without requiring manual asset downloads. Once you add the files, it will automatically switch to true biometric AI comparison.
