# Sea Boat VR

A simple Cardboard-style Android VR app. Put your phone in a headset, sit in a wooden boat on the sea, and **look left / right to steer**. The boat sails where you look.

## Install on the phone

On the phone, open this file and tap **Download**:

https://github.com/biokineticum/fizjo_vestibular_vr/raw/main/releases/SeaBoatVR-debug.apk

Then open the downloaded APK (allow “install from this source” if Android asks).

To rebuild from source, open this folder in **Android Studio** and press Run.

- **Look around** — the boat turns and sails that way
- **Tap the screen** — recenter heading
- **Double-tap** or the phone **Back** button — return to the menu
- Stop if you feel dizzy

## Quick browser preview (no APK)

From this folder:

```
npm start
```

Open `http://localhost:4173` on the computer, or `http://YOUR-PC-IP:4173` on the phone (same Wi‑Fi). Drag to look on desktop. On the phone, tap to enter split-screen VR after allowing motion sensors.

The installed Android app is more reliable than the browser: it stays landscape, keeps the screen awake, and uses a secure local page so the gyroscope works.

## Headset

Any cheap phone VR viewer works (Google Cardboard, Xiaomi, Shinecon, etc.). Use landscape. Enable **Lens correction** on the start screen if the image looks bowed or pinched; turn it off if the headset already has strong lenses and the world looks too warped.
