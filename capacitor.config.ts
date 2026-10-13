import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.gulforigin.finance",
  appName: "Mcube Exporters",
  webDir: "dist",
  android: { allowMixedContent: false },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Unlock Mcube Exporters",
      },
    },
  },
};
export default config;
