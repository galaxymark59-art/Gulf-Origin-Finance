const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("mcubeDesktop", {
  get: (key) => ipcRenderer.invoke("vault:get", key),
  set: (key, value) => ipcRenderer.invoke("vault:set", key, value),
  remove: (key) => ipcRenderer.invoke("vault:remove", key),
  saveFile: (input) => ipcRenderer.invoke("save-file", input),
  notify: () => ipcRenderer.invoke("notify"),
  startWithWindows: (enabled) =>
    ipcRenderer.invoke("start-with-windows", enabled),
  onActiveChange: (callback) => {
    const listener = (_event, active) => callback(active);
    ipcRenderer.on("active", listener);
    return () => ipcRenderer.removeListener("active", listener);
  },
});
