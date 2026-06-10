const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

// ── Config ──────────────────────────────────────────────────────────────────
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const POSITION_FILE = path.join(app.getPath("userData"), "window-position.json");

const DEFAULT_SETTINGS = {
  backendUrl: "https://27ff5e4d-ebe8-4d2e-a35c-5769cb600e92-00-2polfw5x5u74l.worf.replit.dev",
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
  } catch {
    // ignore
  }
}

function loadPosition() {
  try {
    if (fs.existsSync(POSITION_FILE)) {
      return JSON.parse(fs.readFileSync(POSITION_FILE, "utf-8"));
    }
  } catch {
    // ignore
  }
  return null;
}

function savePosition(x, y) {
  try {
    fs.writeFileSync(POSITION_FILE, JSON.stringify({ x, y }));
  } catch {
    // ignore
  }
}

// ── Screenshot ───────────────────────────────────────────────────────────────
async function captureScreenshot() {
  try {
    const screenshot = require("screenshot-desktop");
    const sharp = require("sharp");

    const imgBuffer = await screenshot({ format: "png" });

    // Resize to max 1280px wide, JPEG quality 85
    const resized = await sharp(imgBuffer)
      .resize({ width: 1280, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    return resized.toString("base64");
  } catch (err) {
    console.error("Screenshot error:", err);
    throw err;
  }
}

// ── MegaTischler detector ────────────────────────────────────────────────────
let megaTischlerActive = false;
let detectorInterval = null;

function startMegaTischlerDetector(win) {
  function check() {
    exec("tasklist", (err, stdout) => {
      if (err) return;
      const isActive =
        stdout.toLowerCase().includes("megatischler") ||
        stdout.toLowerCase().includes("megatisch");
      if (isActive !== megaTischlerActive) {
        megaTischlerActive = isActive;
        if (win && !win.isDestroyed()) {
          win.webContents.send("mt-status", isActive);
        }
      }
    });
  }

  check();
  detectorInterval = setInterval(check, 5000);
}

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  const savedPos = loadPosition();
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const winWidth = 380;
  const winHeight = 700;

  // Default position: right side of screen
  const defaultX = screenWidth - winWidth - 20;
  const defaultY = Math.round((screenHeight - winHeight) / 2);

  const x = savedPos ? savedPos.x : defaultX;
  const y = savedPos ? savedPos.y : defaultY;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    alwaysOnTop: true,
    frame: false,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Save position on move
  mainWindow.on("moved", () => {
    const [wx, wy] = mainWindow.getPosition();
    savePosition(wx, wy);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  startMegaTischlerDetector(mainWindow);
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  // F9 → capture screenshot
  globalShortcut.register("F9", async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const base64 = await captureScreenshot();
        mainWindow.webContents.send("screenshot-captured", base64);
      } catch (err) {
        mainWindow.webContents.send("screenshot-error", err.message);
      }
    }
  });

  // F8 → toggle recording (push-to-talk Phase 2)
  globalShortcut.register("F8", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("toggle-recording");
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (detectorInterval) clearInterval(detectorInterval);
});

// ── IPC handlers ───────────────────────────────────────────────────────────────
ipcMain.handle("capture-screenshot", async () => {
  return await captureScreenshot();
});

ipcMain.handle("get-settings", () => {
  return loadSettings();
});

ipcMain.handle("save-settings", (_, newSettings) => {
  saveSettings(newSettings);
  return { ok: true };
});

ipcMain.handle("get-mt-status", () => {
  return megaTischlerActive;
});

ipcMain.handle("minimize-window", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle("close-window", () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle("fetch-knowledge-stats", async () => {
  const settings = loadSettings();
  try {
    const res = await fetch(`${settings.backendUrl}/api/knowledge`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("transcribe-audio", async (_, { base64, mimeType }) => {
  const settings = loadSettings();
  const url = `${settings.backendUrl}/api/transcribe`;
  const headers = { "Content-Type": "application/json" };
  if (settings.openaiKey) headers["x-openai-key"] = settings.openaiKey;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ audio_base64: base64, mime_type: mimeType }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Transcribe HTTP ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.text || "";
});
