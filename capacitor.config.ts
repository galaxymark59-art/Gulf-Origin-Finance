import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.gulforigin.finance",
  appName: "Gulf Origin",
  webDir: "dist",
  android: { allowMixedContent: false },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Unlock Gulf Origin",
      },
    },
  },
};
export default config;
