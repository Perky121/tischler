const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

// ── Live mode 2.0 ─────────────────────────────────────────────────────────────
let pixelmatch, PNG;
let diffLibsMissing = false;
try {
  pixelmatch = require("pixelmatch");
  PNG = require("pngjs").PNG;
} catch {
  diffLibsMissing = true;
  console.warn("[live] pixelmatch/pngjs not installed — diff detection disabled, Live will not trigger API calls");
}

let liveLoopTimer = null;
let prevScreenshotBuf = null;
let liveCallCount = 0;
let liveMainWindow = null;
let liveLoopRunning = false;
let liveLastApiCallTs = 0;
let regionPickerWindow = null;
// Stores virtual-desktop origin of picker window so DIP coords can be converted to global screen coords
let pickerOriginX = 0;
let pickerOriginY = 0;
// Prevents "closed" event from sending cancel when confirm triggered the close
let regionConfirmedThisSession = false;

// Faza A — faster, more targeted
const LIVE_INTERVAL_MS = 800;
const LIVE_DIFF_THRESHOLD = 0.10; // 10% — small crop reacts to fine changes
const LIVE_API_COOLDOWN_MS = 4000; // 4s between analyze calls

// Faza B — budget tracker (in-memory, persisted in settings)
let dailySpentUsd = 0;
let dailyCallCount = 0;

// Faza C — session context (in-memory, not persisted)
let sessionContext = null;
// Hash of last seen parameter set to avoid duplicate KB suggestions
let lastDialogHash = null;

// ── Anthropic token cost constants (claude-opus-4 pricing) ───────────────────
const COST_PER_INPUT_TOKEN = 0.000015;   // $15 per 1M input tokens
const COST_PER_OUTPUT_TOKEN = 0.000075;  // $75 per 1M output tokens
// Vision: ~1600 tokens per standard image
const VISION_TOKEN_ESTIMATE = 1600;

function estimateCostUsd(inputTokens, outputTokens) {
  return +(inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN).toFixed(5);
}

function getTodayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function checkAndResetDailyBudget(settings) {
  const today = getTodayDateStr();
  if (settings.budgetResetDate !== today) {
    settings.budgetResetDate = today;
    settings.dailySpentUsd = 0;
    settings.dailyCallCount = 0;
    dailySpentUsd = 0;
    dailyCallCount = 0;
    saveSettings(settings);
  } else {
    // Restore in-memory from persisted
    dailySpentUsd = settings.dailySpentUsd || 0;
    dailyCallCount = settings.dailyCallCount || 0;
    liveCallCount = dailyCallCount;
  }
}

function accumulateCost(costUsd) {
  dailySpentUsd = +(dailySpentUsd + costUsd).toFixed(5);
  dailyCallCount += 1;
  liveCallCount = dailyCallCount;
  // Persist to settings so it survives app restart
  const settings = loadSettings();
  settings.dailySpentUsd = dailySpentUsd;
  settings.dailyCallCount = dailyCallCount;
  settings.budgetResetDate = getTodayDateStr();
  saveSettings(settings);
}

// ── Live capture with optional region crop ───────────────────────────────────
async function captureForLive() {
  const screenshot = require("screenshot-desktop");
  const sharp = require("sharp");

  // Hide Copilot window so it doesn't appear in the captured screenshot
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(0);
  await new Promise((r) => setTimeout(r, 150));
  let imgBuf;
  try {
    imgBuf = await screenshot({ format: "png" });
  } finally {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(1);
  }

  const settings = loadSettings();
  let full = imgBuf;

  // Faza A: crop to selected region if configured
  if (settings.liveRegion) {
    const { x, y, width, height } = settings.liveRegion;
    full = await sharp(imgBuf)
      .extract({ left: x, top: y, width, height })
      .png()
      .toBuffer();
  }

  // Resize to 640px wide for fast pixelmatch diff
  const small = await sharp(full).resize(640).png().toBuffer();
  return { full, small };
}

