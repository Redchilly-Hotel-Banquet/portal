#!/usr/bin/env bash
# Builds the Red Chilly Android app and writes public/redchilly_app.apk.
# Needs: Android SDK (platform 35, build-tools 35.0.0), JDK 21 and Gradle 8.9 (the wrapper downloads it, or set GRADLE=/path/to/gradle).
# Push notifications use Firebase: google-services.json (in this folder) comes from the Firebase project.
# The signing key lives outside the repo (~/.redchilly-keystore); keep a backup, because an update must be signed with the same key.
set -euo pipefail
cd "$(dirname "$0")"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export JAVA_HOME="${JAVA21_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$PATH"
GRADLE="${GRADLE:-./gradlew}"
KEYDIR="$HOME/.redchilly-keystore"
[ -f "$KEYDIR/redchilly.jks" ] || { echo "Missing signing key in $KEYDIR (restore it from your backup)"; exit 1; }
"$GRADLE" --no-daemon assembleRelease
cp build/outputs/apk/release/*-release.apk ../public/redchilly_app.apk
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify ../public/redchilly_app.apk && echo "Built public/redchilly_app.apk"
