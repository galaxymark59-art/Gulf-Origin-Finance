import { Capacitor, registerPlugin } from "@capacitor/core";
export const native = Capacitor.isNativePlatform();
export const SecureVault = registerPlugin<{
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  biometric(): Promise<void>;
  download(options: {
    name: string;
    base64: string;
    mime: string;
  }): Promise<void>;
}>("SecureVault");
export const nativeSessionStorage = {
  getItem: async (key: string) => (await SecureVault.get({ key })).value,
  setItem: async (key: string, value: string) => {
    await SecureVault.set({ key, value });
  },
  removeItem: async (key: string) => {
    await SecureVault.remove({ key });
  },
};
