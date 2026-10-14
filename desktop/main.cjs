const {
  app,
  BrowserWindow,
  protocol,
  net,
  ipcMain,
  safeStorage,
  dialog,
  shell,
  Tray,
  Menu,
  Notification,
} = require("electron");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "mcube",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
app.setAppUserModelId("com.mcube.exporters.finance");
const smoke = process.argv.includes("--smoke-test");
if (smoke)
  app.setPath(
    "userData",
    path.join(app.getPath("temp"), "mcube-smoke-" + process.pid),
  );
let window,
  tray,
  quitting = false,
  tail = Promise.resolve();
const serial = (fn) => {
  const p = tail.then(fn, fn);
  tail = p.catch(() => {});
  return p;
};
const file = () => path.join(app.getPath("userData"), "private-vault.json");
async function records() {
  try {
    return JSON.parse(await fs.readFile(file(), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}
function allowed(event) {
  if (!event.senderFrame?.url.startsWith("mcube://app/"))
    throw Error("Untrusted app request.");
}
function key(value) {
  if (typeof value !== "string" || value.length > 250)
    throw Error("Invalid storage key.");
  return value;
}
function show() {
  window.show();
  window.focus();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) show();
  });
  app.whenReady().then(async () => {
    const root = path.join(app.getAppPath(), "web");
    protocol.handle("mcube", async (request) => {
      const url = new URL(request.url);
      if (url.host !== "app") return new Response("", { status: 403 });
      const target = path.resolve(
        root,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
      if (!target.startsWith(root + path.sep))
        return new Response("", { status: 403 });
      const response = await net.fetch(pathToFileURL(target).toString());
      const headers = new Headers(response.headers);
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; worker-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
      );
      return new Response(response.body, { status: response.status, headers });
    });
    const icon = path.join(root, "logo.png");
    window = new BrowserWindow({
      width: 1300,
      height: 860,
      minWidth: 800,
      minHeight: 600,
      title: "Mcube Exporters",
      icon,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    window.setContentProtection(true);
    window.removeMenu();
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith("mcube://app/")) {
        event.preventDefault();
        if (/^https:\/\//.test(url)) void shell.openExternal(url);
      }
    });
    window.webContents.session.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    window.on("blur", () => window.webContents.send("active", false));
    window.on("focus", () => window.webContents.send("active", true));
    window.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    tray = new Tray(icon);
    tray.setToolTip("Mcube Exporters");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Mcube Exporters", click: show },
        {
          label: "Quit",
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("double-click", show);
    ipcMain.handle("vault:get", (event, k) => {
      allowed(event);
      return serial(async () => {
        const data = await records(),
          value = data[key(k)];
        if (!value) return null;
        if (!safeStorage.isEncryptionAvailable())
          throw Error("Windows secure storage is unavailable.");
        return safeStorage.decryptString(Buffer.from(value, "base64"));
      });
    });
    ipcMain.handle("vault:set", (event, k, value) => {
      allowed(event);
      return serial(async () => {
        if (!safeStorage.isEncryptionAvailable())
          throw Error("Windows secure storage is unavailable.");
        if (typeof value !== "string" || value.length > 70000000)
          throw Error("Record is too large.");
        const data = await records();
        data[key(k)] = safeStorage.encryptString(value).toString("base64");
        await fs.writeFile(file() + ".tmp", JSON.stringify(data));
        await fs.rename(file() + ".tmp", file());
      });
    });
    ipcMain.handle("vault:remove", (event, k) => {
      allowed(event);
      return serial(async () => {
        const data = await records();
        delete data[key(k)];
        await fs.writeFile(file() + ".tmp", JSON.stringify(data));
        await fs.rename(file() + ".tmp", file());
      });
    });
    ipcMain.handle("save-file", async (event, input) => {
      allowed(event);
      if (
        !input ||
        typeof input.name !== "string" ||
        typeof input.base64 !== "string" ||
        input.base64.length > 70000000
      )
        throw Error("Invalid document.");
      const name = path.basename(input.name).replace(/[<>:"/\\|?*]/g, "_");
      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        defaultPath: path.join(app.getPath("downloads"), name),
      });
      if (canceled || !filePath) return false;
      await fs.writeFile(filePath, Buffer.from(input.base64, "base64"));
      return true;
    });
    ipcMain.handle("notify", (event) => {
      allowed(event);
      if (Notification.isSupported()) {
        const n = new Notification({
          title: "Mcube Exporters",
          body: "A payment was recorded. Open the app to view it.",
          icon,
        });
        n.on("click", show);
        n.show();
      }
      return true;
    });
    ipcMain.handle("start-with-windows", (event, enabled) => {
      allowed(event);
      app.setLoginItemSettings({
        openAtLogin: enabled === true,
        args: ["--background"],
      });
    });
    await window.loadURL("mcube://app/");
    if (smoke) {
      const deadline = Date.now() + 30000;
      let opened = false;
      while (Date.now() < deadline) {
        const body = await window.webContents.executeJavaScript(
          "document.body.innerText",
        );
        if (body.includes("Sign in securely")) {
          opened = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      const vault = await records();
      await fs.mkdir(path.join(process.cwd(), "artifacts/windows"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(process.cwd(), "artifacts/windows/startup.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      console.log(
        opened
          ? "Windows installer app reached the sign-in screen."
          : "Windows startup verification failed.",
      );
      app.exit(opened && Object.keys(vault).length === 0 ? 0 : 1);
    } else if (!process.argv.includes("--background")) window.show();
  });
  app.on("before-quit", () => {
    quitting = true;
  });
}
