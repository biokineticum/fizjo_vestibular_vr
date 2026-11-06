# Sea Boat VR (`fizjo_vestibular_vr`)

**Cardboard-style Android VR** — sit in a wooden boat on the sea and **look left/right to steer**. The boat sails where you look.

Student / clinical project for **vestibular and gaze-directed movement** practice. For physiotherapists, vestibular rehab, and VR education.

## Features

- Phone-in-headset VR (Google Cardboard–class viewers)
- Gaze steering; tap to recenter; double-tap / Back returns to menu
- Optional lens correction on the start screen
- Prebuilt debug APK in `releases/`
- Browser preview of the WebGL scene for desktop testing

## Install (phone)

Download and install:

https://github.com/biokineticum/fizjo_vestibular_vr/raw/main/releases/SeaBoatVR-debug.apk

Allow install from that source if Android asks. **Stop if you feel dizzy.**

To rebuild: open the project in **Android Studio** and Run.

## Browser preview (no APK)

```bash
npm start
```

Opens a static server of `app/src/main/assets/www` on port **4173**. Use `http://localhost:4173` on PC, or `http://YOUR-PC-IP:4173` on the phone (same Wi‑Fi). Drag to look on desktop; on phone, tap for split-screen VR after allowing motion sensors.

The installed Android app is more reliable (landscape lock, wake lock, gyroscope).

## Headset

Any cheap phone VR viewer works. Use landscape. Enable **Lens correction** if the image looks bowed; turn it off if strong lenses already warp the world.

---

## Author

**Dariusz Mosler** (Biokineticum) — physiotherapy, biomechanics, sports science  
🌐 [biokineticum.com](https://biokineticum.com) · 📰 [Substack](https://biokineticum.substack.com) · 𝕏 [@Biokineticum](https://x.com/Biokineticum)

