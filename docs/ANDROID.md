# Android build and device acceptance
Version 1.1.0 updates this same app to Mcube Exporters, adds team permissions, invoices/returns, existing-record import, cash checks, savings and payment-history sharing. The application ID and encrypted database identity remain unchanged.

The release workflow restores a persistent private PKCS#12 signer from GitHub secrets and builds `android/app/build/outputs/apk/release/app-release.apk`. It tests the actual signed APK's first launch in addition to debug instrumentation. The Firebase Android SDK configuration is injected from `MCUBE_GOOGLE_SERVICES_JSON`; the private sender credential is held only by Supabase. No private sender or service-role key is included in the APK.

After installing, sign in, set the app PIN, then open More → Settings → Payment alerts → Enable phone alerts and allow Android notifications. Actual closed-app delivery must be checked on the user's phone. Android force-stop, disabled permissions, power restrictions or no internet can delay notifications.

The old 1.0.1 debug signer differs from the stable Mcube signer. Before removing an old installation due to a signature conflict, preserve any unsynced records. Cloud records remain in the same Supabase project. Future Mcube releases reuse the persistent signer.

## Earlier build notes
## Requirements
Node 22.12+, Java 21, Android SDK 36, Android SDK Platform Tools, and Gradle-wrapper network access. Minimum Android version is Android 10 (API 29).

```powershell
npm ci
npm test
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```
The installable debug artifact is `android/app/build/outputs/apk/debug/app-debug.apk`. Debug signing is provided by Android's standard debug key. This is not a production release key.

The repository's Android GitHub Actions workflow performs this build and uploads the APK artifact. The Supabase URL and publishable key are public client configuration. It never receives a service-role key or the owner's password.

Version 1.0.1 is available from the [GitHub release](https://github.com/galaxymark59-art/Gulf-Origin-Finance/releases/tag/v1.0.1), or [Actions run 38349833733](https://github.com/galaxymark59-art/Gulf-Origin-Finance/actions/runs/38349833733), artifact **Gulf-Origin-Android-debug** (14-day Actions retention). Local copies are `artifacts/android/Gulf-Origin-Finance-1.0.1.apk` and `artifacts/android/app-debug.apk`. A SHA-256 sidecar accompanies the named APK. This build passes native first-launch instrumentation on Android 15; the full device checks below remain outstanding.

The startup repair registers the custom SecureVault plugin before `super.onCreate`, as required by [Capacitor's registration guide](https://capacitorjs.com/docs/android/custom-code). Failed or stalled secure storage reads show a Retry screen instead of remaining on the opening screen. PIN storage must be read before the workspace can render.

Debug builds from different CI runners may use different signing certificates. If Android rejects an update due to a signature conflict, preserve any unsynced records before uninstalling the old build. Use a stable owner-controlled release signing key for production updates.

## Production signing
In Android Studio: open the android project, Build → Generate Signed App Bundle or APK → APK. Create or select an owner-controlled keystore outside this checkout. Keep the keystore, key alias, passwords and recovery backup private. Increase versionCode/versionName for later releases. Build a release APK and verify its signature with Android SDK `apksigner verify --verbose`.

Do not publish a default signing secret or commit a keystore. Production signing has not been fabricated.

## Native features
- Encrypted SQLite with a randomly generated secret managed by the SQLCipher plugin's secure store.
- Refresh tokens encrypted with Android Keystore AES-GCM.
- PBKDF2-protected four/six-digit app PIN, attempt delay and biometric prompt.
- App lock when backgrounded; underlying sign-in remains active.
- Screenshots and recent-app previews blocked with FLAG_SECURE.
- Android FileProvider sharing from cache, with the PDF already attached.
- PDF/XLSX saved through MediaStore into Downloads/Gulf Origin.
- HTTPS-only application traffic and disabled Android automatic app backup.
- Branded adaptive icon and splash screen, Arabic RTL-capable WebView.

## Required device acceptance before real collections
Test on a midrange Android device:
1. Login, set PIN, enable fingerprint and restart. Verify unlock, wrong PIN delays and password-based PIN recovery.
2. Create a merchant, enter a payment and share the attached PDF through WhatsApp.
3. Cancel sharing, retry, test without WhatsApp installed, and manually mark sent.
4. Turn off connectivity, save a payment, force-stop/restart, reconnect; verify exactly one synced entry.
5. Create English and Arabic receipts; inspect Arabic shaping and mixed-script merchant names.
6. Save PDFs/XLSX to Downloads; test low storage and revoked device biometrics.
7. Test two devices recording against the same balance and resolving the conflict explicitly.
8. Verify keyboard/back navigation and app background/foreground behavior.

These native-device checks remain required; a passing web build does not establish them.