function diffImages(buf1, buf2) {
  // If diff libs are not available, skip diff gating — treat as no change
  // (returning 1 here would cause every tick to trigger an API call and drain budget)
  if (!pixelmatch || !PNG) return 0;
  try {
    const img1 = PNG.sync.read(buf1);
    const img2 = PNG.sync.read(buf2);
    if (img1.width !== img2.width || img1.height !== img2.height) return 1;
    const { width, height } = img1;
    const diff = Buffer.alloc(width * height * 4);
    const changed = pixelmatch(img1.data, img2.data, diff, width, height, { threshold: 0.1 });
    return changed / (width * height);
  } catch {
    return 0; // parse error → treat as no change, don't trigger API
  }
}

async function liveLoop() {
  if (liveLoopRunning) return;
  liveLoopRunning = true;

  try {
    const settings = loadSettings();
    if (!settings.liveEnabled) return;

    // Faza B — budget limit check (primary) with fallback to count limit
    const budget = settings.dailyBudgetUsd || 100;
    if (dailySpentUsd >= budget) {
      stopLiveLoop();
      settings.liveEnabled = false;
      saveSettings(settings);
      if (liveMainWindow) {
        liveMainWindow.webContents.send("live-budget-reached", {
          spent: dailySpentUsd,
          budget,
        });
      }
      return;
    }

    const { full, small } = await captureForLive();

    if (prevScreenshotBuf) {
      const diffRatio = diffImages(prevScreenshotBuf, small);
      const now = Date.now();
      const cooldownOk = (now - liveLastApiCallTs) >= LIVE_API_COOLDOWN_MS;

      if (diffRatio > LIVE_DIFF_THRESHOLD && cooldownOk) {
        // Resize full crop to max 1280px before sending to API (reduces payload 4-10x)
        const sharp = require("sharp");
        const apiPayload = await sharp(full)
          .resize({ width: 1280, withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();

        let res;
        try {
          res = await fetch(`${settings.backendUrl}/api/analyze-screen`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ screenshot_base64: apiPayload.toString("base64") }),
          });
        } catch (fetchErr) {
          console.error("[live] fetch error:", fetchErr.message);
          // Network error: don't touch cooldown or prevBuf — retry when screen changes again
          return;
        }

        // Consume cooldown after receiving ANY server response (not on network failures)
        liveLastApiCallTs = now;

        if (res.ok) {
          const data = await res.json();

          // Mark screenshot as baseline only on successful response
          prevScreenshotBuf = small;

          // Faza B — accumulate real cost (0 on error response)
          const costUsd = data.usage?.cost_usd ?? estimateCostUsd(VISION_TOKEN_ESTIMATE + 200, 80);
          accumulateCost(costUsd);

          // Faza C — update session context from response
          if (data.context) {
            sessionContext = { ...data.context, lastUpdated: new Date().toISOString() };
            if (liveMainWindow) {
              liveMainWindow.webContents.send("live-context-updated", sessionContext);
            }

            // D3: suggest saving to KB if new dialog detected
            const dialogHash = JSON.stringify({
              p: data.context.parametersSeen,
              f: data.context.formulasSeen,
            });
            if (dialogHash !== lastDialogHash && data.context.parametersSeen?.length > 0) {
              lastDialogHash = dialogHash;
              if (liveMainWindow) {
                liveMainWindow.webContents.send("live-kb-suggest", {
                  context: sessionContext,
                });
              }
            }
          }

          // Show proactive message on success (relevant=true) OR on API error (relevant=false with error message)
          const isApiError =
            !data.relevant &&
            typeof data.message === "string" &&
            data.message.startsWith("analyze-screen greška");

          if ((data.relevant || isApiError) && data.message && liveMainWindow) {
            liveMainWindow.webContents.send("live-message", {
              message: data.message,
              callCount: dailyCallCount,
              spentUsd: dailySpentUsd,
              budgetUsd: settings.dailyBudgetUsd || 100,
              context: data.context || null,
            });
          }
        } else {
          console.error(`[live] analyze-screen HTTP ${res.status} — no cost charged`);
          // Don't charge cost and don't update prevBuf so same change retries next cooldown
        }
      }
    } else {
      prevScreenshotBuf = small;
    }
  } catch (err) {
    console.error("[live] loop error:", err.message);
  } finally {
    liveLoopRunning = false;
  }
}

