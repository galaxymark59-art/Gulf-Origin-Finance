type DesktopBridge = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  saveFile: (input: { name: string; base64: string }) => Promise<boolean>;
  notify: () => Promise<void>;
  startWithWindows: (enabled: boolean) => Promise<void>;
  onActiveChange: (callback: (active: boolean) => void) => () => void;
};
declare global {
  interface Window {
    mcubeDesktop?: DesktopBridge;
  }
}
export const desktop =
  typeof window === "undefined" ? undefined : window.mcubeDesktop;
export const desktopSessionStorage = {
  getItem: (key: string) => desktop!.get(key),
  setItem: (key: string, value: string) => desktop!.set(key, value),
  removeItem: (key: string) => desktop!.remove(key),
};
