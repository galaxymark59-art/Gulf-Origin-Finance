#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/android/release-startup
# This is a fresh disposable CI emulator. No user data is present.
# Gradle may already have removed the disposable debug target after instrumentation.
adb uninstall com.gulforigin.finance >/dev/null 2>&1 || true
# Verify the same signed app can update 1.1.0 in place. This is only the
# disposable emulator, not the user's phone or its saved data.
curl --fail --location --retry 3 --connect-timeout 20 --max-time 120 \
  https://github.com/galaxymark59-art/Gulf-Origin-Finance/releases/download/v1.1.0/Mcube-Exporters-1.1.0.apk \
  --output "$RUNNER_TEMP/mcube-previous.apk"
adb install "$RUNNER_TEMP/mcube-previous.apk"
before=$(adb shell dumpsys package com.gulforigin.finance | grep 'firstInstallTime=' | head -n 1 | tr -d '\r')
test -n "$before"
adb install -r android/app/build/outputs/apk/release/app-release.apk
after=$(adb shell dumpsys package com.gulforigin.finance | grep 'firstInstallTime=' | head -n 1 | tr -d '\r')
test "$before" = "$after"
printf 'Signed 1.1.0 installation updated in place without uninstalling.\n'
adb shell am start -n com.gulforigin.finance/.MainActivity
for attempt in $(seq 1 20); do
  adb shell uiautomator dump /sdcard/mcube-release-window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/mcube-release-window.xml artifacts/android/release-startup/window.xml >/dev/null 2>&1 || true
  if grep -q 'Sign in securely' artifacts/android/release-startup/window.xml; then
    adb shell screencap -p /sdcard/mcube-release-startup.png
    adb pull /sdcard/mcube-release-startup.png artifacts/android/release-startup/startup.png
    printf 'Signed release reached the actual sign-in screen.\n'
    exit 0
  fi
  sleep 2
done
adb logcat -d > artifacts/android/release-startup/logcat.txt
printf 'Signed release did not reach the sign-in screen.\n' >&2
exit 1
