/* global React, ReactDOM */
const { useState, useRef, useEffect, useCallback } = React;

// ── Utilities ──────────────────────────────────────────────────────────────
function extractBase64(dataUrl) {
  const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : dataUrl;
}

const INPUT_HEIGHT_MIN = 48;
const INPUT_HEIGHT_MAX = 320;
const INPUT_HEIGHT_DEFAULT = 72;

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── CodeBlock ──────────────────────────────────────────────────────────────
function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{lang || "kod"}</span>
        <button
          className={`copy-btn${copied ? " copied" : ""}`}
          onClick={handleCopy}
          title="Kopiraj"
        >
          {copied ? "✓ Kopirano" : "⎘ Kopiraj"}
        </button>
      </div>
      <div className="code-body">
        <pre>{code}</pre>
      </div>
    </div>
  );
}

// ── MarkdownMessage ────────────────────────────────────────────────────────
function renderInline(text) {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g);
  return tokens.map((token, i) => {
    if (!token) return null;
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return React.createElement("strong", { key: i, style: { fontWeight: 600 } }, token.slice(2, -2));
    }
    if (token.startsWith("*") && token.endsWith("*") && token.length > 2 && !token.startsWith("**")) {
      return React.createElement("em", { key: i }, token.slice(1, -1));
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return React.createElement("code", { key: i, className: "inline-code" }, token.slice(1, -1));
    }
    return token;
  });
}

