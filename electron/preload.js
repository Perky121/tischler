const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // Screenshot
  captureScreenshot: () => ipcRenderer.invoke("capture-screenshot"),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  closeWindow: () => ipcRenderer.invoke("close-window"),

  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (s) => ipcRenderer.invoke("save-settings", s),

  // MegaTischler status
  getMtStatus: () => ipcRenderer.invoke("get-mt-status"),

  // Knowledge base stats (fetched via main to avoid CORS)
  fetchKnowledgeStats: () => ipcRenderer.invoke("fetch-knowledge-stats"),

  // MAC file upload (main → backend, avoids CORS)
  uploadMacFiles: (filesData) => ipcRenderer.invoke("upload-mac-files", filesData),

  // Audio transcription
  transcribeAudio: (base64, mimeType) =>
    ipcRenderer.invoke("transcribe-audio", { base64, mimeType }),

  // TTS — returns base64 mp3 to play in renderer
  ttsSpeak: (text, voice) => ipcRenderer.invoke("tts-speak", { text, voice }),

  // Faza 2.0: Live mode — invoke
  liveStartRegionPicker: () => ipcRenderer.invoke("live-start-region-picker"),
  liveSetEnabled: (enabled) => ipcRenderer.invoke("live-set-enabled", enabled),
  liveSetTask: (task) => ipcRenderer.invoke("live-set-task", task),
  liveStart: (task) => ipcRenderer.invoke("live-start", task),
  livePause: () => ipcRenderer.invoke("live-pause"),
  liveResume: () => ipcRenderer.invoke("live-resume"),
  liveGetStatus: () => ipcRenderer.invoke("live-get-status"),
  liveSetBudget: (budget) => ipcRenderer.invoke("live-set-budget", budget),
  liveSetLimit: (limit) => ipcRenderer.invoke("live-set-limit", limit), // compat
  liveResetCount: () => ipcRenderer.invoke("live-reset-count"),
  liveClearRegion: () => ipcRenderer.invoke("live-clear-region"),
  liveGetSessionContext: () => ipcRenderer.invoke("live-get-session-context"),

  // Knowledge base: learn from session
  kbLearn: (data) => ipcRenderer.invoke("kb-learn", data),

  // ── Debug mode ──────────────────────────────────────────────────────────────
  debugStartRecording: () => ipcRenderer.invoke("debug-start-recording"),
  debugStopRecording: () => ipcRenderer.invoke("debug-stop-recording"),
  debugGetFrames: () => ipcRenderer.invoke("debug-get-frames"),
  debugClearFrames: () => ipcRenderer.invoke("debug-clear-frames"),
  debugRemoveLastFrame: () => ipcRenderer.invoke("debug-remove-last-frame"),
  debugGetState: () => ipcRenderer.invoke("debug-get-state"),
  onDebugFrameCaptured: (cb) =>
    ipcRenderer.on("debug-frame-captured", (_, data) => cb(data)),

  // Faza 2.0: Live mode — events (main → renderer)
  onLiveMessage: (cb) =>
    ipcRenderer.on("live-message", (_, data) => cb(data)),
  onLiveBudgetReached: (cb) =>
    ipcRenderer.on("live-budget-reached", (_, data) => cb(data)),
  onLiveLimitReached: (cb) =>
    ipcRenderer.on("live-budget-reached", (_, data) => cb(data)), // compat alias
  onLiveDepsMissing: (cb) =>
    ipcRenderer.on("live-deps-missing", () => cb()),
  onLiveContextUpdated: (cb) =>
    ipcRenderer.on("live-context-updated", (_, ctx) => cb(ctx)),
  onLiveKbSuggest: (cb) =>
    ipcRenderer.on("live-kb-suggest", (_, data) => cb(data)),
  onLiveRegionSelected: (cb) =>
    ipcRenderer.on("live-region-selected", (_, region) => cb(region)),
  onLiveRegionCancelled: (cb) =>
    ipcRenderer.on("live-region-cancelled", () => cb()),
  onLiveStateChanged: (cb) =>
    ipcRenderer.on("live-state-changed", (_, data) => cb(data)),
  onLiveModuleLoaded: (cb) =>
    ipcRenderer.on("live-module-loaded", (_, data) => cb(data)),

  // Event listeners: main → renderer
  onScreenshotCaptured: (cb) =>
    ipcRenderer.on("screenshot-captured", (_, base64) => cb(base64)),
  onScreenshotError: (cb) =>
    ipcRenderer.on("screenshot-error", (_, msg) => cb(msg)),
  onMegaTischlerStatus: (cb) =>
    ipcRenderer.on("mt-status", (_, isActive) => cb(isActive)),
  onToggleRecording: (cb) =>
    ipcRenderer.on("toggle-recording", () => cb()),

  // MegaTischler Bridge — file system scanner
  mtBrowseFolder: () => ipcRenderer.invoke("mt-browse-folder"),
  mtBridgeScan: (installPath) => ipcRenderer.invoke("mt-bridge-scan", installPath),
  mtBridgeImportFile: (args) => ipcRenderer.invoke("mt-bridge-import-file", args),
  mtBridgeReadFile: (args) => ipcRenderer.invoke("mt-bridge-read-file", args),

  // Formula injection — upiši formulu direktno u aktivno polje MegaTischlera
  injectFormula: (formula) => ipcRenderer.invoke("inject-formula", { formula }),

  // Conversations persistence
  getConversations: () => ipcRenderer.invoke("get-conversations"),
  saveConversations: (data) => ipcRenderer.invoke("save-conversations", data),
  deleteConversation: (id) => ipcRenderer.invoke("delete-conversation", id),

  // Cleanup
  removeScreenshotListeners: () => {
    ipcRenderer.removeAllListeners("screenshot-captured");
    ipcRenderer.removeAllListeners("screenshot-error");
  },
  removeMtStatusListeners: () => {
    ipcRenderer.removeAllListeners("mt-status");
  },
  removeRecordingListeners: () => {
    ipcRenderer.removeAllListeners("toggle-recording");
  },
  removeLiveListeners: () => {
    ipcRenderer.removeAllListeners("live-message");
    ipcRenderer.removeAllListeners("live-budget-reached");
    ipcRenderer.removeAllListeners("live-context-updated");
    ipcRenderer.removeAllListeners("live-kb-suggest");
    ipcRenderer.removeAllListeners("live-region-selected");
    ipcRenderer.removeAllListeners("live-region-cancelled");
    ipcRenderer.removeAllListeners("live-deps-missing");
    ipcRenderer.removeAllListeners("live-state-changed");
    ipcRenderer.removeAllListeners("live-module-loaded");
    ipcRenderer.removeAllListeners("debug-frame-captured");
  },
});
