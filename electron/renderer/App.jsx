/* global React, ReactDOM */
const { useState, useRef, useEffect, useCallback } = React;

// ── Utilities ──────────────────────────────────────────────────────────────
function extractBase64(dataUrl) {
  const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : dataUrl;
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

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
function SettingsPanel({ onClose }) {
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
  // Live mode cost control
  const [liveCallCount, setLiveCallCount] = useState(0);
  const [liveCost, setLiveCost] = useState(0);
  const [liveLimit, setLiveLimit] = useState(200);
  const [liveLimitInput, setLiveLimitInput] = useState("200");

  useEffect(() => {
    window.electron.getSettings().then((s) => {
      setBackendUrl(s.backendUrl || "");
      setOpenaiKey(s.openaiKey || "");
      setMicDeviceId(s.micDeviceId || "");
      setTtsEnabled(s.ttsEnabled || false);
      setTtsVoice(s.ttsVoice || "onyx");
    });
    window.electron.fetchKnowledgeStats().then((data) => {
      if (!data.error) setStats(data);
    });
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setMics(devices.filter((d) => d.kind === "audioinput"));
    }).catch(() => {});
    window.electron.liveGetStatus().then((s) => {
      setLiveCallCount(s.callCount);
      setLiveCost(s.cost);
      const lim = s.dailyLimit ?? s.limit ?? 200;
      setLiveLimit(lim);
      setLiveLimitInput(String(lim));
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

        {/* Live mode cost control */}
        <div className="settings-section">
          <div className="settings-label">Live mod — kontrola troškova</div>
          <div className="live-cost-row">
            <div className="live-cost-stat">
              <span className="live-cost-num">{liveCallCount}</span>
              <span className="live-cost-desc">poziva danas</span>
            </div>
            <div className="live-cost-stat">
              <span className="live-cost-num">${liveCost.toFixed(3)}</span>
              <span className="live-cost-desc">procijenjen trošak</span>
            </div>
          </div>
          {liveCallCount / liveLimit > 0.8 && (
            <div className="live-cost-warning">
              ⚠ Potrošeno je {Math.round((liveCallCount / liveLimit) * 100)}% dnevnog limita
            </div>
          )}
          <div className="settings-label" style={{ marginTop: 8 }}>Dnevni limit poziva</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
            <input
              className="settings-input"
              type="number"
              min="10"
              max="1000"
              value={liveLimitInput}
              onChange={(e) => setLiveLimitInput(e.target.value)}
              style={{ width: 80 }}
            />
            <button
              className="btn-save"
              style={{ flex: 1, background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)" }}
              onClick={() => {
                const n = parseInt(liveLimitInput, 10);
                if (n > 0) {
                  setLiveLimit(n);
                  window.electron.liveSetLimit(n).catch(() => {});
                }
              }}
            >
              Postavi
            </button>
            <button
              className="btn-save"
              style={{ flex: 1, background: "var(--bg3)", color: "var(--text3)", border: "1px solid var(--border)" }}
              onClick={() => {
                setLiveCallCount(0);
                setLiveCost(0);
                window.electron.liveResetCount().catch(() => {});
              }}
            >
              Resetiraj brojač
            </button>
          </div>
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
  const [liveCost, setLiveCost] = useState(0);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
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
              setTimeout(() => autoResizeTextarea(textareaRef.current), 0);
            }
          } catch (err) {
            console.error("Transcription error:", err);
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
      setLiveCallCount(s.callCount);
      setLiveCost(s.cost ?? 0);
    }).catch(() => {});

    return () => {
      window.electron.removeScreenshotListeners();
      window.electron.removeMtStatusListeners();
      window.electron.removeRecordingListeners();
      stopRecording();
    };
  }, []);

  // Live mode IPC listeners
  useEffect(() => {
    window.electron.onLiveMessage((data) => {
      setLiveCallCount(data.callCount);
      setLiveCost(data.cost);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message, type: "proactive" },
      ]);
    });
    window.electron.onLiveLimitReached((data) => {
      setLiveEnabled(false);
      setLiveCallCount(data.count);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Live mod automatski isključen — dostignut dnevni limit od ${data.limit} poziva.`,
          type: "proactive",
        },
      ]);
    });
    return () => {
      window.electron.removeLiveListeners();
    };
  }, []);

  async function toggleLiveMode() {
    const next = !liveEnabled;
    setLiveEnabled(next);
    try {
      await window.electron.liveSetEnabled(next);
    } catch (err) {
      setLiveEnabled(!next); // revert on error
      console.error("Live mode toggle error:", err);
    }
  }

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
    autoResizeTextarea(e.target);
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
            className={`btn-live${liveEnabled ? " active" : ""}`}
            title={liveEnabled ? "Isključi live mod" : "Uključi live mod (proaktivni asistent)"}
            onClick={toggleLiveMode}
          >
            {liveEnabled ? "● LIVE" : "○ Live"}
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
            const isLast = i === lastIdx;

            if (isProactive) {
              return (
                <div key={i} className="msg-row assistant">
                  <div className="msg-label proactive-label">
                    <div className="msg-label-icon proactive-icon">👁</div>
                    Copilot primjetio
                  </div>
                  <div className="msg-bubble proactive">
                    <MarkdownMessage content={msg.content} />
                    <button
                      className="proactive-dismiss"
                      title="Zatvori"
                      onClick={() => setMessages((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className={`msg-row ${isUser ? "user" : "assistant"}`}>
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

      {/* Input area */}
      <div className="input-area">
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
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Snimam glas..." : isTranscribing ? "Transkribiranje..." : "Upiši pitanje... (Enter za slanje)"}
            disabled={isStreaming || isRecording}
            rows={1}
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

        <div className="input-hint">F9 ekran · F8 glas · Enter šalje · Shift+Enter novi red{isSpeaking ? " · 🔊 reproducira..." : ""}</div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ── Mount ──────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