function TextBlock({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let ulItems = [];
  let olItems = [];
  let paraLines = [];

  const flushUL = () => {
    if (!ulItems.length) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="md-list">
        {ulItems.map((item, i) => (
          <li key={i} className="md-list-item">
            <span className="md-bullet" />
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    ulItems = [];
  };

  const flushOL = () => {
    if (!olItems.length) return;
    elements.push(
      <ol key={`ol-${elements.length}`} className="md-list">
        {olItems.map((item, i) => (
          <li key={i} className="md-list-item">
            <span className="md-num">{item.num}.</span>
            <span>{renderInline(item.content)}</span>
          </li>
        ))}
      </ol>
    );
    olItems = [];
  };

  const flushPara = () => {
    if (!paraLines.length) return;
    elements.push(
      <p key={`p-${elements.length}`} className="md-para">
        {renderInline(paraLines.join("\n"))}
      </p>
    );
    paraLines = [];
  };

  const flushAll = () => { flushUL(); flushOL(); flushPara(); };

  for (const line of lines) {
    const hMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      flushAll();
      const level = hMatch[1].length;
      const cls = level === 1 ? "md-h1" : level === 2 ? "md-h2" : "md-h3";
      elements.push(<div key={`h-${elements.length}`} className={cls}>{renderInline(hMatch[2])}</div>);
      continue;
    }
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushAll();
      elements.push(<hr key={`hr-${elements.length}`} className="md-hr" />);
      continue;
    }
    const ulMatch = line.match(/^[\-\*•]\s+(.+)$/);
    if (ulMatch) {
      flushOL(); flushPara();
      ulItems.push(ulMatch[1]);
      continue;
    }
    const olMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      flushUL(); flushPara();
      olItems.push({ num: olMatch[1], content: olMatch[2] });
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    flushUL(); flushOL();
    paraLines.push(line);
  }
  flushAll();

  return <div className="md-content">{elements}</div>;
}

function MarkdownMessage({ content }) {
  const segments = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="md-root">
      {segments.map((seg, i) => {
        if (seg.startsWith("```") && seg.endsWith("```")) {
          const match = seg.match(/```(\w*)\n?([\s\S]*?)```/);
          const lang = match?.[1] || "";
          const code = match?.[2]?.trim() || seg.slice(3, -3).trim();
          return <CodeBlock key={i} code={code} lang={lang} />;
        }
        if (!seg.trim()) return null;
        return <TextBlock key={i} text={seg} />;
      })}
    </div>
  );
}

// ── Suggestion buttons ─────────────────────────────────────────────────────
const SUGGESTIONS = [
  { id: "explain", label: "Objasni sintaksu", msg: "Možeš li detaljnije objasniti sintaksu ove formule?" },
  { id: "check",   label: "📷 Provjeri ekran", action: "screenshot" },
  { id: "alt",     label: "Alternativa",       msg: "Postoji li alternativni način ili formula?" },
];

function SuggestionButtons({ onSelect, onScreenshotCheck }) {
  return (
    <div className="suggestion-row">
      {SUGGESTIONS.map((s) => (
        <button
          key={s.id}
          className="suggestion-btn"
          onClick={() => s.action === "screenshot" ? onScreenshotCheck() : onSelect(s.msg)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

const TTS_VOICES = [
  { id: "onyx",    label: "Onyx (duboki, muški)" },
  { id: "nova",    label: "Nova (jasni, ženski)" },
  { id: "shimmer", label: "Shimmer (topli, ženski)" },
  { id: "echo",    label: "Echo (srednji, muški)" },
  { id: "alloy",   label: "Alloy (neutralni)" },
  { id: "fable",   label: "Fable (ekspresivni)" },
];

// ── SettingsPanel ──────────────────────────────────────────────────────────
function SettingsPanel({
  onClose,
  liveSpentUsd = 0,
  liveBudgetUsd = 100,
  liveCallCount = 0,
  liveRegion = null,
  setLiveRegion,
  setLiveEnabled,
  setLiveSpentUsd,
  setLiveCallCount,
  setLiveBudgetUsd,
  onChangeRegion,
}) {
  const [backendUrl, setBackendUrl] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [micDeviceId, setMicDeviceId] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoice, setTtsVoice] = useState("onyx");
  const [mics, setMics] = useState([]);
  const [stats, setStats] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [useRegionForF9, setUseRegionForF9] = useState(false);
  const [macUploadStatus, setMacUploadStatus] = useState(null); // null | "uploading" | {ok, count, errors}
  const macFileInputRef = React.useRef(null);
  useEffect(() => {
    window.electron.getSettings().then((s) => {
      setBackendUrl(s.backendUrl || "");
      setOpenaiKey(s.openaiKey || "");
      setMicDeviceId(s.micDeviceId || "");
      setTtsEnabled(s.ttsEnabled || false);
      setTtsVoice(s.ttsVoice || "onyx");
      setUseRegionForF9(!!s.useRegionForF9);
    });
    window.electron.fetchKnowledgeStats().then((data) => {
      if (!data.error) setStats(data);
    });
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setMics(devices.filter((d) => d.kind === "audioinput"));
    }).catch(() => {});
  }, []);

  function handleSave() {
    window.electron.saveSettings({ backendUrl, openaiKey, micDeviceId, ttsEnabled, ttsVoice }).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  async function handleTestVoice() {
    setTestingVoice(true);
    try {
      const base64 = await window.electron.ttsSpeak("Ovo je testni glasovni odgovor MegaTischler Copilota.", ttsVoice);
      playTtsBase64(base64);
    } catch (err) {
      alert("TTS greška: " + err.message);
    } finally {
      setTestingVoice(false);
    }
  }

  async function handleMacUpload(files) {
    if (!files || files.length === 0) return;
    setMacUploadStatus("uploading");
    try {
      // Read all files as base64 in the renderer (FileReader), then pass to main
      const filesData = await Promise.all(Array.from(files).map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(",")[1];
          resolve({ name: file.name, base64 });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));

      const result = await window.electron.uploadMacFiles({ files: filesData });
      if (result.error) throw new Error(result.error);

      // Refresh stats
      window.electron.fetchKnowledgeStats().then((data) => {
        if (!data.error) setStats(data);
      });

      setMacUploadStatus({ ok: true, count: filesData.length });
      setTimeout(() => setMacUploadStatus(null), 3000);
    } catch (err) {
      setMacUploadStatus({ ok: false, error: err.message });
      setTimeout(() => setMacUploadStatus(null), 5000);
    }
  }

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel">
        <div className="settings-header">
          <span className="settings-title">⚙ Postavke</span>
          <button className="btn-icon" onClick={onClose} title="Zatvori">✕</button>
        </div>

        {/* Backend URL */}
        <div className="settings-section">
          <div className="settings-label">Backend URL (Replit)</div>
          <input
            className="settings-input"
            type="text"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            placeholder="https://...replit.dev"
          />
        </div>

        {/* OpenAI API Key */}
        <div className="settings-section">
          <div className="settings-label">OpenAI API Key (za glasovni unos)</div>
          <div style={{ position: "relative" }}>
            <input
              className="settings-input"
              type={showKey ? "text" : "password"}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              style={{ paddingRight: 48 }}
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: "var(--text3)"
              }}
            >
              {showKey ? "sakrij" : "prikaži"}
            </button>
          </div>
          <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>
            Alternativno: dodaj OPENAI_API_KEY u Replit Secrets
          </div>
        </div>

        {/* Microphone */}
        <div className="settings-section">
          <div className="settings-label">Mikrofon (F8 glasovni unos)</div>
          <select
            className="settings-input"
            value={micDeviceId}
            onChange={(e) => setMicDeviceId(e.target.value)}
            style={{ cursor: "pointer" }}
          >
            <option value="">Zadani mikrofon</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Mikrofon ${m.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>

        {/* TTS */}
        <div className="settings-section">
          <div className="settings-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Glasovni odgovor (TTS)</span>
            <label className="tts-toggle">
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={(e) => setTtsEnabled(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              {ttsEnabled ? "Uključen" : "Isključen"}
            </label>
          </div>
          {ttsEnabled && (
            <>
              <select
                className="settings-input"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
                style={{ cursor: "pointer", marginTop: 6 }}
              >
                {TTS_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              <button
                className="btn-save"
                onClick={handleTestVoice}
                disabled={testingVoice}
                style={{ marginTop: 6, background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)" }}
              >
                {testingVoice ? "Reproducira..." : "🔊 Testiraj glas"}
              </button>
            </>
          )}
        </div>

        {/* Live mode — region + budget */}
        <div className="settings-section">
          <div className="settings-label">Live mod 2.0 — budžet i područje</div>

          {/* Budget display */}
          <div className="live-cost-row">
            <div className="live-cost-stat">
              <span className="live-cost-num">${liveSpentUsd.toFixed(2)}</span>
              <span className="live-cost-desc">potrošeno danas</span>
            </div>
            <div className="live-cost-stat">
              <span className="live-cost-num">${liveBudgetUsd}</span>
              <span className="live-cost-desc">dnevni budžet</span>
            </div>
            <div className="live-cost-stat">
              <span className="live-cost-num">{liveCallCount}</span>
              <span className="live-cost-desc">AI poziva</span>
            </div>
          </div>

          {/* Budget progress bar */}
          {(() => {
            const pct = liveBudgetUsd > 0 ? liveSpentUsd / liveBudgetUsd : 0;
            return (
              <>
                <div className="live-budget-bar">
                  <div
                    className={`live-budget-fill${pct > 0.8 ? " warning" : ""}`}
                    style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }}
                  />
                </div>
                {pct > 0.8 && (
                  <div className="live-cost-warning">
                    ⚠ Potrošeno {Math.round(pct * 100)}% dnevnog budžeta
                  </div>
                )}
              </>
            );
          })()}

          {/* Budget input */}
          <div className="settings-label" style={{ marginTop: 8 }}>Dnevni budžet (USD)</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
            <input
              className="settings-input"
              type="number"
              min="1"
              max="500"
              defaultValue={liveBudgetUsd}
              key={liveBudgetUsd}
              onBlur={(e) => {
                const n = parseFloat(e.target.value);
                if (n > 0) {
                  setLiveBudgetUsd && setLiveBudgetUsd(n);
                  window.electron.liveSetBudget(n).catch(() => {});
                }
              }}
              style={{ width: 80 }}
            />
            <button
              className="btn-save"
              style={{ flex: 1, background: "var(--bg3)", color: "var(--text3)", border: "1px solid var(--border)" }}
              onClick={() => {
                setLiveSpentUsd && setLiveSpentUsd(0);
                setLiveCallCount && setLiveCallCount(0);
                window.electron.liveResetCount().catch(() => {});
              }}
            >
              Resetiraj brojač
            </button>
          </div>

          {/* Region */}
          <div className="settings-label" style={{ marginTop: 10 }}>Praćeno područje ekrana</div>
          {liveRegion ? (
            <div className="live-region-info">
              <span className="live-region-coords">
                {liveRegion.x},{liveRegion.y} — {liveRegion.width}×{liveRegion.height}px
              </span>
              <button
                className="btn-save"
                style={{ fontSize: 11, padding: "3px 8px", background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)" }}
                onClick={() => { onChangeRegion && onChangeRegion(); }}
              >
                Promijeni
              </button>
              <button
                className="btn-save"
                style={{ fontSize: 11, padding: "3px 8px", background: "var(--bg3)", color: "var(--text3)", border: "1px solid var(--border)" }}
                onClick={() => {
                  window.electron.liveClearRegion().then((result) => {
                    if (result?.liveDisabled && setLiveEnabled) setLiveEnabled(false);
                  }).catch(() => {});
                  setLiveRegion && setLiveRegion(null);
                }}
              >
                Ukloni
              </button>
            </div>
          ) : (
            <div style={{ color: "var(--text3)", fontSize: 12, marginTop: 4 }}>
              Nije odabrano — klik na Live gumb za odabir
            </div>
          )}

          {/* useRegionForF9 toggle */}
          {liveRegion && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                id="useRegionForF9"
                checked={useRegionForF9}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setUseRegionForF9(checked);
                  window.electron.saveSettings({ useRegionForF9: checked }).catch(() => {});
                }}
                style={{ cursor: "pointer" }}
              />
              <label htmlFor="useRegionForF9" style={{ fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                Koristi isto područje i za F9 screenshot
              </label>
            </div>
          )}
        </div>

        {/* Knowledge base stats */}
        <div className="settings-section">
          <div className="settings-label">Baza znanja</div>
          {stats ? (
            <div className="settings-stats">
              <div className="stat-card">
                <div className="stat-value">{stats.stats?.formulaCount ?? stats.formula_count ?? stats.formulas?.length ?? "—"}</div>
                <div className="stat-label">Formule</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.stats?.parameterCount ?? stats.parameter_count ?? stats.parameters?.length ?? "—"}</div>
                <div className="stat-label">Parametri</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.stats?.fileCount ?? stats.file_count ?? stats._meta?.files_processed ?? "—"}</div>
                <div className="stat-label">Datoteke</div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text3)" }}>Učitavanje...</div>
          )}

          {/* MAC file upload */}
          <div className="settings-label" style={{ marginTop: 10 }}>Dodaj .mac datoteke u bazu</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
            <input
              ref={macFileInputRef}
              type="file"
              accept=".mac,.zip"
              multiple
              style={{ display: "none" }}
              onChange={(e) => { handleMacUpload(e.target.files); e.target.value = ""; }}
            />
            <button
              className="btn-save"
              style={{ flex: 1, background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)" }}
              onClick={() => macFileInputRef.current?.click()}
              disabled={macUploadStatus === "uploading"}
            >
              {macUploadStatus === "uploading" ? "⏳ Dodavanje..." : "📁 Odaberi .mac / .zip"}
            </button>
          </div>
          {macUploadStatus && macUploadStatus !== "uploading" && (
            <div style={{
              marginTop: 6, fontSize: 11, padding: "4px 8px", borderRadius: 4,
              background: macUploadStatus.ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
              color: macUploadStatus.ok ? "var(--accent)" : "#f87171",
              border: `1px solid ${macUploadStatus.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
            }}>
              {macUploadStatus.ok
                ? `✓ Dodano ${macUploadStatus.count} datoteka(e) u bazu znanja`
                : `✗ Greška: ${macUploadStatus.error}`}
            </div>
          )}
        </div>

        {/* Shortcuts */}
        <div className="settings-section">
          <div className="settings-label">Tipkovni prečaci</div>
          <div className="shortcuts-list">
            <div className="shortcut-row">
              <span className="shortcut-key">F9</span>
              <span className="shortcut-desc">Snimi ekran i pošalji</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">F8</span>
              <span className="shortcut-desc">Uključi / isključi glasovni unos</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Enter</span>
              <span className="shortcut-desc">Pošalji poruku</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Shift+Enter</span>
              <span className="shortcut-desc">Novi red</span>
            </div>
          </div>
        </div>

        <button className={`btn-save${saved ? " saved" : ""}`} onClick={handleSave}>
          {saved ? "✓ Spremljeno" : "Spremi"}
        </button>

        <div className="version-info">MegaTischler Copilot v1.0.0</div>
      </div>
    </div>
  );
}

// ── TTS playback helper (called outside React) ────────────────────────────
let activeTtsAudio = null;

function playTtsBase64(base64) {
  if (activeTtsAudio) {
    activeTtsAudio.pause();
    activeTtsAudio = null;
  }
  const blob = new Blob(
    [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
    { type: "audio/mpeg" }
  );
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  activeTtsAudio = audio;
  audio.play().catch(() => {});
  audio.addEventListener("ended", () => {
    URL.revokeObjectURL(url);
    if (activeTtsAudio === audio) activeTtsAudio = null;
  });
}

function stopTts() {
  if (activeTtsAudio) {
    activeTtsAudio.pause();
    activeTtsAudio = null;
  }
}

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mtActive, setMtActive] = useState(false);
  const [mtWarning, setMtWarning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveCallCount, setLiveCallCount] = useState(0);
  const [liveSpentUsd, setLiveSpentUsd] = useState(0);
  const [liveBudgetUsd, setLiveBudgetUsd] = useState(100);
  const [liveRegion, setLiveRegion] = useState(null);
  const [sessionContext, setSessionContext] = useState(null);
  const [awaitingRegion, setAwaitingRegion] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_HEIGHT_DEFAULT);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const inputHeightRef = useRef(INPUT_HEIGHT_DEFAULT);
  const resizingInputRef = useRef(false);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  // Refs for values used inside useCallback without adding to deps (avoids stale closures)
  const liveEnabledRef = useRef(false);
  const sessionContextRef = useRef(null);
  // Track previous live state when opening region picker so cancel can restore it
  const prevLiveEnabledRef = useRef(false);
  // Stable message IDs (avoid re-render issues when dismissing by index)
  const msgIdCounterRef = useRef(0);
  function nextMsgId() { return ++msgIdCounterRef.current; }
  const audioChunksRef = useRef([]);
  const recTimerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const toggleRecordingRef = useRef(null);

  // ── Recording ────────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const settings = await window.electron.getSettings();
      const micId = settings.micDeviceId;
      const constraints = { audio: micId ? { deviceId: { exact: micId } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      });

      recorder.addEventListener("stop", async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result.split(",")[1];
          setIsTranscribing(true);
          try {
            const text = await window.electron.transcribeAudio(base64, mimeType);
            if (text) {
              setInput((prev) => (prev ? prev + " " + text : text));
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now(),
                  role: "assistant",
                  content: "⚠️ Transkripcija nije uspjela — primljen je prazan odgovor. Provjeri OpenAI API ključ u Postavkama.",
                  type: "proactive",
                },
              ]);
            }
          } catch (err) {
            console.error("Transcription error:", err);
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now(),
                role: "assistant",
                content: `⚠️ Greška transkripcije: ${err.message || "nepoznata greška"}. Provjeri OpenAI API ključ i internetsku vezu.`,
                type: "proactive",
              },
            ]);
          } finally {
            setIsTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
      });

      recorder.start();
      mediaRecorderRef.current = recorder;
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingSecs(0);
      recTimerRef.current = setInterval(() => setRecordingSecs((s) => s + 1), 1000);
    } catch (err) {
      console.error("Mic error:", err);
      alert("Nije moguće pristupiti mikrofonu: " + err.message);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    isRecordingRef.current = false;
    setIsRecording(false);
    setRecordingSecs(0);
  }

  // Keep ref pointing to latest toggle function (avoids stale closure in IPC listener)
  toggleRecordingRef.current = () => {
    if (isRecordingRef.current) stopRecording();
    else startRecording();
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    window.electron.getMtStatus().then((active) => setMtActive(active));

    window.electron.onMegaTischlerStatus((active) => setMtActive(active));
    window.electron.onScreenshotCaptured((base64) => {
      setScreenshotDataUrl("data:image/jpeg;base64," + base64);
    });
    window.electron.onScreenshotError((msg) => {
      alert("Screenshot greška: " + msg);
    });
    window.electron.onToggleRecording(() => {
      toggleRecordingRef.current?.();
    });

    // Load persisted live status
    window.electron.liveGetStatus().then((s) => {
      setLiveEnabled(s.enabled);
      setLiveCallCount(s.callCount ?? 0);
      setLiveSpentUsd(s.spentUsd ?? 0);
      setLiveBudgetUsd(s.budgetUsd ?? 100);
      setLiveRegion(s.liveRegion ?? null);
      if (s.sessionContext) setSessionContext(s.sessionContext);
    }).catch(() => {});

    window.electron.getSettings().then((s) => {
      const h = Number(s.inputHeight);
      if (h >= INPUT_HEIGHT_MIN && h <= INPUT_HEIGHT_MAX) {
        setInputHeight(h);
        inputHeightRef.current = h;
      }
    }).catch(() => {});

    return () => {
      window.electron.removeScreenshotListeners();
      window.electron.removeMtStatusListeners();
      window.electron.removeRecordingListeners();
      stopRecording();
    };
  }, []);

  useEffect(() => {
    inputHeightRef.current = inputHeight;
  }, [inputHeight]);

  useEffect(() => {
    function onMouseMove(e) {
      if (!resizingInputRef.current) return;
      const delta = resizeStartYRef.current - e.clientY;
      const next = Math.max(
        INPUT_HEIGHT_MIN,
        Math.min(INPUT_HEIGHT_MAX, resizeStartHeightRef.current + delta),
      );
      setInputHeight(next);
    }

    function onMouseUp() {
      if (!resizingInputRef.current) return;
      resizingInputRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.electron.saveSettings({ inputHeight: inputHeightRef.current }).catch(() => {});
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function startInputResize(e) {
    resizingInputRef.current = true;
    resizeStartYRef.current = e.clientY;
    resizeStartHeightRef.current = inputHeightRef.current;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }

  // Live mode IPC listeners
  useEffect(() => {
    window.electron.onLiveMessage((data) => {
      setLiveCallCount(data.callCount ?? 0);
      setLiveSpentUsd(data.spentUsd ?? 0);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: data.message,
          type: "proactive",
          context: data.context || null,
        },
      ]);
    });

    window.electron.onLiveBudgetReached((data) => {
      setLiveEnabled(false);
      setLiveSpentUsd(data.spent ?? 0);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: `Live mod automatski isključen — dostignut dnevni budžet od ${data.budget ?? 100} $.`,
          type: "proactive",
        },
      ]);
    });

    window.electron.onLiveContextUpdated((ctx) => {
      setSessionContext(ctx);
    });

    window.electron.onLiveKbSuggest((data) => {
      const ctx = data.context;
      if (!ctx) return;
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: `Detektiran novi dijalog parametara. Želiš li spremiti ove podatke u bazu znanja?`,
          type: "kb-suggest",
          context: ctx,
        },
      ]);
    });

    // Region picker callbacks
    window.electron.onLiveRegionSelected((region) => {
      setLiveRegion(region);
      setAwaitingRegion(false);
      // Now actually enable live
      window.electron.liveSetEnabled(true).then(() => setLiveEnabled(true)).catch(console.error);
    });

    window.electron.onLiveRegionCancelled(() => {
      setAwaitingRegion(false);
      // Restore live state if it was active before opening picker (e.g. "Change region" then Esc)
      if (prevLiveEnabledRef.current) {
        prevLiveEnabledRef.current = false;
        setLiveEnabled(true);
        window.electron.liveSetEnabled(true).catch(() => {});
      }
    });

    // Show a visible warning if diff libraries (pixelmatch/pngjs) are not installed
    if (window.electron.onLiveDepsMissing) {
      window.electron.onLiveDepsMissing(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "assistant",
            content: "⚠️ **Live mod neće raditi** — `pixelmatch` ili `pngjs` nisu instalirani. Pokreni `npm install` u mapi `electron/` i ponovno pokreni aplikaciju.",
            type: "proactive",
          },
        ]);
      });
    }

    return () => {
      window.electron.removeLiveListeners();
    };
  }, []);

  async function toggleLiveMode() {
    if (liveEnabled) {
      // Turn off
      setLiveEnabled(false);
      window.electron.liveSetEnabled(false).catch(console.error);
      return;
    }
    // If region already configured, start live directly without re-picking
    if (liveRegion) {
      window.electron.liveSetEnabled(true)
        .then(() => setLiveEnabled(true))
        .catch(console.error);
      return;
    }
    // No region yet: open picker first
    prevLiveEnabledRef.current = false;
    setAwaitingRegion(true);
    window.electron.liveStartRegionPicker().catch((err) => {
      setAwaitingRegion(false);
      console.error("Region picker error:", err);
    });
  }

  async function changeRegion() {
    const wasEnabled = liveEnabled;
    setAwaitingRegion(true);
    if (liveEnabled) {
      setLiveEnabled(false);
      window.electron.liveSetEnabled(false).catch(() => {});
    }
    // Store previous state so onLiveRegionCancelled can restore it
    prevLiveEnabledRef.current = wasEnabled;
    window.electron.liveStartRegionPicker().catch((err) => {
      setAwaitingRegion(false);
      if (wasEnabled) {
        setLiveEnabled(true);
        window.electron.liveSetEnabled(true).catch(() => {});
      }
      console.error("Region picker error:", err);
    });
  }

  // Keep refs in sync with live state (used in useCallback to avoid stale closures)
  useEffect(() => { liveEnabledRef.current = liveEnabled; }, [liveEnabled]);
  useEffect(() => { sessionContextRef.current = sessionContext; }, [sessionContext]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (overrideInput, overrideScreenshot) => {
    const msgText = overrideInput !== undefined ? overrideInput : input;
    // overrideScreenshot lets callers bypass the stale screenshotDataUrl closure
    const currentScreenshot = overrideScreenshot !== undefined ? overrideScreenshot : screenshotDataUrl;
    if (!msgText.trim() && !currentScreenshot) return;
    if (isStreaming) return;

    // MT warning (non-blocking)
    if (!mtActive) {
      setMtWarning(true);
      setTimeout(() => setMtWarning(false), 4000);
    }
    const userMsg = {
      role: "user",
      content: msgText.trim(),
      screenshotThumb: currentScreenshot || null,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setScreenshotDataUrl(null);
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const settings = await window.electron.getSettings();
      const url = settings.backendUrl;

      const historyForApi = nextMessages
        .slice(-11, -1)
        .map((m) => ({ role: m.role, content: m.content }));

      const body = { message: userMsg.content, history: historyForApi };
      if (currentScreenshot) body.screenshot_base64 = extractBase64(currentScreenshot);
      // Faza C: use refs to avoid stale closure on liveEnabled / sessionContext
      if (liveEnabledRef.current && sessionContextRef.current) {
        body.session_context = sessionContextRef.current;
      }

      const res = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("Nema tijela odgovora");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let lineBuffer = ""; // accumulate partial SSE lines across TCP chunks
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });

        // Process all complete lines (terminated by \n)
        const newlineIdx = lineBuffer.lastIndexOf("\n");
        if (newlineIdx === -1) continue; // no complete line yet

        const complete = lineBuffer.slice(0, newlineIdx + 1);
        lineBuffer = lineBuffer.slice(newlineIdx + 1);

        const lines = complete.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (data.done) { streamDone = true; break; }
            if (data.error) assistantContent += `\n\n⚠️ ${data.error}`;
            else if (data.content) assistantContent += data.content;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: assistantContent };
              return updated;
            });
          } catch { /* ignore malformed */ }
        }
      }

      // TTS: speak if enabled
      if (assistantContent) {
        const s = await window.electron.getSettings();
        if (s.ttsEnabled) {
          setIsSpeaking(true);
          try {
            const ttsText = assistantContent.replace(/```[\s\S]*?```/g, "").trim().slice(0, 500);
            const base64 = await window.electron.ttsSpeak(ttsText, s.ttsVoice || "onyx");
            playTtsBase64(base64);
          } catch { /* TTS is optional, ignore errors */ } finally {
            setIsSpeaking(false);
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `⚠️ Greška: ${err.message}` };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, screenshotDataUrl, messages, isStreaming, mtActive]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleScreenshotCapture() {
    window.electron.captureScreenshot()
      .then((base64) => setScreenshotDataUrl("data:image/jpeg;base64," + base64))
      .catch((err) => alert("Screenshot greška: " + err.message));
  }

  // Suggestion: screenshot + fixed message
  // Pass the screenshot directly to handleSend to avoid stale closure on screenshotDataUrl
  function handleScreenshotCheck() {
    window.electron.captureScreenshot()
      .then((base64) => {
        const dataUrl = "data:image/jpeg;base64," + base64;
        setScreenshotDataUrl(dataUrl);
        handleSend("Pogledaj što se promijenilo na ekranu i komentiraj.", dataUrl);
      })
      .catch((err) => alert("Screenshot greška: " + err.message));
  }

  function handleSuggestion(msg) {
    setInput(msg);
    setTimeout(() => handleSend(msg), 0);
  }

  function handleTextareaChange(e) {
    setInput(e.target.value);
  }

  const lastIdx = messages.length - 1;
  const showSuggestions =
    !isStreaming &&
    messages.length > 0 &&
    messages[lastIdx]?.role === "assistant" &&
    !!messages[lastIdx]?.content;

  return (
    <div className="app">
      {/* Titlebar */}
      <div className="titlebar">
        <div className="titlebar-left">
          <div className="titlebar-logo">MT</div>
          <span className="titlebar-title">Copilot</span>
        </div>
        <div className="titlebar-right">
          <div className="mt-status">
            <div className={`mt-dot ${mtActive ? "active" : "inactive"}`} />
            <span>{mtActive ? "MT aktivan" : "MT nije pokrenut"}</span>
          </div>
          <button
            className={`btn-live${liveEnabled ? " active" : ""}${awaitingRegion ? " awaiting" : ""}`}
            title={
              awaitingRegion ? "Odaberi područje za Live..." :
              liveEnabled ? `● LIVE aktivan (${liveSpentUsd.toFixed(2)}$/${liveBudgetUsd}$) — klik za isključiti` :
              "Uključi Live mod — odabir područja"
            }
            onClick={toggleLiveMode}
          >
            {awaitingRegion ? "↔ Odaberi..." : liveEnabled ? "● LIVE" : "○ Live"}
          </button>
          <button className="btn-icon" title="Postavke" onClick={() => setShowSettings(true)}>⚙</button>
          <button className="btn-icon" title="Minimizirati" onClick={() => window.electron.minimizeWindow()}>─</button>
          <button className="btn-icon close" title="Zatvori" onClick={() => window.electron.closeWindow()}>✕</button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-area" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-logo">MT</div>
            <div className="empty-title">MegaTischler Copilot</div>
            <div className="empty-desc">
              Spreman za pisanje parametarskih formula.<br />
              Postavi pitanje, pritisni F9 za ekran, ili F8 za glas.
            </div>
            <div className="empty-hints">
              <div className="empty-hints-label">// primjeri upita</div>
              <div className="empty-hint">"Zašto mi polica ne prati D?"</div>
              <div className="empty-hint">"Formula za širinu vrata s luftom"</div>
              <div className="empty-hint">"Objasni [.D]-[.GLU]-20"</div>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.role === "user";
            const isProactive = msg.type === "proactive";
            const isKbSuggest = msg.type === "kb-suggest";
            const isLast = i === lastIdx;
            // Use stable ID when available (proactive/kb-suggest), fall back to index
            const msgKey = msg.id ?? i;

            if (isProactive || isKbSuggest) {
              return (
                <div key={msgKey} className="msg-row assistant">
                  <div className="msg-label proactive-label">
                    <div className="msg-label-icon proactive-icon">{isKbSuggest ? "📚" : "👁"}</div>
                    {isKbSuggest ? "Prijedlog za bazu" : "Copilot primjetio"}
                  </div>
                  <div className={`msg-bubble proactive${isKbSuggest ? " kb-suggest" : ""}`}>
                    <MarkdownMessage content={msg.content} />
                    {isKbSuggest && msg.context && (
                      <div className="proactive-actions">
                        <button
                          className="btn-save-kb"
                          title="Spremi u bazu znanja"
                          onClick={async () => {
                            const ctx = msg.context;
                            const data = {
                              formulas: (ctx.formulasSeen || []).map(f => ({ formula: f })),
                              parameters: (ctx.parametersSeen || []).map(p => ({
                                name: p.name,
                                description: `vrijednost: ${p.value}`,
                              })),
                              observations: ctx.summary ? [{ text: ctx.summary }] : [],
                            };
                            try {
                              const result = await window.electron.kbLearn(data);
                              if (result.error) throw new Error(result.error);
                              setMessages((prev) => prev.filter((m, j) => msg.id ? m.id !== msg.id : j !== i));
                              setMessages((prev) => [...prev, {
                                id: Date.now(),
                                role: "assistant",
                                content: `✓ Spremljeno u bazu znanja (${result.added} novih zapisa).`,
                                type: "proactive",
                              }]);
                            } catch (err) {
                              alert("Greška pri spremanju: " + err.message);
                            }
                          }}
                        >
                          📚 Spremi u bazu
                        </button>
                      </div>
                    )}
                    <button
                      className="proactive-dismiss"
                      title="Zatvori"
                      onClick={() => setMessages((prev) => prev.filter((m, j) => msg.id ? m.id !== msg.id : j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={msgKey} className={`msg-row ${isUser ? "user" : "assistant"}`}>
                {!isUser && (
                  <div className="msg-label">
                    <div className="msg-label-icon">MT</div>
                    Copilot
                  </div>
                )}
                <div className={`msg-bubble ${isUser ? "user" : "assistant"}`}>
                  {isUser && msg.screenshotThumb && (
                    <div className="msg-screenshot">
                      <img src={msg.screenshotThumb} alt="Screenshot" />
                      <div className="msg-screenshot-label">📷 priložen screenshot</div>
                    </div>
                  )}
                  {isUser ? (
                    msg.content && <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                  ) : (
                    msg.content ? (
                      <MarkdownMessage content={msg.content} />
                    ) : (
                      <div className="thinking">
                        <div className="spinner" />
                        Razmišlja...
                      </div>
                    )
                  )}
                </div>
                {/* Suggestion buttons after last AI message */}
                {!isUser && isLast && showSuggestions && (
                  <SuggestionButtons
                    onSelect={handleSuggestion}
                    onScreenshotCheck={handleScreenshotCheck}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Faza E: Module hint banner */}
      {liveEnabled && sessionContext?.moduleHint && (
        <div className="module-hint-banner">
          <span>📄 Aktivan modul: <strong>{sessionContext.moduleHint}</strong></span>
          <button
            className="btn-load-mac"
            title={`Učitaj ${sessionContext.moduleHint} u bazu znanja`}
            onClick={async () => {
              const hint = sessionContext.moduleHint;
              try {
                const settings = await window.electron.getSettings();
                const res = await fetch(`${settings.backendUrl}/api/knowledge/reparse-one`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ filename: hint }),
                });
                let data;
                try { data = await res.json(); } catch { data = {}; }

                let content;
                if (res.status === 404 || (data && !data.success && data.error?.includes("nije pronađen"))) {
                  content = `ℹ Modul ${hint} nije pronađen u source_macs/. Uploadaj datoteku u Postavkama → Baza znanja.`;
                } else if (!res.ok || !data.success) {
                  content = `⚠ Greška pri učitavanju ${hint}: ${data.error || `HTTP ${res.status}`}`;
                } else {
                  content = `✓ Modul ${hint} je re-parsiran i spojen s bazom znanja.`;
                }
                setMessages((prev) => [...prev, { role: "assistant", content, type: "proactive" }]);
              } catch (err) {
                setMessages((prev) => [...prev, {
                  role: "assistant",
                  content: `⚠ Greška pri učitavanju ${hint}: ${err.message}`,
                  type: "proactive",
                }]);
              }
            }}
          >
            Učitaj u bazu
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="input-area">
        <div
          className="input-resize-handle"
          onMouseDown={startInputResize}
          title="Povuci za promjenu visine polja za unos"
        />

        {/* MT warning */}
        {mtWarning && (
          <div className="mt-warning">
            ⚠ MegaTischler nije pokrenut — odgovor može biti bez konteksta prozora
          </div>
        )}

        {/* Recording banner */}
        {(isRecording || isTranscribing) && (
          <div className="recording-banner">
            {isRecording ? (
              <>
                <span className="rec-dot" />
                <span>Snimam... {formatDuration(recordingSecs)}</span>
                <button className="rec-stop-btn" onClick={stopRecording}>■ Stop (F8)</button>
              </>
            ) : (
              <>
                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                <span>Transkribiranje...</span>
              </>
            )}
          </div>
        )}

        {/* TTS speaking banner */}
        {isSpeaking && (
          <div className="recording-banner" style={{ background: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.4)" }}>
            <span style={{ fontSize: 14 }}>🔊</span>
            <span>Reproducira odgovor...</span>
            <button className="rec-stop-btn" onClick={() => { stopTts(); setIsSpeaking(false); }}>■ Stop</button>
          </div>
        )}

        {/* Screenshot preview */}
        {screenshotDataUrl && (
          <div className="screenshot-preview">
            <img src={screenshotDataUrl} alt="Preview" />
            <div className="screenshot-preview-info">
              <div className="screenshot-preview-title">Screenshot priložen</div>
              <div className="screenshot-preview-sub">Bit će poslan uz poruku</div>
            </div>
            <button className="remove-screenshot" onClick={() => setScreenshotDataUrl(null)} title="Ukloni">✕</button>
          </div>
        )}

        <div className="input-row">
          {/* Screenshot button */}
          <button
            className={`input-btn${screenshotDataUrl ? " active" : ""}`}
            onClick={handleScreenshotCapture}
            disabled={isStreaming}
            title="Snimi ekran (F9)"
          >
            📷
          </button>

          {/* Voice button */}
          <button
            className={`input-btn${isRecording ? " recording" : ""}${isTranscribing ? " active" : ""}`}
            onClick={() => toggleRecordingRef.current?.()}
            disabled={isStreaming || isTranscribing}
            title={isRecording ? "Zaustavi snimanje (F8)" : "Glasovni unos (F8)"}
          >
            {isRecording ? "🔴" : "🎤"}
          </button>

          <textarea
            ref={textareaRef}
            className="chat-input"
            style={{ height: inputHeight }}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Snimam glas..." : isTranscribing ? "Transkribiranje..." : "Upiši pitanje... (Enter za slanje)"}
            disabled={isStreaming || isRecording}
          />

          <button
            className="send-btn"
            onClick={() => handleSend()}
            disabled={(!input.trim() && !screenshotDataUrl) || isStreaming}
            title="Pošalji"
          >
            {isStreaming ? (
              <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Šalje...</>
            ) : (
              <>▶ Pošalji</>
            )}
          </button>
        </div>

        <div className="input-hint">F9 ekran · F8 glas · Enter šalje · Shift+Enter novi red · povuci gornji rub za veći unos{isSpeaking ? " · reproducira..." : ""}</div>
      </div>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          liveSpentUsd={liveSpentUsd}
          liveBudgetUsd={liveBudgetUsd}
          liveCallCount={liveCallCount}
          liveRegion={liveRegion}
          setLiveRegion={setLiveRegion}
          setLiveEnabled={setLiveEnabled}
          setLiveSpentUsd={setLiveSpentUsd}
          setLiveCallCount={setLiveCallCount}
          setLiveBudgetUsd={setLiveBudgetUsd}
          onChangeRegion={changeRegion}
        />
      )}
    </div>
  );
}

// ── Mount ──────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
