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

  // Audio transcription (main sends audio base64 to backend)
  transcribeAudio: (base64, mimeType) =>
    ipcRenderer.invoke("transcribe-audio", { base64, mimeType }),

  // TTS — returns base64 mp3 to play in renderer
  ttsSpeak: (text, voice) => ipcRenderer.invoke("tts-speak", { text, voice }),

  // Faza 3: Live mode — invoke
  liveSetEnabled: (enabled) => ipcRenderer.invoke("live-set-enabled", enabled),
  liveGetStatus: () => ipcRenderer.invoke("live-get-status"),
  liveSetLimit: (limit) => ipcRenderer.invoke("live-set-limit", limit),
  liveResetCount: () => ipcRenderer.invoke("live-reset-count"),

  // Faza 3: Live mode — events
  onLiveMessage: (cb) =>
    ipcRenderer.on("live-message", (_, data) => cb(data)),
  onLiveLimitReached: (cb) =>
    ipcRenderer.on("live-limit-reached", (_, data) => cb(data)),

  // Event listeners: main → renderer
  onScreenshotCaptured: (cb) =>
    ipcRenderer.on("screenshot-captured", (_, base64) => cb(base64)),
  onScreenshotError: (cb) =>
    ipcRenderer.on("screenshot-error", (_, msg) => cb(msg)),
  onMegaTischlerStatus: (cb) =>
    ipcRenderer.on("mt-status", (_, isActive) => cb(isActive)),
  onToggleRecording: (cb) =>
    ipcRenderer.on("toggle-recording", () => cb()),

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
    ipcRenderer.removeAllListeners("live-limit-reached");
  },
});
