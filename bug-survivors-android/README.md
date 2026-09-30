# Bug Survivors for Android

A fullscreen Android app around the Bug Survivors web build. It's a single-activity WebView shell with no
dependencies: `bug-survivors/dist` goes into the APK as its assets and is served from
`https://appassets.androidplatform.net/`, so it runs offline and saves persist in localStorage.

- **Scales with the screen.** Everything is sized from the phone's short side: about 270 game pixels across it, and at
  least 480 along the long side. Text, HUD and menus are the same physical size in either orientation and on any phone.
  The world camera zooms in further so the arena shows about as much as the 480x270 design, which keeps the play area
  busy and the sprites big.
- **Any orientation.** It follows the phone's rotation (and honours the rotation lock). Every screen lays itself out
  for the live shape. Portrait stacks the level-up cards and wave-clear choices, puts the pause buttons in a 2x2 grid,
  reflows the HUD and gives the shop fewer grid columns and more rows. Rotating mid-run rebuilds whatever is open.
- **Full resolution.** The canvas is drawn at the device's native resolution with the cameras zoomed, so the pixel art
  stays sharp at any scale.
- **Made for thumbs.** On touch screens every menu control is a real button at least 24 game pixels tall (~40 CSS
  px). The title has mode and heat buttons plus START, the end screen has ONE MORE RUN and TITLE, and the shop has
  tab, BACK, BUY, PLAY, scroll and page buttons. A stray tap never starts a run.
- **Back** pauses and resumes a run, or goes back to the title; on the title it exits. Leaving the app pauses
  the run and mutes it.
- The page spots the app by `KitApp` in its user agent (`APP` in `shared/src/ui.ts`).

## Build

    bug-survivors-android/build-apk.sh            # web build + debug APK -> out/bug-survivors.apk
    bug-survivors-android/build-apk.sh install    # ...and install on a phone over adb

This needs JDK 17 and the Android SDK (`~/Library/Android/sdk`, or set `ANDROID_HOME`). The debug APK is signed
with the local debug key, which is fine for sideloading. Publishing to a store needs a real signing key in
`app/build.gradle.kts`.

## Install on a phone

Copy `out/bug-survivors.apk` to the phone and open it (allow "install unknown apps" for your file manager or
browser). You can also plug the phone in with USB debugging on and run `build-apk.sh install`.
