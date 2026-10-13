# Android build and device acceptance
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

The verified build of commit `f1630925d58c91da0e91fe5612467b743886296b` is available in [Actions run 38309105531](https://github.com/galaxymark59-art/Gulf-Origin-Finance/actions/runs/38309105531), artifact **Gulf-Origin-Android-debug** (14-day retention). A local copy is `artifacts/android/app-debug.apk`. See STATUS.md for its SHA-256 checksum. This APK compiled successfully; the device checks below remain outstanding.

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