async function liveTestPing(win) {
  // Fire a single analyze-screen call immediately when Live is enabled
  // so the user sees API connectivity status right away.
  try {
    const { full } = await captureForLive();
    const sharpLib = require("sharp");
    const payload = await sharpLib(full)
      .resize({ width: 640, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    const settings = loadSettings();
    let res;
    try {
      res = await fetch(`${settings.backendUrl}/api/analyze-screen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenshot_base64: payload.toString("base64") }),
      });
    } catch (netErr) {
      win.webContents.send("live-message", {
        message: `[Live test] Mreža nedostupna: ${netErr.message}`,
        callCount: dailyCallCount, spentUsd: dailySpentUsd,
        budgetUsd: settings.dailyBudgetUsd || 100, context: null,
      });
      return;
    }
    const data = await res.json();
    const msg = res.ok
      ? (data.message || "[Live test] API OK — ekran primljen, nema relevantnog sadržaja")
      : `[Live test] HTTP ${res.status}`;
    win.webContents.send("live-message", {
      message: msg,
      callCount: dailyCallCount, spentUsd: dailySpentUsd,
      budgetUsd: settings.dailyBudgetUsd || 100, context: data.context || null,
    });
  } catch (err) {
    win.webContents.send("live-message", {
      message: `[Live test] Greška: ${err.message}`,
      callCount: dailyCallCount, spentUsd: dailySpentUsd,
      budgetUsd: loadSettings().dailyBudgetUsd || 100, context: null,
    });
  }
}

function startLiveLoop(win) {
  liveMainWindow = win;
  if (liveLoopTimer) clearInterval(liveLoopTimer);
  prevScreenshotBuf = null;
  liveLoopRunning = false;
  liveLoopTimer = setInterval(liveLoop, LIVE_INTERVAL_MS);
  // Immediately test API connectivity — shows error or confirmation in chat
  liveTestPing(win).catch((e) => console.error("[live] test-ping error:", e.message));
}

function stopLiveLoop() {
  if (liveLoopTimer) {
    clearInterval(liveLoopTimer);
    liveLoopTimer = null;
  }
  prevScreenshotBuf = null;
  liveLoopRunning = false;
}

// ── Region picker window ─────────────────────────────────────────────────────
function openRegionPicker() {
  if (regionPickerWindow && !regionPickerWindow.isDestroyed()) {
    regionPickerWindow.close();
  }

  // Compute virtual desktop bounding rect across all displays (DIP / logical pixels)
  const displays = screen.getAllDisplays();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x);
    minY = Math.min(minY, d.bounds.y);
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
  }
  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;

  // Store origin so we can convert picker-relative coords to global DIP coords
  pickerOriginX = minX;
  pickerOriginY = minY;
  regionConfirmedThisSession = false;

  regionPickerWindow = new BrowserWindow({
    width: totalWidth,
    height: totalHeight,
    x: minX,
    y: minY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreen: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  regionPickerWindow.loadFile(path.join(__dirname, "renderer", "region-picker.html"));
  regionPickerWindow.setIgnoreMouseEvents(false);

  // Only send cancel if the user did NOT already confirm a selection
  regionPickerWindow.on("closed", () => {
    regionPickerWindow = null;
    if (!regionConfirmedThisSession && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("live-region-cancelled");
    }
  });
}

// ── Config ───────────────────────────────────────────────────────────────────
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const POSITION_FILE = path.join(app.getPath("userData"), "window-position.json");

const DEFAULT_SETTINGS = {
  backendUrl: "https://tischler1.replit.app",
  dailyBudgetUsd: 100,
  dailySpentUsd: 0,
  dailyCallCount: 0,
  budgetResetDate: getTodayDateStr(),
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
  } catch { /* ignore */ }
}

function loadWindowState() {
  try {
    if (fs.existsSync(POSITION_FILE)) {
      return JSON.parse(fs.readFileSync(POSITION_FILE, "utf-8"));
    }
  } catch { /* ignore */ }
  return null;
}

function saveWindowState({ x, y, width, height }) {
  try {
    const existing = loadWindowState() || {};
    fs.writeFileSync(POSITION_FILE, JSON.stringify({
      ...existing,
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    }));
  } catch { /* ignore */ }
}

// ── Screenshot (F9 / manual) ─────────────────────────────────────────────────
async function captureScreenshot() {
  const screenshot = require("screenshot-desktop");
  const sharp = require("sharp");

  // Hide Copilot window so it doesn't appear in the screenshot sent to AI
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(0);
  await new Promise((r) => setTimeout(r, 150));
  let imgBuffer;
  try {
    imgBuffer = await screenshot({ format: "png" });
  } finally {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(1);
  }
  const settings = loadSettings();

  let source = imgBuffer;

  // Use live region for F9 if configured and "useRegionForF9" setting is enabled
  if (settings.liveRegion && settings.useRegionForF9) {
    const { x, y, width, height } = settings.liveRegion;
    source = await sharp(imgBuffer)
      .extract({ left: x, top: y, width, height })
      .png()
      .toBuffer();
  }

  const resized = await sharp(source)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return resized.toString("base64");
}

// ── MegaTischler detector ─────────────────────────────────────────────────────
let megaTischlerActive = false;
let detectorInterval = null;

function startMegaTischlerDetector(win) {
  if (detectorInterval) {
    clearInterval(detectorInterval);
    detectorInterval = null;
  }

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
  const savedState = loadWindowState();
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const winWidth = Math.min(Math.max(savedState?.width || 380, 320), screenWidth);
  const winHeight = Math.min(Math.max(savedState?.height || 700, 480), screenHeight);

  const defaultX = screenWidth - winWidth - 20;
  const defaultY = Math.round((screenHeight - winHeight) / 2);

  const x = savedState?.x ?? defaultX;
  const y = savedState?.y ?? defaultY;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 320,
    minHeight: 480,
    x,
    y,
    alwaysOnTop: true,
    frame: false,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  const persistWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [wx, wy] = mainWindow.getPosition();
    const [ww, wh] = mainWindow.getSize();
    saveWindowState({ x: wx, y: wy, width: ww, height: wh });
  };

  let resizeSaveTimer = null;
  mainWindow.on("moved", persistWindowState);
  mainWindow.on("resize", () => {
    if (resizeSaveTimer) clearTimeout(resizeSaveTimer);
    resizeSaveTimer = setTimeout(persistWindowState, 250);
  });

  mainWindow.on("closed", () => {
    stopLiveLoop();
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  startMegaTischlerDetector(mainWindow);

  // Init budget tracking
  const s = loadSettings();
  checkAndResetDailyBudget(s);

  // Resume live loop if it was active last session (and within budget)
  if (s.liveEnabled && dailySpentUsd < (s.dailyBudgetUsd || 100)) {
    startLiveLoop(mainWindow);
  }

  // Warn renderer if diff libraries are missing (Live mode won't work)
  if (diffLibsMissing) {
    mainWindow.webContents.once("did-finish-load", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("live-deps-missing");
      }
    });
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

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
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (detectorInterval) clearInterval(detectorInterval);
});

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle("capture-screenshot", async () => {
  return await captureScreenshot();
});

ipcMain.handle("get-settings", () => {
  return loadSettings();
});

ipcMain.handle("save-settings", (_, newSettings) => {
  saveSettings({ ...loadSettings(), ...newSettings });
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

ipcMain.handle("tts-speak", async (_, { text, voice }) => {
  const settings = loadSettings();
  const url = `${settings.backendUrl}/api/tts`;
  const headers = { "Content-Type": "application/json" };
  if (settings.openaiKey) headers["x-openai-key"] = settings.openaiKey;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, voice: voice || settings.ttsVoice || "onyx" }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TTS HTTP ${res.status}: ${body}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf).toString("base64");
});

// ── Live mode IPC (Faza 2.0) ──────────────────────────────────────────────────

// Faza A: open region picker before enabling live
ipcMain.handle("live-start-region-picker", () => {
  openRegionPicker();
  return { ok: true };
});

// Region picker sends picker-window-relative DIP coords; we add the picker origin
// (virtual desktop offset) then multiply by the display's scaleFactor to get
// physical pixel coordinates for sharp.extract / screenshot-desktop output.
ipcMain.on("region-picker-selected", (_, dipRegion) => {
  // Mark confirmed BEFORE calling close() so the "closed" event doesn't send cancel
  regionConfirmedThisSession = true;

  if (regionPickerWindow && !regionPickerWindow.isDestroyed()) {
    regionPickerWindow.close();
  }

  // Convert picker-relative DIP → global DIP by adding the picker window origin
  const globalDipX = dipRegion.dipX + pickerOriginX;
  const globalDipY = dipRegion.dipY + pickerOriginY;

  // Determine scale factor for the display at the top-left corner of the selection
  const display = screen.getDisplayNearestPoint({ x: globalDipX, y: globalDipY });
  const sf = display.scaleFactor || 1;

  const region = {
    x: Math.round(globalDipX * sf),
    y: Math.round(globalDipY * sf),
    width: Math.round(dipRegion.dipWidth * sf),
    height: Math.round(dipRegion.dipHeight * sf),
    scaleFactor: sf,
    // Store DIP coords for UI display (human-readable)
    dipX: globalDipX,
    dipY: globalDipY,
    dipWidth: dipRegion.dipWidth,
    dipHeight: dipRegion.dipHeight,
  };

  const settings = loadSettings();
  settings.liveRegion = region;
  saveSettings(settings);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("live-region-selected", region);
  }
});

ipcMain.on("region-picker-cancelled", () => {
  if (regionPickerWindow && !regionPickerWindow.isDestroyed()) {
    regionPickerWindow.close();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("live-region-cancelled");
  }
});

ipcMain.handle("live-set-enabled", (_, enabled) => {
  const settings = loadSettings();
  settings.liveEnabled = enabled;
  saveSettings(settings);
  if (enabled) {
    if (mainWindow) startLiveLoop(mainWindow);
  } else {
    stopLiveLoop();
  }
  return { ok: true, enabled };
});

ipcMain.handle("live-reset-count", () => {
  dailySpentUsd = 0;
  dailyCallCount = 0;
  liveCallCount = 0;
  lastDialogHash = null;
  const settings = loadSettings();
  settings.dailySpentUsd = 0;
  settings.dailyCallCount = 0;
  settings.budgetResetDate = getTodayDateStr();
  saveSettings(settings);
  return { ok: true };
});

ipcMain.handle("live-get-status", () => {
  const settings = loadSettings();
  return {
    enabled: !!settings.liveEnabled,
    callCount: dailyCallCount,
    spentUsd: dailySpentUsd,
    budgetUsd: settings.dailyBudgetUsd || 100,
    liveRegion: settings.liveRegion || null,
    sessionContext: sessionContext || null,
    diffLibsMissing,
  };
});

ipcMain.handle("live-set-budget", (_, budget) => {
  const settings = loadSettings();
  settings.dailyBudgetUsd = Number(budget) || 100;
  saveSettings(settings);
  return { ok: true };
});

// Keep old limit handler for backward compat
ipcMain.handle("live-set-limit", (_, limit) => {
  const settings = loadSettings();
  settings.liveDailyLimit = Number(limit) || 200;
  saveSettings(settings);
  return { ok: true };
});

ipcMain.handle("live-clear-region", () => {
  const settings = loadSettings();
  delete settings.liveRegion;
  // Also disable live when region is cleared to prevent unexpected full-screen capture
  if (settings.liveEnabled) {
    settings.liveEnabled = false;
    stopLiveLoop();
  }
  saveSettings(settings);
  return { ok: true, liveDisabled: !settings.liveEnabled };
});

ipcMain.handle("live-get-session-context", () => {
  return sessionContext;
});

// MAC file upload proxy — renderer sends { files: [{name, base64}] }, main POSTs to backend
// Uses native FormData + Blob (available in Electron/Node 18+)
ipcMain.handle("upload-mac-files", async (_, { files }) => {
  const settings = loadSettings();

  try {
    const form = new FormData();
    for (const f of files) {
      const buf = Buffer.from(f.base64, "base64");
      const blob = new Blob([buf], { type: "application/octet-stream" });
      form.append("files", blob, f.name);
    }

    const res = await fetch(`${settings.backendUrl}/api/upload-mac`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});

// Faza D: learn endpoint proxy (renderer → main → backend)
ipcMain.handle("kb-learn", async (_, { formulas, parameters, observations }) => {
  const settings = loadSettings();
  try {
    const res = await fetch(`${settings.backendUrl}/api/knowledge/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formulas, parameters, observations }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
});
