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
function CodeBlock({ code, lang, compact = false }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`code-block${compact ? " compact" : ""}`}>
      {!compact && (
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
      )}
      <div className="code-body">
        <pre>{code}</pre>
        {compact && (
          <button
            className={`copy-btn inline-copy${copied ? " copied" : ""}`}
            onClick={handleCopy}
            title="Kopiraj"
          >
            {copied ? "✓" : "⎘ Kopiraj"}
          </button>
        )}
      </div>
    </div>
  );
}

function WorklistFormulaInline({ formula }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(formula).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="worklist-formula-row">
      <span className="worklist-label">Formula:</span>
      <code className="worklist-formula-text">{formula}</code>
      <button
        type="button"
        className={`worklist-copy-btn${copied ? " copied" : ""}`}
        onClick={handleCopy}
        title="Kopiraj formulu"
      >
        {copied ? "✓ Kopirano" : "Kopiraj"}
      </button>
    </div>
  );
}

// ── WorklistCard ──────────────────────────────────────────────────────────────

/**
 * Parse a ```worklist ... ``` fenced block from an AI message.
 * Returns the parsed steps array or null if no valid block found.
 */
function extractWorklist(content) {
  const m = content.match(/```worklist\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed.steps) && parsed.steps.length > 0) return parsed.steps;
  } catch { /* fallback to normal markdown */ }
  return null;
}

/**
 * Strip the ```worklist ... ``` block from a content string so the rest
 * (intro text) can still be shown above the card.
 */
function stripWorklist(content) {
  return content.replace(/```worklist[\s\S]*?```/g, "").trim();
}

function WorklistCard({ steps }) {
  const [done, setDone] = React.useState(() => new Array(steps.length).fill(false));

  function toggleDone(i) {
    setDone((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  }

  return (
    <div className="worklist-card">
      <div className="worklist-card-header">
        <span className="worklist-card-title">Radni list</span>
        <span className="worklist-card-count">{steps.length} korak{steps.length === 1 ? "" : "a"}</span>
      </div>
      <div className="worklist-steps">
        {steps.map((step, i) => {
          const formula = step.formula?.trim();
          const useCompactFormula = formula && !formula.includes("\n") && formula.length <= 72;
          return (
            <div key={i} className={`worklist-step${done[i] ? " worklist-step-done" : ""}`}>
              <div className="worklist-step-row">
                <button
                  type="button"
                  className="worklist-checkbox"
                  title={done[i] ? "Označi kao nedovršeno" : "Označi kao gotovo"}
                  onClick={() => toggleDone(i)}
                  aria-pressed={done[i]}
                >
                  {done[i] ? "✓" : String(i + 1)}
                </button>
                <div className="worklist-step-body">
                  <div className="worklist-step-title">{step.title}</div>
                  {step.where && (
                    <div className="worklist-step-meta">
                      <span className="worklist-label">Gdje</span>
                      <span className="worklist-meta-text">{step.where}</span>
                    </div>
                  )}
                  {step.hint && (
                    <div className="worklist-step-meta worklist-step-why">
                      <span className="worklist-label">Zašto</span>
                      <span className="worklist-meta-text">{step.hint}</span>
                    </div>
                  )}
                  {formula && (
                    useCompactFormula
                      ? <WorklistFormulaInline formula={formula} />
                      : <CodeBlock code={formula} lang="formula" compact />
                  )}
                </div>
              </div>
            </div>
          );
        })}
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
  let tableRows = [];

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

  const flushTable = () => {
    if (!tableRows.length) return;
    const isSep = r => /^\|[\s\-:|]+\|$/.test(r);
    const parseRow = r => r.slice(1, -1).split("|").map(c => c.trim());
    const hasHeader = tableRows.length >= 2 && isSep(tableRows[1]);
    const headerRow = hasHeader ? tableRows[0] : null;
    const dataRows = (hasHeader ? tableRows.slice(2) : tableRows).filter(r => !isSep(r));
    elements.push(
      <table key={`tbl-${elements.length}`} className="md-table">
        {headerRow && (
          <thead>
            <tr>{parseRow(headerRow).map((cell, ci) => <th key={ci}>{renderInline(cell)}</th>)}</tr>
          </thead>
        )}
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri}>{parseRow(row).map((cell, ci) => <td key={ci}>{renderInline(cell)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    );
    tableRows = [];
  };

  const flushAll = () => { flushUL(); flushOL(); flushPara(); flushTable(); };

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
    // Markdown table row: starts and ends with |
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      flushUL(); flushOL(); flushPara();
      tableRows.push(line.trim());
      continue;
    }
    if (tableRows.length) { flushTable(); }
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

// ── Plan mode: parse and render structured plan + A/B/C/D questions ─────────
function parsePlanContent(content) {
  if (!content.includes("**PLAN:**")) return null;
  const planIdx = content.indexOf("**PLAN:**");
  const qIdx = content.indexOf("**PITANJA:**");
  const preText = content.slice(0, planIdx).trim();
  const planText = (qIdx > -1
    ? content.slice(planIdx + 8, qIdx)
    : content.slice(planIdx + 8)
  ).trim();
  const questionText = qIdx > -1 ? content.slice(qIdx + 12).trim() : "";
  const questionBlocks = [];
  if (questionText) {
    let curQ = "";
    let curOpts = [];
    for (const line of questionText.split("\n")) {
      const qm = line.match(/^\d+[.)]\s+(.+)$/);
      const om = line.match(/^\s*([A-D])\)\s+(.+)$/);
      if (qm) {
        if (curQ) questionBlocks.push({ question: curQ, options: curOpts });
        curQ = qm[1]; curOpts = [];
      } else if (om && curQ) {
        curOpts.push({ letter: om[1], text: om[2] });
      }
    }
    if (curQ) questionBlocks.push({ question: curQ, options: curOpts });
  }
  return { preText, planText, questionBlocks };
}

function PlanResponseCard({ plan, onAnswer }) {
  const [selected, setSelected] = React.useState({});
  const [freeText, setFreeText] = React.useState({});
  return (
    <div>
      {plan.preText ? <MarkdownMessage content={plan.preText} /> : null}
      <div className="plan-section">
        <div className="plan-section-label">📋 Plan</div>
        <MarkdownMessage content={plan.planText} />
      </div>
      {plan.questionBlocks.length > 0 && (
        <div className="plan-questions">
          <div className="plan-questions-label">❓ Pitanja</div>
          {plan.questionBlocks.map((block, qi) => (
            <div key={qi} className="plan-question-block">
              <div className="plan-question-text">{qi + 1}. {block.question}</div>
              <div className="plan-choices">
                {block.options.map((opt) => (
                  <button
                    key={opt.letter}
                    className={`plan-choice-btn${selected[qi] === opt.letter ? " selected" : selected[qi] ? " dimmed" : ""}`}
                    disabled={!!selected[qi]}
                    onClick={() => {
                      if (selected[qi]) return;
                      setSelected(prev => ({ ...prev, [qi]: opt.letter }));
                      onAnswer(`${block.question}\n→ ${opt.letter}) ${opt.text}`);
                    }}
                  >
                    <span className="plan-choice-letter">{opt.letter})</span> {opt.text}
                  </button>
                ))}
                <div className={`plan-free-text-row${selected[qi] ? " dimmed" : ""}`}>
                  <span className="plan-choice-letter">D)</span>
                  <input
                    className="plan-free-input"
                    placeholder="Slobodan odgovor…"
                    value={freeText[qi] ?? ""}
                    disabled={!!selected[qi]}
                    onChange={e => setFreeText(prev => ({ ...prev, [qi]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === "Enter" && (freeText[qi] ?? "").trim() && !selected[qi]) {
                        e.preventDefault();
                        const txt = freeText[qi].trim();
                        setSelected(prev => ({ ...prev, [qi]: "D" }));
                        onAnswer(`${block.question}\n→ D) ${txt}`);
                      }
                    }}
                  />
                  <button
                    className="plan-free-send"
                    disabled={!!selected[qi] || !(freeText[qi] ?? "").trim()}
                    onClick={() => {
                      const txt = (freeText[qi] ?? "").trim();
                      if (!txt || selected[qi]) return;
                      setSelected(prev => ({ ...prev, [qi]: "D" }));
                      onAnswer(`${block.question}\n→ D) ${txt}`);
                    }}
                  >↵</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Slash command palette ───────────────────────────────────────────────────
const SLASH_COMMANDS = [
  { cmd: "/sumiraj-znanje", desc: "Analiziraj razgovor i izvuci naučena pravila parametrizacije", icon: "🧾" },
  { cmd: "/nauči",  desc: "Nauči AI pravilo parametrizacije MegaTischlera", icon: "🧠" },
  { cmd: "/stolar", desc: "Nauči AI stolarski pojam i definiciju", icon: "📚" },
  { cmd: "/debug",  desc: "Otvori debug panel — snimi ekrane za analizu", icon: "🛠" },
  { cmd: "/istraži", desc: "Pretraži Bridge bazu datoteka", icon: "🗄" },
];

function SlashCommandPalette({ input, onSelect }) {
  const lower = input.toLowerCase();
  const filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(lower));
  if (filtered.length === 0) return null;
  return (
    <div className="slash-palette">
      {filtered.map(c => (
        <button
          key={c.cmd}
          className="slash-palette-item"
          onMouseDown={e => { e.preventDefault(); onSelect(c.cmd); }}
        >
          <span className="slash-palette-icon">{c.icon}</span>
          <span className="slash-palette-cmd">{c.cmd}</span>
          <span className="slash-palette-desc">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}

// ── Stolar inline form ──────────────────────────────────────────────────────
function StolarInlineForm({ onSubmit, onCancel, loading }) {
  const [pojam, setPojam] = React.useState("");
  const [definicija, setDefinicija] = React.useState("");
  const pojamRef = React.useRef(null);

  React.useEffect(() => { pojamRef.current?.focus(); }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (!pojam.trim()) return;
    onSubmit(pojam.trim(), definicija.trim());
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  }

  return (
    <form className="stolar-inline-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      <div className="stolar-inline-header">📚 Nauči novi pojam</div>
      <input
        ref={pojamRef}
        className="stolar-inline-input"
        placeholder="Pojam (npr. radijus, reglet, štoklajsna…)"
        value={pojam}
        onChange={e => setPojam(e.target.value)}
        disabled={loading}
      />
      <textarea
        className="stolar-inline-textarea"
        placeholder="Definicija — što taj pojam znači u stolariji (nije obavezno)"
        value={definicija}
        onChange={e => setDefinicija(e.target.value)}
        disabled={loading}
        rows={2}
      />
      <div className="stolar-inline-actions">
        <button type="submit" className="stolar-inline-save" disabled={!pojam.trim() || loading}>
          {loading ? "Učim…" : "💾 Spremi"}
        </button>
        <button type="button" className="stolar-inline-cancel" onClick={onCancel} disabled={loading}>
          Odustani
        </button>
      </div>
    </form>
  );
}

// ── Nauči inline form (2-step: enter rule → AI asks → save) ────────────────
function NauciInlineForm({ onAsk, onSave, onCancel, loading, step, pitanja }) {
  const [sadržaj, setSadržaj] = React.useState("");
  const [odgovori, setOdgovori] = React.useState([]);
  const textareaRef = React.useRef(null);

  React.useEffect(() => { textareaRef.current?.focus(); }, []);
  React.useEffect(() => {
    if (step === 2 && pitanja?.length > 0) {
      setOdgovori(pitanja.map(() => ""));
    }
  }, [step, pitanja]);

  function handleKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  }

  function handleAsk(e) {
    e.preventDefault();
    if (!sadržaj.trim() || loading) return;
    onAsk(sadržaj.trim());
  }

  function handleSave(e) {
    e.preventDefault();
    if (loading) return;
    const pitanjaData = (pitanja ?? []).map((p, i) => ({
      pitanje: p,
      odgovor: odgovori[i] ?? "",
    }));
    onSave(sadržaj, pitanjaData);
  }

  return (
    <form className="nauci-inline-form" onKeyDown={handleKeyDown} onSubmit={e => e.preventDefault()}>
      <div className="nauci-inline-header">🧠 Nauči pravilo parametrizacije</div>

      {step === 1 && (
        <>
          <div className="nauci-inline-step">Korak 1/2 — Unesi pravilo ili obrazac koji znaš</div>
          <textarea
            ref={textareaRef}
            className="nauci-inline-textarea"
            placeholder={"Npr. 'U kutnom modulu uvijek oduzmi 3mm od P_SIRINA zbog šarke na strani' ili 'Parametar POSV u VISECI dijalogu je uvijek vanjska mjera, ne unutarnja'"}
            value={sadržaj}
            onChange={e => setSadržaj(e.target.value)}
            disabled={loading}
            rows={3}
          />
          <div className="nauci-inline-actions">
            <button type="button" className="nauci-inline-ask" onClick={handleAsk} disabled={!sadržaj.trim() || loading}>
              {loading ? <><div className="spinner" style={{width:10,height:10,borderWidth:2}} /> Pitam AI…</> : "Pitaj AI →"}
            </button>
            <button type="button" className="nauci-inline-cancel" onClick={onCancel} disabled={loading}>Odustani</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="nauci-inline-step">Korak 2/2 — Odgovori na pitanja (možeš preskočiti)</div>
          <div className="nauci-questions-list">
            {(pitanja ?? []).map((p, i) => (
              <div key={i} className="nauci-question-item">
                <label className="nauci-question-label">{i + 1}. {p}</label>
                <input
                  className="nauci-question-input"
                  placeholder="Odgovor (nije obavezno)…"
                  value={odgovori[i] ?? ""}
                  onChange={e => setOdgovori(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                  disabled={loading}
                />
              </div>
            ))}
          </div>
          <div className="nauci-inline-actions">
            <button type="button" className="nauci-inline-save" onClick={handleSave} disabled={loading}>
              {loading ? <><div className="spinner" style={{width:10,height:10,borderWidth:2}} /> Zaključujem…</> : "💾 Zaključi i spremi"}
            </button>
            <button type="button" className="nauci-inline-cancel" onClick={onCancel} disabled={loading}>Odustani</button>
          </div>
        </>
      )}
    </form>
  );
}


// ── Sumiraj panel — konsolidacija znanja iz razgovora ──────────────────────
function SumirajPanel({ stavke, onSave, onCancel, loading }) {
  const [statuses, setStatuses] = React.useState(() => (stavke ?? []).map(() => "pending"));
  const [korekcije, setKorekcije] = React.useState(() => (stavke ?? []).map(() => ""));
  const [odgovori, setOdgovori] = React.useState(() => (stavke ?? []).map(() => ""));
  const [editingIdx, setEditingIdx] = React.useState(null);

  // Sync arrays whenever stavke prop changes (panel opens before async load completes)
  React.useEffect(() => {
    setStatuses((stavke ?? []).map(() => "pending"));
    setKorekcije((stavke ?? []).map(() => ""));
    setOdgovori((stavke ?? []).map(() => ""));
    setEditingIdx(null);
  }, [stavke]);

  const confirmedCount = statuses.filter(s => s === "confirmed").length;

  function handleSave() {
    const potvrdjene = (stavke ?? [])
      .map((s, i) => ({ ...s, korekcija: korekcije[i]?.trim() || null, odgovor: odgovori[i]?.trim() || undefined }))
      .filter((_, i) => statuses[i] === "confirmed");
    onSave(potvrdjene);
  }

  // Show spinner while loading and no items yet
  if (loading && (!stavke || stavke.length === 0)) {
    return (
      <div className="sumiraj-panel">
        <div className="sumiraj-header">🧾 Konsolidacija znanja iz razgovora</div>
        <div className="nauci-loading-row">
          <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          {" "}Analiziram razgovor…
        </div>
      </div>
    );
  }

  return (
    <div className="sumiraj-panel">
      <div className="sumiraj-header">🧾 Konsolidacija znanja iz razgovora</div>
      <div className="sumiraj-subheader">Potvrdi pravila koja su točna, preskoči ili ispravi netočna.</div>
      {!stavke || stavke.length === 0 ? (
        <div className="sumiraj-empty">Nisam pronašao konkretna pravila parametrizacije u ovom razgovoru.</div>
      ) : (
        <div className="sumiraj-stavke">
          {stavke.map((s, i) => (
            <div key={s.id || i} className={`sumiraj-stavka${statuses[i] === "confirmed" ? " confirmed" : statuses[i] === "skipped" ? " skipped" : ""}`}>
              <div className="sumiraj-stavka-pravilo">{s.pravilo}</div>
              {s.obrazloženje && <div className="sumiraj-stavka-obrazlozenje">{s.obrazloženje}</div>}
              {s.moduli?.length > 0 && (
                <div className="sumiraj-stavka-moduli">{s.moduli.join(", ")}</div>
              )}
              {statuses[i] === "pending" && (
                <div className="sumiraj-stavka-actions">
                  <button
                    className="sumiraj-potvrdi"
                    disabled={loading}
                    onClick={() => setStatuses(prev => { const n = [...prev]; n[i] = "confirmed"; return n; })}
                  >✓ Potvrdi</button>
                  <button
                    className="sumiraj-preskoči"
                    disabled={loading}
                    onClick={() => setStatuses(prev => { const n = [...prev]; n[i] = "skipped"; return n; })}
                  >✗ Preskoči</button>
                  <button
                    className="sumiraj-ispravi"
                    disabled={loading}
                    onClick={() => setEditingIdx(editingIdx === i ? null : i)}
                  >{editingIdx === i ? "▲ Sakrij" : "✏ Ispravi"}</button>
                </div>
              )}
              {statuses[i] === "confirmed" && (
                <div className="sumiraj-stavka-status confirmed">✓ Potvrđeno
                  <button className="sumiraj-undo" onClick={() => setStatuses(prev => { const n=[...prev]; n[i]="pending"; return n; })}>poništi</button>
                </div>
              )}
              {statuses[i] === "skipped" && (
                <div className="sumiraj-stavka-status skipped">✗ Preskočeno
                  <button className="sumiraj-undo" onClick={() => setStatuses(prev => { const n=[...prev]; n[i]="pending"; return n; })}>poništi</button>
                </div>
              )}
              {editingIdx === i && statuses[i] === "pending" && (
                <textarea
                  className="sumiraj-korekcija"
                  placeholder="Ispravi ili dopuni pravilo (opcionalno — ako ostaviš prazno, koristi se original)…"
                  value={korekcije[i]}
                  onChange={e => setKorekcije(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                  disabled={loading}
                  rows={2}
                />
              )}
              {s.pitanje && statuses[i] !== "skipped" && (
                <div className="sumiraj-followup">
                  <div className="sumiraj-followup-q">💬 {s.pitanje}</div>
                  <textarea
                    className="sumiraj-korekcija"
                    placeholder="Tvoj odgovor (opcionalno)…"
                    value={odgovori[i]}
                    onChange={e => setOdgovori(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                    disabled={loading}
                    rows={2}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="sumiraj-footer">
        <button
          className="sumiraj-spremi"
          disabled={loading || confirmedCount === 0}
          onClick={handleSave}
        >
          {loading
            ? <><div className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> Sprema…</>
            : `💾 Spremi ${confirmedCount} potvrđen${confirmedCount === 1 ? "o" : "ih"} pravil${confirmedCount === 1 ? "o" : "a"}`}
        </button>
        <button className="sumiraj-cancel" onClick={onCancel} disabled={loading}>Odustani</button>
      </div>
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

// ── BridgePage ─────────────────────────────────────────────────────────────
function BridgePage({ onClose, mtInstallPath, setMtInstallPath, mtManifest, setMtManifest, initialQuery }) {
  const [bridgeMsgs, setBridgeMsgs] = React.useState([]);
  const [bridgeInput, setBridgeInput] = React.useState(initialQuery || "");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [backendUrl, setBackendUrl] = React.useState("https://tischler1.replit.app");
  const [findings, setFindings] = React.useState({});
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isScanning, setIsScanning] = React.useState(false);
  const [bridgeImage, setBridgeImage] = React.useState(null); // {dataUrl, base64, mediaType, name}
  const imgInputRef = React.useRef(null);
  const textQueueRef = React.useRef(""); // typewriter: pending chars not yet rendered
  const displayedRef = React.useRef(""); // typewriter: chars already rendered
  const rafIdRef = React.useRef(null);   // typewriter: requestAnimationFrame id
  const scrollRef = React.useRef(null);
  const msgCounter = React.useRef(0);
  const findingsRef = React.useRef({});
  const manifestRef = React.useRef(mtManifest);

  function nextId() { return ++msgCounter.current; }

  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      const mediaType = file.type || "image/jpeg";
      setBridgeImage({ dataUrl, base64, mediaType, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  React.useEffect(() => { manifestRef.current = mtManifest; }, [mtManifest]);
  React.useEffect(() => { findingsRef.current = findings; }, [findings]);

  React.useEffect(() => {
    window.electron.getSettings().then(async (s) => {
      const url = s.backendUrl || "https://tischler1.replit.app";
      setBackendUrl(url);
      let manifest = mtManifest;
      if (!manifest && (mtInstallPath || s.mtInstallPath)) {
        const p = (mtInstallPath || s.mtInstallPath || "").trim();
        if (p) {
          setIsScanning(true);
          const result = await window.electron.mtBridgeScan(p);
          setIsScanning(false);
          if (result.ok) { setMtManifest(result.manifest); manifest = result.manifest; }
        }
      }
      streamAgentMsg(null, url, manifest || [], {});
    });
  }, []);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [bridgeMsgs]);

  async function streamAgentMsg(userMsg, url, manifest, currentFindings, imageData = null) {
    const placeholderId = nextId();
    setIsStreaming(true);

    // Reset typewriter state
    if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    textQueueRef.current = "";
    displayedRef.current = "";

    if (userMsg || imageData) {
      setBridgeMsgs(prev => [...prev, {
        id: nextId(),
        role: "user",
        content: userMsg || "",
        imageDataUrl: imageData?.dataUrl || null,
      }]);
    }
    setBridgeMsgs(prev => [...prev, { id: placeholderId, role: "assistant", content: "", isLoading: true }]);

    // Typewriter RAF loop: drain ~45 chars per animation frame
    function startTypewriter() {
      if (rafIdRef.current) return;
      function tick() {
        const queue = textQueueRef.current;
        if (!queue) { rafIdRef.current = null; return; }
        const chunk = queue.slice(0, 45);
        textQueueRef.current = queue.slice(45);
        displayedRef.current += chunk;
        const displayed = displayedRef.current;
        setBridgeMsgs(prev => prev.map(m => m.id === placeholderId
          ? { ...m, content: displayed, isLoading: false } : m));
        rafIdRef.current = requestAnimationFrame(tick);
      }
      rafIdRef.current = requestAnimationFrame(tick);
    }

    try {
      const convHistory = bridgeMsgs
        .filter(m => !m.isLoading && !m.isProgress && m.content)
        .map(m => ({ role: m.role, content: m.content }));
      if (userMsg) convHistory.push({ role: "user", content: userMsg });

      const fetchBody = {
        messages: convHistory,
        manifest: manifest || [],
        findings: currentFindings || {},
        isGreeting: !userMsg && !imageData,
      };
      if (imageData) {
        fetchBody.imageBase64 = imageData.base64;
        fetchBody.imageMediaType = imageData.mediaType;
      }

      const res = await fetch(`${url}/api/bridge/agent-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fetchBody),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.delta) {
              accumulated += parsed.delta;
              textQueueRef.current += parsed.delta;
              startTypewriter();
            }
          } catch { /* ignore */ }
        }
      }

      // Flush: cancel RAF and show final content immediately
      if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
      textQueueRef.current = "";
      displayedRef.current = "";

      const suggestMatch = accumulated.match(/<suggest_files>([\s\S]*?)<\/suggest_files>/);
      if (suggestMatch) {
        try {
          const suggestedFiles = JSON.parse(suggestMatch[1]);
          const cleanContent = accumulated.replace(/<suggest_files>[\s\S]*?<\/suggest_files>/, "").trim();
          setBridgeMsgs(prev => prev.map(m => m.id === placeholderId
            ? { ...m, content: cleanContent, suggestedFiles, isLoading: false } : m));
        } catch {
          setBridgeMsgs(prev => prev.map(m => m.id === placeholderId
            ? { ...m, content: accumulated, isLoading: false } : m));
        }
      } else {
        setBridgeMsgs(prev => prev.map(m => m.id === placeholderId
          ? { ...m, content: accumulated, isLoading: false } : m));
      }
    } catch (err) {
      if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
      textQueueRef.current = "";
      displayedRef.current = "";
      setBridgeMsgs(prev => prev.map(m => m.id === placeholderId
        ? { ...m, content: `Greška: ${err.message}`, isLoading: false } : m));
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleSend() {
    if ((!bridgeInput.trim() && !bridgeImage) || isStreaming || isAnalyzing) return;
    const msg = bridgeInput.trim();
    const imgData = bridgeImage;
    setBridgeInput("");
    setBridgeImage(null);
    await streamAgentMsg(msg, backendUrl, manifestRef.current || [], findingsRef.current, imgData);
  }

  async function handleAnalyze(files) {
    if (isAnalyzing || !files.length) return;
    setIsAnalyzing(true);
    const newFindings = { ...findingsRef.current };
    const analyzedNames = [];
    const progressId = nextId();

    setBridgeMsgs(prev => [...prev, { id: progressId, role: "assistant", content: `Pripremam analizu...`, isProgress: true }]);

    for (const file of files) {
      setBridgeMsgs(prev => prev.map(m => m.id === progressId
        ? { ...m, content: `Čitam ${file.filename}...` } : m));
      try {
        const fileData = await window.electron.mtBridgeReadFile({ fullPath: file.fullPath });
        if (fileData.error) continue;
        const res = await fetch(`${backendUrl}/api/bridge/analyze-file`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.filename, contentBase64: fileData.base64, action: file.action }),
        });
        const result = await res.json();
        if (result.knowledge || result.description) {
          newFindings[file.filename] = { knowledge: result.knowledge || result.description, action: file.action };
          analyzedNames.push(file.filename);
        }
      } catch { /* preskoči */ }
    }

    setBridgeMsgs(prev => prev.filter(m => m.id !== progressId));
    setFindings(newFindings);
    findingsRef.current = newFindings;
    setIsAnalyzing(false);

    const summary = analyzedNames.length > 0
      ? `Upravo si završio analizu ovih datoteka: ${analyzedNames.join(", ")}. Reci mi detaljno što si naučio — koje parametre, formule ili informacije si pronašao?`
      : "Pokušao sam analizirati datoteke, ali nisam uspio dobiti korisne podatke. Možeš li mi reći što je pošlo po zlu?";

    await streamAgentMsg(summary, backendUrl, manifestRef.current || [], newFindings);
  }

  async function handleSaveFindings() {
    const entries = Object.entries(findingsRef.current);
    if (!entries.length) return;
    let saved = 0;
    for (const [filename, data] of entries) {
      try {
        if (data.action === "import-mac") {
          const item = (manifestRef.current || []).find(m => m.filename === filename);
          if (item) await window.electron.mtBridgeImportFile({ fullPath: item.fullPath, filename });
        } else {
          await fetch(`${backendUrl}/api/bridge/save-insight`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: filename, insight: data.knowledge }),
          });
        }
        saved++;
      } catch { /* preskoči */ }
    }
    const saveId = nextId();
    setBridgeMsgs(prev => [...prev, {
      id: saveId,
      role: "assistant",
      content: `Znanje iz ${saved} datoteke(a) uspješno je dodano u bazu. Svaki put kad pitaš Copilota nešto o formulama, koristit će i ove podatke.`,
    }]);
    setFindings({});
    findingsRef.current = {};
  }

  async function handleBrowse() {
    const res = await window.electron.mtBrowseFolder();
    if (res.canceled) return;
    setMtInstallPath(res.path);
    await window.electron.saveSettings({ mtInstallPath: res.path });
    setIsScanning(true);
    setMtManifest(null);
    const scan = await window.electron.mtBridgeScan(res.path);
    setIsScanning(false);
    if (scan.ok) { setMtManifest(scan.manifest); manifestRef.current = scan.manifest; }
  }

  const hasPendingFindings = Object.keys(findings).length > 0;
  const macCount = (mtManifest || []).filter(f => f.folder === "Mac").length;
  const loadedCount = (mtManifest || []).filter(f => f.folder === "Mac" && f.alreadyLoaded).length;

  return (
    <div className="bridge-overlay">
      <div className="bridge-page">

        {/* Header */}
        <div className="bridge-header">
          <span className="bridge-title">Bridge — Istraživanje baze</span>
          <div style={{ flex: 1 }} />
          {mtInstallPath ? (
            <div className="bridge-conn-badge connected">
              {(mtInstallPath.split("\\").pop() || mtInstallPath.split("/").pop() || mtInstallPath) || mtInstallPath}
              <button className="bridge-conn-change" onClick={handleBrowse} title="Promijeni mapu">📁</button>
            </div>
          ) : (
            <button className="bridge-conn-badge disconnected" onClick={handleBrowse}>
              Spoji MegaTischler instalaciju
            </button>
          )}
          <button className="bridge-close" onClick={onClose}>✕</button>
        </div>

        {/* Stat bar */}
        {isScanning && <div className="bridge-stat-bar">Skeniram instalacijski direktorij...</div>}
        {mtManifest && !isScanning && (
          <div className="bridge-stat-bar">
            {macCount} .mac modula ({loadedCount} u bazi znanja) · {(mtManifest || []).filter(f => f.folder !== "Mac").length} ostalih datoteka
          </div>
        )}
        {!mtManifest && !isScanning && !mtInstallPath && (
          <div className="bridge-stat-bar" style={{ color: "#f59e0b" }}>Odaberi mapu MegaTischler instalacije da počnemo</div>
        )}

        {/* Chat */}
        <div className="bridge-chat" ref={scrollRef}>
          {bridgeMsgs.map(msg => (
            <div key={msg.id} className={`bridge-msg ${msg.role}${msg.isProgress ? " progress" : ""}`}>
              {msg.role === "assistant" && !msg.isProgress && (
                <div className="bridge-msg-label">MT BRIDGE</div>
              )}
              <div className="bridge-msg-content">
                {msg.isLoading ? (
                  <span className="bridge-loading-dots"><span>●</span><span>●</span><span>●</span></span>
                ) : (
                  <>
                    {msg.imageDataUrl && (
                      <img src={msg.imageDataUrl} alt="priložena slika" className="bridge-msg-image" />
                    )}
                    {(msg.content || !msg.imageDataUrl) && <MarkdownMessage content={msg.content || ""} />}
                  </>
                )}
              </div>
              {msg.suggestedFiles && msg.suggestedFiles.length > 0 && (
                <div className="bridge-suggest-action">
                  <div className="bridge-suggest-files">
                    {msg.suggestedFiles.map(f => (
                      <span key={f.fullPath || f.filename} className="bridge-file-chip">{f.filename}</span>
                    ))}
                  </div>
                  <button
                    className="bridge-analyze-btn"
                    disabled={isAnalyzing || isStreaming}
                    onClick={() => handleAnalyze(msg.suggestedFiles)}
                  >
                    {isAnalyzing ? "Analiziram..." : `Analiziraj ove datoteke (${msg.suggestedFiles.length})`}
                  </button>
                </div>
              )}
            </div>
          ))}
          {hasPendingFindings && (
            <div className="bridge-save-bar">
              <span>Analiza završena — spremi znanje u bazu?</span>
              <button className="bridge-save-btn" onClick={handleSaveFindings}>Spremi u bazu</button>
            </div>
          )}
        </div>

        {/* Image preview strip (shows when an image is attached) */}
        {bridgeImage && (
          <div className="bridge-img-preview">
            <img src={bridgeImage.dataUrl} alt="privitak" className="bridge-img-thumb" />
            <span className="bridge-img-name">{bridgeImage.name}</span>
            <button className="bridge-img-remove" onClick={() => setBridgeImage(null)} title="Ukloni sliku">×</button>
          </div>
        )}

        {/* Input */}
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageSelect}
        />
        <div className="bridge-input-row">
          <button
            className={`bridge-attach-btn${bridgeImage ? " has-image" : ""}`}
            onClick={() => imgInputRef.current?.click()}
            title="Priloži sliku"
            disabled={isStreaming || isAnalyzing}
          >
            📎
          </button>
          <textarea
            className="bridge-input"
            placeholder="Pitaj Bridge agenta... (npr. Koje datoteke opisuju ladice?)"
            value={bridgeInput}
            onChange={e => setBridgeInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={isStreaming || isAnalyzing}
            rows={2}
          />
          <button
            className="bridge-send-btn"
            onClick={handleSend}
            disabled={(!bridgeInput.trim() && !bridgeImage) || isStreaming || isAnalyzing}
          >
            {isStreaming ? <><div className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> Šalje...</> : "▶ Pošalji"}
          </button>
        </div>

      </div>
    </div>
  );
}

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
  onOpenBridge,
  sumirajThreshold = 20,
  onSumirajThresholdChange,
}) {
  const [activeTab, setActiveTab] = React.useState("opce");
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
  const [autoLoadModule, setAutoLoadModule] = useState(true);
  const [macUploadStatus, setMacUploadStatus] = useState(null);
  const macFileInputRef = React.useRef(null);
  const [stolarEntries, setStolarEntries] = useState([]);
  const [stolarLoading, setStolarLoading] = useState(false);
  const [stolarDeleting, setStolarDeleting] = useState(null);

  useEffect(() => {
    window.electron.getSettings().then((s) => {
      setBackendUrl(s.backendUrl || "");
      setOpenaiKey(s.openaiKey || "");
      setMicDeviceId(s.micDeviceId || "");
      setTtsEnabled(s.ttsEnabled || false);
      setTtsVoice(s.ttsVoice || "onyx");
      setUseRegionForF9(!!s.useRegionForF9);
      setAutoLoadModule(s.autoLoadModule !== false);
    });
    window.electron.fetchKnowledgeStats().then((data) => {
      if (!data.error) setStats(data);
    });
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setMics(devices.filter((d) => d.kind === "audioinput"));
    }).catch(() => {});
  }, []);

  async function loadStolarEntries(url) {
    const base = url || backendUrl;
    if (!base) return;
    setStolarLoading(true);
    try {
      const res = await fetch(`${base}/api/stolar/list`);
      if (res.ok) {
        const data = await res.json();
        setStolarEntries(data.entries || []);
      }
    } catch {
      // ignore
    } finally {
      setStolarLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "baza" && backendUrl) {
      loadStolarEntries(backendUrl);
    }
  }, [activeTab, backendUrl]);

  async function handleDeleteStolar(pojam) {
    if (!window.confirm(`Jesi li siguran da želiš obrisati pojam "${pojam}"?`)) return;
    setStolarDeleting(pojam);
    try {
      const res = await fetch(`${backendUrl}/api/stolar/${encodeURIComponent(pojam)}`, { method: "DELETE" });
      if (res.ok) {
        setStolarEntries((prev) => prev.filter((e) => e.pojam !== pojam));
      }
    } catch {
      // ignore
    } finally {
      setStolarDeleting(null);
    }
  }

  function handleSave() {
    window.electron.saveSettings({ backendUrl, openaiKey, micDeviceId, ttsEnabled, ttsVoice, autoLoadModule }).then(() => {
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
      const filesData = await Promise.all(Array.from(files).map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => { const base64 = reader.result.split(",")[1]; resolve({ name: file.name, base64 }); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      const result = await window.electron.uploadMacFiles({ files: filesData });
      if (result.error) throw new Error(result.error);
      window.electron.fetchKnowledgeStats().then((data) => { if (!data.error) setStats(data); });
      setMacUploadStatus({ ok: true, count: filesData.length });
      setTimeout(() => setMacUploadStatus(null), 3000);
    } catch (err) {
      setMacUploadStatus({ ok: false, error: err.message });
      setTimeout(() => setMacUploadStatus(null), 5000);
    }
  }

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>

        <div className="settings-header" style={{ padding: "14px 16px 0", marginBottom: 0 }}>
          <span className="settings-title">⚙ Postavke</span>
          <button className="btn-icon" onClick={onClose} title="Zatvori">✕</button>
        </div>

        <div className="settings-tabs">
          {[["opce","Opće"],["live","Live mod"],["baza","Baza znanja"]].map(([id, label]) => (
            <button key={id} className={`settings-tab${activeTab === id ? " active" : ""}`}
              onClick={() => setActiveTab(id)}>{label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>

          {/* ── Tab: Opće ── */}
          {activeTab === "opce" && (
            <>
              <div className="settings-section">
                <div className="settings-label">Backend URL (Replit)</div>
                <input className="settings-input" type="text" value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)} placeholder="https://...replit.dev" />
              </div>
              <div className="settings-section">
                <div className="settings-label">OpenAI API Key (za glasovni unos)</div>
                <div style={{ position: "relative" }}>
                  <input className="settings-input" type={showKey ? "text" : "password"}
                    value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..." style={{ paddingRight: 48 }} />
                  <button onClick={() => setShowKey((v) => !v)}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text3)" }}>
                    {showKey ? "sakrij" : "prikaži"}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>Alternativno: dodaj OPENAI_API_KEY u Replit Secrets</div>
              </div>
              <div className="settings-section">
                <div className="settings-label">Mikrofon (F8 glasovni unos)</div>
                <select className="settings-input" value={micDeviceId}
                  onChange={(e) => setMicDeviceId(e.target.value)} style={{ cursor: "pointer" }}>
                  <option value="">Zadani mikrofon</option>
                  {mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || `Mikrofon ${m.deviceId.slice(0, 8)}`}</option>)}
                </select>
              </div>
              <div className="settings-section">
                <div className="settings-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Glasovni odgovor (TTS)</span>
                  <label className="tts-toggle">
                    <input type="checkbox" checked={ttsEnabled}
                      onChange={(e) => setTtsEnabled(e.target.checked)} style={{ marginRight: 6 }} />
                    {ttsEnabled ? "Uključen" : "Isključen"}
                  </label>
                </div>
                {ttsEnabled && (
                  <>
                    <select className="settings-input" value={ttsVoice}
                      onChange={(e) => setTtsVoice(e.target.value)} style={{ cursor: "pointer", marginTop: 6 }}>
                      {TTS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                    <button className="btn-save" onClick={handleTestVoice} disabled={testingVoice}
                      style={{ marginTop: 6, background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)" }}>
                      {testingVoice ? "Reproducira..." : "🔊 Testiraj glas"}
                    </button>
                  </>
                )}
              </div>
              <div className="settings-section">
                <div className="settings-label">Konsolidacija znanja — prag poruka</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <input
                    className="settings-input"
                    type="number"
                    min="5"
                    max="200"
                    value={sumirajThreshold}
                    style={{ width: 72 }}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (v >= 5 && v <= 200) {
                        onSumirajThresholdChange && onSumirajThresholdChange(v);
                      }
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>poruka (zadano: 20)</span>
                </div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>
                  Nakon toliko poruka Copilot predlaže /sumiraj-znanje bannером
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-label">Tipkovni prečaci</div>
                <div className="shortcuts-list">
                  <div className="shortcut-row"><span className="shortcut-key">F9</span><span className="shortcut-desc">Snimi ekran i pošalji</span></div>
                  <div className="shortcut-row"><span className="shortcut-key">F8</span><span className="shortcut-desc">Uključi / isključi glasovni unos</span></div>
                  <div className="shortcut-row"><span className="shortcut-key">Enter</span><span className="shortcut-desc">Pošalji poruku</span></div>
                  <div className="shortcut-row"><span className="shortcut-key">Shift+Enter</span><span className="shortcut-desc">Novi red</span></div>
                </div>
              </div>
              <button className={`btn-save${saved ? " saved" : ""}`} onClick={handleSave}>
                {saved ? "✓ Spremljeno" : "Spremi"}
              </button>
              <div className="version-info">MegaTischler Copilot v1.0.0</div>
            </>
          )}

          {/* ── Tab: Live mod ── */}
          {activeTab === "live" && (
            <>
              <div className="settings-section">
                <div className="settings-label">Budžet i statistika</div>
                <div className="live-cost-row">
                  <div className="live-cost-stat"><span className="live-cost-num">${liveSpentUsd.toFixed(2)}</span><span className="live-cost-desc">potrošeno danas</span></div>
                  <div className="live-cost-stat"><span className="live-cost-num">${liveBudgetUsd}</span><span className="live-cost-desc">dnevni budžet</span></div>
                  <div className="live-cost-stat"><span className="live-cost-num">{liveCallCount}</span><span className="live-cost-desc">AI poziva</span></div>
                </div>
                {(() => {
                  const pct = liveBudgetUsd > 0 ? liveSpentUsd / liveBudgetUsd : 0;
                  return (
                    <>
                      <div className="live-budget-bar">
                        <div className={`live-budget-fill${pct > 0.8 ? " warning" : ""}`} style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }} />
                      </div>
                      {pct > 0.8 && <div className="live-cost-warning">⚠ Potrošeno {Math.round(pct * 100)}% dnevnog budžeta</div>}
                    </>
                  );
                })()}
                <div className="settings-label" style={{ marginTop: 8 }}>Dnevni budžet (USD)</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                  <input className="settings-input" type="number" min="1" max="500"
                    defaultValue={liveBudgetUsd} key={liveBudgetUsd}
                    onBlur={(e) => { const n = parseFloat(e.target.value); if (n > 0) { setLiveBudgetUsd && setLiveBudgetUsd(n); window.electron.liveSetBudget(n).catch(() => {}); } }}
                    style={{ width: 80 }} />
                  <button className="btn-save"
                    style={{ flex: 1, background: "var(--bg3)", color: "var(--text3)", border: "1px solid var(--border)" }}
                    onClick={() => { setLiveSpentUsd && setLiveSpentUsd(0); setLiveCallCount && setLiveCallCount(0); window.electron.liveResetCount().catch(() => {}); }}>
                    Resetiraj brojač
                  </button>
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-label">Praćeno područje ekrana</div>
                {liveRegion ? (
                  <div className="live-region-info">
                    <span className="live-region-coords">{liveRegion.x},{liveRegion.y} — {liveRegion.width}×{liveRegion.height}px</span>
                    <button className="btn-save" style={{ fontSize: 11, padding: "3px 8px", background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)" }}
                      onClick={() => { onChangeRegion && onChangeRegion(); }}>Promijeni</button>
                    <button className="btn-save" style={{ fontSize: 11, padding: "3px 8px", background: "var(--bg3)", color: "var(--text3)", border: "1px solid var(--border)" }}
                      onClick={() => { window.electron.liveClearRegion().then((result) => { if (result?.liveDisabled && setLiveEnabled) setLiveEnabled(false); }).catch(() => {}); setLiveRegion && setLiveRegion(null); }}>
                      Ukloni
                    </button>
                  </div>
                ) : (
                  <div style={{ color: "var(--text3)", fontSize: 12, marginTop: 4 }}>Nije odabrano — klik na Live gumb za odabir</div>
                )}
                {liveRegion && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <input type="checkbox" id="useRegionForF9" checked={useRegionForF9}
                      onChange={(e) => { const c = e.target.checked; setUseRegionForF9(c); window.electron.saveSettings({ useRegionForF9: c }).catch(() => {}); }}
                      style={{ cursor: "pointer" }} />
                    <label htmlFor="useRegionForF9" style={{ fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>Koristi isto područje i za F9 screenshot</label>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <input type="checkbox" id="autoLoadModule" checked={autoLoadModule}
                    onChange={(e) => { const c = e.target.checked; setAutoLoadModule(c); window.electron.saveSettings({ autoLoadModule: c }).catch(() => {}); }}
                    style={{ cursor: "pointer" }} />
                  <label htmlFor="autoLoadModule" style={{ fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>Automatski učitaj modul kad Live ga prepozna</label>
                </div>
              </div>
            </>
          )}

          {/* ── Tab: Baza znanja ── */}
          {activeTab === "baza" && (
            <>
              <div className="settings-section">
                <div className="settings-label">Statistike baze znanja</div>
                {stats ? (
                  <div className="settings-stats">
                    <div className="stat-card"><div className="stat-value">{stats.stats?.formulaCount ?? stats.formula_count ?? stats.formulas?.length ?? "—"}</div><div className="stat-label">Formule</div></div>
                    <div className="stat-card"><div className="stat-value">{stats.stats?.parameterCount ?? stats.parameter_count ?? stats.parameters?.length ?? "—"}</div><div className="stat-label">Parametri</div></div>
                    <div className="stat-card"><div className="stat-value">{stats.stats?.fileCount ?? stats.file_count ?? stats._meta?.files_processed ?? "—"}</div><div className="stat-label">Datoteke</div></div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>Učitavanje...</div>
                )}
              </div>
              <div className="settings-section">
                <div className="settings-label">Dodaj .mac / .prt datoteke u bazu</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>Ručno dodavanje .mac, .prt ili .zip datoteka (alternativa Bridge agentu)</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                  <input ref={macFileInputRef} type="file" accept=".mac,.zip,.prt" multiple style={{ display: "none" }}
                    onChange={(e) => { handleMacUpload(e.target.files); e.target.value = ""; }} />
                  <button className="btn-save"
                    style={{ flex: 1, background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)" }}
                    onClick={() => macFileInputRef.current?.click()}
                    disabled={macUploadStatus === "uploading"}>
                    {macUploadStatus === "uploading" ? "⏳ Dodavanje..." : "📁 Odaberi .mac / .zip / .prt"}
                  </button>
                </div>
                {macUploadStatus && macUploadStatus !== "uploading" && (
                  <div style={{ marginTop: 6, fontSize: 11, padding: "4px 8px", borderRadius: 4,
                    background: macUploadStatus.ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                    color: macUploadStatus.ok ? "var(--accent)" : "#f87171",
                    border: `1px solid ${macUploadStatus.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}` }}>
                    {macUploadStatus.ok ? `✓ Dodano ${macUploadStatus.count} datoteka(e) u bazu znanja` : `✗ Greška: ${macUploadStatus.error}`}
                  </div>
                )}
              </div>
              <div className="settings-section">
                <div className="settings-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Naučeni stolarski pojmovi</span>
                  <button onClick={() => loadStolarEntries(backendUrl)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text3)", padding: "2px 6px" }}
                    title="Osvježi">↺ Osvježi</button>
                </div>
                {stolarLoading ? (
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>Učitavanje...</div>
                ) : stolarEntries.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
                    Nema naučenih pojmova. Koristi <code style={{ background: "var(--bg3)", padding: "1px 4px", borderRadius: 3 }}>/stolar</code> za dodavanje.
                  </div>
                ) : (
                  <div style={{ marginTop: 6, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={{ textAlign: "left", padding: "4px 6px", color: "var(--text3)", fontWeight: 600 }}>Pojam</th>
                          <th style={{ textAlign: "left", padding: "4px 6px", color: "var(--text3)", fontWeight: 600 }}>Definicija</th>
                          <th style={{ textAlign: "center", padding: "4px 6px", color: "var(--text3)", fontWeight: 600 }}>Zaključci</th>
                          <th style={{ padding: "4px 6px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {stolarEntries.map((entry) => (
                          <tr key={entry.pojam} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            <td style={{ padding: "5px 6px", color: "var(--text1)", fontWeight: 500, whiteSpace: "nowrap" }}>{entry.pojam}</td>
                            <td style={{ padding: "5px 6px", color: "var(--text2)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              title={entry.definicija}>{entry.definicija || <span style={{ color: "var(--text3)" }}>—</span>}</td>
                            <td style={{ padding: "5px 6px", textAlign: "center", color: "var(--text3)" }}>{entry.zaključci?.length ?? 0}</td>
                            <td style={{ padding: "5px 6px", textAlign: "right" }}>
                              <button
                                onClick={() => handleDeleteStolar(entry.pojam)}
                                disabled={stolarDeleting === entry.pojam}
                                style={{ fontSize: 10, padding: "2px 8px", background: "rgba(248,113,113,0.12)", color: "#f87171",
                                  border: "1px solid rgba(248,113,113,0.3)", borderRadius: 4, cursor: "pointer" }}>
                                {stolarDeleting === entry.pojam ? "..." : "Obriši"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="settings-section">
                <div className="settings-label">Bridge Agent</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>
                  Poveži se na MegaTischler instalaciju i razgovaraj s AI agentom koji istražuje bazu datoteka.
                </div>
                <button className="bridge-open-btn" onClick={() => { onClose(); onOpenBridge && onOpenBridge(); }}>
                  🗄 Otvori Bridge Agent →
                </button>
              </div>
            </>
          )}

        </div>
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

function generateId() {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createConversation(title = "Novi razgovor") {
  return { id: generateId(), title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
}

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  // ── Conversation state ─────────────────────────────────────────────────
  const [conversations, setConversations] = useState(() => {
    const first = createConversation();
    return [first];
  });
  const [activeConvId, setActiveConvId] = useState(() => {
    // Will be overwritten from disk in useEffect below
    return null;
  });

  // Derive active conversation safely
  const activeConv = conversations.find((c) => c.id === activeConvId) ?? conversations[0];
  const messages = activeConv?.messages ?? [];

  // Debounce ref for conversation saves
  const saveConvTimerRef = React.useRef(null);

  function saveConversationsToDisk(convs, activeId) {
    if (saveConvTimerRef.current) clearTimeout(saveConvTimerRef.current);
    saveConvTimerRef.current = setTimeout(() => {
      window.electron.saveConversations({ activeId, conversations: convs }).catch(() => {});
    }, 500);
  }

  // Replace setMessages everywhere — writes into the active conversation
  function setMessages(updaterOrArray) {
    setConversations((prevConvs) => {
      const target = prevConvs.find((c) => c.id === (activeConvId ?? prevConvs[0]?.id));
      if (!target) return prevConvs;
      const newMsgs = typeof updaterOrArray === "function"
        ? updaterOrArray(target.messages)
        : updaterOrArray;
      const updated = prevConvs.map((c) =>
        c.id === target.id
          ? { ...c, messages: newMsgs, updatedAt: new Date().toISOString() }
          : c
      );
      saveConversationsToDisk(updated, activeConvId ?? prevConvs[0]?.id);
      return updated;
    });
  }

  function setActiveConv(id) {
    setActiveConvId(id);
    saveConversationsToDisk(conversations, id);
  }

  function newConversation() {
    const conv = createConversation();
    setConversations((prev) => {
      const updated = [...prev, conv];
      saveConversationsToDisk(updated, conv.id);
      return updated;
    });
    setActiveConvId(conv.id);
  }

  function deleteConversation(id) {
    window.electron.deleteConversation(id).then((result) => {
      setConversations((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        if (updated.length === 0) {
          const fresh = createConversation();
          saveConversationsToDisk([fresh], fresh.id);
          setActiveConvId(fresh.id);
          return [fresh];
        }
        const newActive = result.activeId ?? updated[0].id;
        saveConversationsToDisk(updated, newActive);
        setActiveConvId(newActive);
        return updated;
      });
    }).catch(() => {});
  }

  const [input, setInput] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [mtActive, setMtActive] = useState(false);
  const [mtWarning, setMtWarning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBridgeAgent, setShowBridgeAgent] = useState(false);
  const bridgeQueryRef = React.useRef("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveState, setLiveState] = useState("off"); // off | running | paused
  const [liveTask, setLiveTask] = useState("");
  const [liveCallCount, setLiveCallCount] = useState(0);
  const [liveSpentUsd, setLiveSpentUsd] = useState(0);
  const [liveBudgetUsd, setLiveBudgetUsd] = useState(100);
  const [liveRegion, setLiveRegion] = useState(null);
  const [sessionContext, setSessionContext] = useState(null);
  const [awaitingRegion, setAwaitingRegion] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [liveUploadStatus, setLiveUploadStatus] = useState(null);
  const liveFileInputRef = React.useRef(null);
  // Module bar: track last loaded hint + loading state
  const [moduleLoadedHint, setModuleLoadedHint] = useState(null); // hint that was last successfully loaded
  const [moduleLoading, setModuleLoading] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_HEIGHT_DEFAULT);

  // Bridge persistent connection state (shared with /istraži command)
  const [mtInstallPath, setMtInstallPath] = useState("");
  const [mtManifest, setMtManifest] = useState(null);

  // Debug mod state
  const [debugState, setDebugState] = useState("off"); // off | recording
  const [debugFrames, setDebugFrames] = useState([]); // [{index, thumb}]
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugProblem, setDebugProblem] = useState("");

  // Stolar inline form
  const [stolarFormVisible, setStolarFormVisible] = useState(false);
  const [stolarFormLoading, setStolarFormLoading] = useState(false);

  // Nauči inline form (2-step)
  const [nauciFormVisible, setNauciFormVisible] = useState(false);
  const [nauciStep, setNauciStep] = useState(1);
  const [nauciLoading, setNauciLoading] = useState(false);
  const [nauciPitanja, setNauciPitanja] = useState([]);
  const [nauciSadržaj, setNauciSadržaj] = useState("");

  // Sumiraj panel — konsolidacija znanja iz razgovora
  const [sumirajVisible, setSumirajVisible] = useState(false);
  const [sumirajLoading, setSumirajLoading] = useState(false);
  const [sumirajStavke, setSumirajStavke] = useState([]);

  // Proactive sumiraj banner — predloži konsolidaciju znanja nakon N poruka
  const [sumirajBannerAt, setSumirajBannerAt] = useState(null);
  const [sumirajThreshold, setSumirajThreshold] = useState(20);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const inputHeightRef = useRef(INPUT_HEIGHT_DEFAULT);
  const resizingInputRef = useRef(false);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  // Refs for values used inside useCallback without adding to deps (avoids stale closures)
  const liveStateRef = useRef("off");
  const sessionContextRef = useRef(null);
  // Track previous live state when opening region picker so cancel can restore it
  const prevLiveStateRef = useRef("off");
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
    if (liveStateRef.current === "running") return;
    if (isRecordingRef.current) stopRecording();
    else startRecording();
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Load persisted conversations from disk
    window.electron.getConversations().then((data) => {
      if (data.conversations && data.conversations.length > 0) {
        setConversations(data.conversations);
        setActiveConvId(data.activeId ?? data.conversations[0].id);
      } else {
        // First run — create default conversation and persist it
        const first = createConversation();
        setConversations([first]);
        setActiveConvId(first.id);
        window.electron.saveConversations({ activeId: first.id, conversations: [first] }).catch(() => {});
      }
    }).catch(() => {});

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
      const state = s.liveState || (s.enabled ? "running" : "off");
      setLiveState(state);
      setLiveTask(s.liveTask || "");
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
      if (s.mtInstallPath) setMtInstallPath(s.mtInstallPath);
      const t = Number(s.sumirajThreshold);
      if (t >= 5) setSumirajThreshold(t);
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
          step: data.step || null,
          type: "proactive",
          context: data.context || null,
        },
      ]);
    });

    window.electron.onLiveBudgetReached((data) => {
      setLiveState("off");
      setLiveTask("");
      setShowTaskInput(false);
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
      setShowTaskInput(true);
      setTaskInput(liveTask || "");
    });

    window.electron.onLiveRegionCancelled(() => {
      setAwaitingRegion(false);
      const prev = prevLiveStateRef.current;
      prevLiveStateRef.current = "off";
      if (prev === "running") {
        window.electron.liveResume().then(() => setLiveState("running")).catch(() => {});
      } else if (prev === "paused") {
        setLiveState("paused");
      }
    });

    window.electron.onLiveStateChanged((data) => {
      if (data.state) setLiveState(data.state);
      if (data.task !== undefined) setLiveTask(data.task || "");
      if (data.spentUsd !== undefined) setLiveSpentUsd(data.spentUsd);
      if (data.callCount !== undefined) setLiveCallCount(data.callCount);
      if (data.liveRegion) setLiveRegion(data.liveRegion);
      if (data.state === "off") {
        setShowTaskInput(false);
        setLiveTask("");
      }
    });

    // Faza 5C — auto-loaded module notification from main process
    if (window.electron.onLiveModuleLoaded) {
      window.electron.onLiveModuleLoaded((data) => {
        if (data.success) {
          setModuleLoadedHint(data.hint);
          setTimeout(() => setModuleLoadedHint(null), 30000);
        }
      });
    }

    // Debug mode — frame captured notification
    if (window.electron.onDebugFrameCaptured) {
      window.electron.onDebugFrameCaptured((data) => {
        setDebugFrames((prev) => {
          const existing = prev.find((f) => f.index === data.index);
          if (existing) return prev;
          return [...prev, { index: data.index, thumb: data.thumb }];
        });
      });
    }

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

  async function handleLiveUpload(files) {
    if (!files || files.length === 0) return;
    setLiveUploadStatus("uploading");
    try {
      const filesData = await Promise.all(Array.from(files).map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => { const base64 = reader.result.split(",")[1]; resolve({ name: file.name, base64 }); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      const result = await window.electron.uploadMacFiles({ files: filesData });
      if (result.error) throw new Error(result.error);
      setLiveUploadStatus({ ok: true, count: filesData.length });
      setTimeout(() => setLiveUploadStatus(null), 3000);
    } catch (err) {
      setLiveUploadStatus({ ok: false, error: err.message });
      setTimeout(() => setLiveUploadStatus(null), 4000);
    }
  }

  async function stopLiveMode() {
    setMessages((prev) => [
      ...prev,
      {
        id: `live-end-${Date.now()}`,
        role: "assistant",
        content: "⏹ Live sesija završena.",
        type: "live-boundary",
      },
    ]);
    setLiveState("off");
    setLiveTask("");
    setShowTaskInput(false);
    await window.electron.liveSetEnabled(false).catch(console.error);
  }

  // ── Debug helpers ────────────────────────────────────────────────────────────
  async function openDebugPanel() {
    if (liveState === "running") {
      alert("Live mod je aktivan. Zaustavi Live prije debug snimanja.");
      return;
    }
    setShowDebugPanel(true);
    setDebugFrames([]);
    setDebugProblem("");
    setDebugState("off");
  }

  async function handleStolarSaveElectron(pojam, definicija) {
    setStolarFormLoading(true);
    try {
      const settings = await window.electron.getSettings();
      const url = settings.backendUrl;
      const inferRes = await fetch(`${url}/api/stolar/infer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pojam, definicija }),
      });
      if (!inferRes.ok) throw new Error(`HTTP ${inferRes.status}`);
      const inferData = await inferRes.json();
      const zaključci = inferData.zaključci ?? [];
      await fetch(`${url}/api/stolar/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pojam, definicija, zaključci }),
      });
      const n = zaključci.length;
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `✓ Naučio sam **${n}** zaključak${n === 1 ? "" : "a"} o pojmu **${pojam}**. Koristit ću ovo znanje u budućim odgovorima.`,
        type: "proactive",
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ Greška pri zapisivanju stolarskog znanja: ${err.message}`,
        type: "proactive",
      }]);
    } finally {
      setStolarFormLoading(false);
      setStolarFormVisible(false);
    }
  }

  async function handleNauciStart(sadržaj) {
    setNauciLoading(true);
    setNauciSadržaj(sadržaj);
    try {
      const settings = await window.electron.getSettings();
      const url = settings.backendUrl;
      const res = await fetch(`${url}/api/nauci/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sadržaj }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNauciPitanja(data.pitanja ?? []);
      setNauciStep(2);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ Greška pri dohvatu pitanja: ${err.message}`,
        type: "proactive",
      }]);
      setNauciFormVisible(false);
      setNauciStep(1);
    } finally {
      setNauciLoading(false);
    }
  }

  async function handleNauciSave(sadržaj, pitanja) {
    setNauciLoading(true);
    try {
      const settings = await window.electron.getSettings();
      const url = settings.backendUrl;
      const res = await fetch(`${url}/api/nauci/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sadržaj, pitanja }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const entry = data.entry;
      const n = entry?.zaključci?.length ?? 0;
      const moduli = entry?.moduli?.length > 0 ? `, primjenjuje se na: ${entry.moduli.join(", ")}` : "";
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `🧠 Zapamtio sam novo pravilo s **${n}** zaključka${n === 1 ? "" : "ka"}${moduli}. Koristit ću ovo znanje pri pisanju formula.`,
        type: "proactive",
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ Greška pri zapisivanju pravila: ${err.message}`,
        type: "proactive",
      }]);
    } finally {
      setNauciLoading(false);
      setNauciFormVisible(false);
      setNauciStep(1);
      setNauciPitanja([]);
      setNauciSadržaj("");
    }
  }

  async function handleSumirajStart(historySnapshot) {
    setSumirajLoading(true);
    setSumirajVisible(true);
    setSumirajStavke([]);
    try {
      const settings = await window.electron.getSettings();
      const url = settings.backendUrl;
      const history = historySnapshot
        .filter(m => m.content?.trim())
        .map(m => ({ role: m.role, content: m.content.slice(0, 1000) }));
      const res = await fetch(`${url}/api/sumiraj/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSumirajStavke(data.stavke ?? []);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ Greška pri analizi razgovora: ${err.message}`,
        type: "proactive",
      }]);
      setSumirajVisible(false);
    } finally {
      setSumirajLoading(false);
    }
  }

  async function handleSumirajSave(potvrdjeneStavke) {
    setSumirajLoading(true);
    try {
      const settings = await window.electron.getSettings();
      const url = settings.backendUrl;
      const res = await fetch(`${url}/api/sumiraj/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stavke: potvrdjeneStavke }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const n = data.saved ?? 0;
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `🧾 Konsolidacija završena — zapamtio sam **${n}** novih pravila parametrizacije. Koristit ću ih u budućim odgovorima.`,
        type: "proactive",
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ Greška pri spremanju znanja: ${err.message}`,
        type: "proactive",
      }]);
    } finally {
      setSumirajLoading(false);
      setSumirajVisible(false);
      setSumirajStavke([]);
    }
  }

  async function startDebugRecording() {
    const result = await window.electron.debugStartRecording();
    if (!result.ok) {
      alert(result.error || "Greška pri pokretanju snimanja.");
      return;
    }
    setDebugState("recording");
  }

  async function stopDebugRecording() {
    await window.electron.debugStopRecording();
    setDebugState("off");
  }

  async function removeLastDebugFrame() {
    await window.electron.debugRemoveLastFrame();
    setDebugFrames((prev) => prev.slice(0, -1));
  }

  async function cancelDebugSession() {
    await window.electron.debugClearFrames();
    setDebugState("off");
    setDebugFrames([]);
    setDebugProblem("");
    setShowDebugPanel(false);
  }

  async function handleDebugSend() {
    if (!debugProblem.trim() || debugFrames.length === 0 || isStreaming) return;

    // Fetch actual base64 frames from main process
    const frames = await window.electron.debugGetFrames();

    const userContent = debugProblem.trim();
    const thumbGrid = debugFrames.map((f) => f.thumb);

    const userMsg = {
      id: Date.now(),
      role: "user",
      content: userContent,
      debugThumbs: thumbGrid,
      debugCount: frames.length,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    if (messages.length === 0) {
      const autoTitle = ("Debug: " + userContent).slice(0, 60);
      setConversations((prev) => prev.map((c) =>
        c.id === (activeConvId ?? prev[0]?.id) ? { ...c, title: autoTitle } : c
      ));
    }

    setShowDebugPanel(false);
    setDebugState("off");
    setDebugFrames([]);
    setDebugProblem("");
    await window.electron.debugClearFrames();
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const settings = await window.electron.getSettings();
      const url = settings.backendUrl;

      const historyForApi = nextMessages
        .slice(-11, -1)
        .map((m) => ({
          role: m.role,
          content: m.debugCount
            ? `Debug sesija: ${m.debugCount} screenshota, problem: ${m.content}`
            : (m.content || (m.screenshotThumb ? SCREENSHOT_CONTINUATION : "")),
        }))
        .filter((m) => m.content);

      const body = {
        message: userContent,
        history: historyForApi,
        mode: "debug",
        screenshots: frames.map((f) => ({ base64: f.base64, index: f.index })),
      };

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
      let lineBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const newlineIdx = lineBuffer.lastIndexOf("\n");
        if (newlineIdx === -1) continue;
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
              const cp = [...prev];
              cp[cp.length - 1] = { role: "assistant", content: assistantContent };
              return cp;
            });
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const cp = [...prev];
        cp[cp.length - 1] = { role: "assistant", content: `Greška: ${err.message}` };
        return cp;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleLivePause() {
    await window.electron.livePause().catch(console.error);
    setLiveState("paused");
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "⏸ Live mod pauziran — praćenje ekrana zaustavljeno. Klikni **▶ Nastavi** za nastavak.",
        type: "proactive",
        id: `live-paused-${Date.now()}`,
      },
    ]);
  }

  async function handleLiveResume() {
    await window.electron.liveResume().catch(console.error);
    setLiveState("running");
  }

  async function handleStartLive() {
    const task = taskInput.trim();
    if (!task) return;
    const res = await window.electron.liveStart(task).catch(() => ({ ok: false }));
    if (res?.ok) {
      setLiveState("running");
      setLiveTask(task);
      setShowTaskInput(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `live-start-${Date.now()}`,
          role: "assistant",
          content: `🎯 Live sesija pokrenuta — pratim: **${task}**`,
          type: "live-boundary",
        },
      ]);
    }
  }

  async function handleUpdateTask() {
    const task = taskInput.trim();
    if (!task) return;
    await window.electron.liveSetTask(task).catch(console.error);
    setLiveTask(task);
    setShowTaskInput(false);
  }

  function cancelTaskInput() {
    setShowTaskInput(false);
    setTaskInput("");
  }

  // Faza 5C — load a detected module into the knowledge base
  async function loadModuleIntoKb(hint) {
    if (!hint || moduleLoading) return;
    setModuleLoading(true);
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
        content = `✓ Modul ${hint} je učitan u bazu znanja. Formule iz ovog modula imaju prednost u odgovorima.`;
        setModuleLoadedHint(hint);
        setTimeout(() => setModuleLoadedHint(null), 30000);
      }
      setMessages((prev) => [...prev, { role: "assistant", content, type: "proactive" }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `⚠ Greška pri učitavanju ${hint}: ${err.message}`,
        type: "proactive",
      }]);
    } finally {
      setModuleLoading(false);
    }
  }

  async function toggleLiveMode() {
    if (liveState === "running") {
      await handleLivePause();
      return;
    }
    if (liveState === "paused") {
      await handleLiveResume();
      return;
    }
    if (liveRegion) {
      setShowTaskInput(true);
      setTaskInput(liveTask || "");
      return;
    }
    prevLiveStateRef.current = "off";
    setAwaitingRegion(true);
    window.electron.liveStartRegionPicker().catch((err) => {
      setAwaitingRegion(false);
      console.error("Region picker error:", err);
    });
  }

  async function changeRegion() {
    const prev = liveState;
    setAwaitingRegion(true);
    if (liveState === "running") {
      await window.electron.livePause().catch(() => {});
      setLiveState("paused");
    }
    prevLiveStateRef.current = prev;
    window.electron.liveStartRegionPicker().catch((err) => {
      setAwaitingRegion(false);
      if (prev === "running") {
        window.electron.liveResume().then(() => setLiveState("running")).catch(() => {});
      } else if (prev === "paused") {
        setLiveState("paused");
      }
      console.error("Region picker error:", err);
    });
  }

  // Keep refs in sync with live state (used in useCallback to avoid stale closures)
  useEffect(() => { liveStateRef.current = liveState; }, [liveState]);
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

    // Parse /sumiraj-znanje command — analiziraj razgovor
    if (msgText.trim().toLowerCase() === "/sumiraj-znanje") {
      setInput("");
      handleSumirajStart([...messages]);
      return;
    }

    // Parse /nauči command — otvori inline formu
    if (msgText.trim().toLowerCase() === "/nauči" ||
        msgText.trim().toLowerCase() === "/nau\u010Di") {
      setInput("");
      setNauciFormVisible(true);
      setNauciStep(1);
      setNauciPitanja([]);
      return;
    }

    // Parse /stolar command — otvori inline formu
    if (msgText.trim().toLowerCase() === "/stolar" ||
        (msgText.trim().toLowerCase().startsWith("/stolar ") && msgText.trim().slice("/stolar ".length).trim() === "")) {
      setInput("");
      setStolarFormVisible(true);
      return;
    }

    // /stolar pojam definicija — direktno spremi
    if (msgText.trim().toLowerCase().startsWith("/stolar ")) {
      const rest = msgText.trim().slice("/stolar ".length).trim();
      const spaceIdx = rest.indexOf(" ");
      const pojam = spaceIdx > 0 ? rest.slice(0, spaceIdx) : rest;
      const definicija = spaceIdx > 0 ? rest.slice(spaceIdx + 1).trim() : "";
      setInput("");
      if (definicija) {
        await handleStolarSaveElectron(pojam, definicija);
      } else {
        setStolarFormVisible(true);
      }
      return;
    }

    // Parse /debug command
    if (msgText.trim().toLowerCase() === "/debug") {
      setInput("");
      openDebugPanel();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "🛠 **Debug panel otvoren** — snimi ekrane kojima opisuješ problem, zatim upiši opis i pošalji na analizu.",
        type: "proactive",
      }]);
      return;
    }

    // Parse /istraži command — otvori Bridge stranicu s upitom
    if (msgText.trim().toLowerCase().startsWith("/istraži")) {
      const query = msgText.trim().slice("/istraži".length).trim();
      setInput("");
      bridgeQueryRef.current = query || "";
      setShowBridgeAgent(true);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: query
          ? `🗄 **Bridge agent otvoren** — pretraži: "${query}"`
          : "🗄 **Bridge agent otvoren** — pretraži bazu datoteka MegaTischlera.",
        type: "proactive",
      }]);
      return;
    }

    // MT warning (non-blocking)
    if (!mtActive) {
      setMtWarning(true);
      setTimeout(() => setMtWarning(false), 4000);
    }
    const isScreenshotOnly = !msgText.trim() && !!currentScreenshot;
    // For screenshot-only sends we keep an explicit continuation prompt in history
    // so the API never receives an empty content string (which Anthropic rejects).
    const SCREENSHOT_CONTINUATION = "Nastavi logično rješavati zadatak na temelju ovog screenshota i prethodnog razgovora.";

    const userMsg = {
      role: "user",
      // UI shows a placeholder label; history/API will use SCREENSHOT_CONTINUATION
      content: isScreenshotOnly ? "" : msgText.trim(),
      screenshotThumb: currentScreenshot || null,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    // Auto-title: use first user message text (or "Screenshot") as conversation title
    if (messages.length === 0) {
      const autoTitle = (isScreenshotOnly ? "Screenshot" : msgText.trim()).slice(0, 60) || "Razgovor";
      setConversations((prev) => prev.map((c) =>
        c.id === (activeConvId ?? prev[0]?.id) ? { ...c, title: autoTitle } : c
      ));
    }

    setInput("");
    setScreenshotDataUrl(null);
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const settings = await window.electron.getSettings();
      const url = settings.backendUrl;

      const historyForApi = nextMessages
        .slice(-11, -1)
        .map((m) => ({
          role: m.role,
          // Replace empty screenshot-only entries in history with the continuation prompt
          content: m.content || (m.screenshotThumb ? SCREENSHOT_CONTINUATION : ""),
        }))
        .filter((m) => m.content); // drop any blank entries that somehow remain

      const body = {
        message: isScreenshotOnly ? "" : userMsg.content,
        history: historyForApi,
      };
      if (currentScreenshot) body.screenshot_base64 = extractBase64(currentScreenshot);
      // Faza C: use refs to avoid stale closure on liveEnabled / sessionContext
      if ((liveStateRef.current === "running" || liveStateRef.current === "paused") && sessionContextRef.current) {
        body.session_context = sessionContextRef.current;
      }
      if (planMode) {
        body.plan_mode = true;
        setPlanMode(false);
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
      let thinkingContent = "";
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
            else if (data.thinking) thinkingContent += data.thinking;
            else if (data.content) assistantContent += data.content;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
                ...(thinkingContent ? { thinkingContent } : {}),
              };
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
  }, [input, screenshotDataUrl, messages, isStreaming, mtActive, planMode]);

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
          {liveState === "paused" && (
            <button
              className="btn-live-stop"
              title="Isključi Live mod"
              onClick={() => stopLiveMode()}
            >
              ✕
            </button>
          )}
          <button
            className={`btn-live${liveState === "running" ? " active pulse" : ""}${liveState === "paused" ? " paused" : ""}${awaitingRegion ? " awaiting" : ""}`}
            title={
              awaitingRegion ? "Odaberi područje za Live..." :
              liveState === "running" ? `Live aktivan (${liveSpentUsd.toFixed(2)}$/${liveBudgetUsd}$) — klikni za pauzu` :
              liveState === "paused" ? "Nastavi Live mod" :
              "Uključi Live mod — odabir područja i zadatka"
            }
            onClick={toggleLiveMode}
          >
            {awaitingRegion ? "↔ Odaberi..." :
              liveState === "running" ? "⏸ Pauziraj" :
              liveState === "paused" ? "▶ Nastavi" : "○ Live"}
          </button>
          {mtManifest && (
            <span
              style={{ fontSize: 10, color: "var(--accent)", padding: "2px 6px", background: "rgba(56,189,248,0.1)", borderRadius: 4, border: "1px solid rgba(56,189,248,0.3)", cursor: "default", userSelect: "none" }}
              title={`Tischler Bridge spojen: ${mtManifest.length} datoteka`}
            >🔌 {mtManifest.length}</span>
          )}
          <button className="btn-icon" title="AI istraži bazu datoteka" onClick={() => setShowBridgeAgent(true)}>🗄</button>
          <button className="btn-icon" title="Postavke" onClick={() => setShowSettings(true)}>⚙</button>
          <button className="btn-icon" title="Minimizirati" onClick={() => window.electron.minimizeWindow()}>─</button>
          <button className="btn-icon close" title="Zatvori" onClick={() => window.electron.closeWindow()}>✕</button>
        </div>
      </div>

      {/* Conversation tabs */}
      <div className="conv-tabs">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`conv-tab${conv.id === (activeConvId ?? conversations[0]?.id) ? " conv-tab-active" : ""}`}
            title={conv.title}
            onClick={() => setActiveConv(conv.id)}
          >
            <span className="conv-tab-title">{conv.title}</span>
            {conversations.length > 1 && (
              <button
                className="conv-tab-close"
                title="Obriši razgovor"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Obriši razgovor "${conv.title}"?`)) {
                    deleteConversation(conv.id);
                  }
                }}
              >✕</button>
            )}
          </div>
        ))}
        <button className="conv-tab-new" title="Novi razgovor" onClick={newConversation}>+</button>
      </div>

      {/* Messages */}
      <div className="messages-area" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-logo">MT</div>
            <div className="empty-title">MegaTischler Copilot</div>
            <div className="empty-desc">
              Spreman za pisanje parametarskih formula.<br />
              Postavi pitanje ili pokreni Live mod.
            </div>
            <div className="empty-hints">
              <div className="empty-hints-label">// Live mod — 3 koraka</div>
              <div className="empty-hint">① Klik na <strong>○ Live</strong> → odaberi regiju ekrana</div>
              <div className="empty-hint">② Odaberi predložak ili opiši zadatak</div>
              <div className="empty-hint">③ Radi u MegaTischleru — AI prati i daje korake</div>
            </div>
            <div className="empty-hints" style={{ marginTop: 8 }}>
              <div className="empty-hints-label">// ili pitaj odmah</div>
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

            if (msg.type === "live-boundary") {
              return (
                <div key={msgKey} className="live-boundary-row">
                  <span className="live-boundary-text">{msg.content}</span>
                </div>
              );
            }

            if (isProactive || isKbSuggest) {
              const proactiveLabel = isKbSuggest
                ? "Prijedlog za bazu"
                : liveTask
                  ? "Korak prema cilju"
                  : "Copilot primjetio";
              const proactiveIcon = isKbSuggest ? "📚" : liveTask ? "🎯" : "👁";
              return (
                <div key={msgKey} className="msg-row assistant">
                  <div className="msg-label proactive-label">
                    <div className="msg-label-icon proactive-icon">{proactiveIcon}</div>
                    {proactiveLabel}
                  </div>
                  <div className={`msg-bubble proactive${isKbSuggest ? " kb-suggest" : ""}`}>
                    {msg.step ? (
                      <>
                        {msg.content && <MarkdownMessage content={msg.content} />}
                        <WorklistCard steps={[msg.step]} />
                      </>
                    ) : (
                      <MarkdownMessage content={msg.content} />
                    )}
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
                  {isUser && msg.debugThumbs && msg.debugThumbs.length > 0 && (
                    <div className="debug-thumb-grid">
                      {msg.debugThumbs.map((thumb, i) => (
                        <img key={i} src={thumb} alt={`Screenshot ${i + 1}`} className="debug-thumb-small" />
                      ))}
                      <div className="msg-screenshot-label">🐛 {msg.debugThumbs.length} debug screenshota</div>
                    </div>
                  )}
                  {isUser ? (
                    msg.content
                      ? <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                      : msg.screenshotThumb
                        ? <div style={{ color: "var(--text3)", fontSize: 12, fontStyle: "italic" }}>nastavi zadatak</div>
                        : null
                  ) : (
                    <>
                      {/* Thinking collapsible — shown only when thinkingContent exists */}
                      {msg.thinkingContent && (
                        <details className="thinking-collapsible">
                          <summary className="thinking-summary">
                            <span className="thinking-arrow">▶</span>
                            <span>💭 Razmišljanje Claude-a</span>
                          </summary>
                          <div className="thinking-body">{msg.thinkingContent}</div>
                        </details>
                      )}
                      {msg.content ? (() => {
                        const planContent = !isStreaming ? parsePlanContent(msg.content) : null;
                        if (planContent) {
                          return (
                            <PlanResponseCard
                              plan={planContent}
                              onAnswer={(answer) => {
                                setInput(answer);
                                setTimeout(() => handleSend(answer), 0);
                              }}
                            />
                          );
                        }
                        const wlSteps = !isStreaming ? extractWorklist(msg.content) : null;
                        if (wlSteps) {
                          const intro = stripWorklist(msg.content);
                          return (
                            <>
                              {intro && <MarkdownMessage content={intro} />}
                              <WorklistCard steps={wlSteps} />
                            </>
                          );
                        }
                        return <MarkdownMessage content={msg.content} />;
                      })() : (
                        <div className="thinking">
                          <div className="spinner" />
                          Razmišlja...
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Proactive sumiraj banner — predloži konsolidaciju znanja nakon N poruka */}
      {messages.length > 0 && !sumirajVisible && messages.length >= sumirajThreshold &&
        (sumirajBannerAt === null || messages.length - sumirajBannerAt >= sumirajThreshold) && (
        <div className="sumiraj-banner">
          <span className="sumiraj-banner-icon">🧾</span>
          <span className="sumiraj-banner-text">
            Razgovor je dug — konsolidiraj naučena pravila parametrizacije?
          </span>
          <button
            className="sumiraj-banner-btn"
            onClick={() => {
              setSumirajBannerAt(messages.length);
              handleSumirajStart([...messages]);
            }}
          >
            Konsolidiraj znanje
          </button>
          <button
            className="sumiraj-banner-dismiss"
            title="Odbaci"
            onClick={() => setSumirajBannerAt(messages.length)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Faza 5C: Module bar — always visible when Live detects a module */}
      {sessionContext?.moduleHint && (
        <div className="module-hint-banner">
          <span>📄 Modul: <strong>{sessionContext.moduleHint}</strong>
            {moduleLoadedHint === sessionContext.moduleHint && (
              <span className="module-loaded-badge"> ✓ učitan</span>
            )}
          </span>
          <button
            className="btn-load-mac"
            disabled={moduleLoading || moduleLoadedHint === sessionContext.moduleHint}
            title={moduleLoadedHint === sessionContext.moduleHint
              ? "Modul je već učitan u bazu"
              : `Učitaj ${sessionContext.moduleHint} u bazu znanja`}
            onClick={() => loadModuleIntoKb(sessionContext.moduleHint)}
          >
            {moduleLoading ? "Učitavam..." : moduleLoadedHint === sessionContext.moduleHint ? "Učitano" : "Učitaj modul"}
          </button>
        </div>
      )}

      {/* Faza 5B: Live wizard — 3 steps */}
      {showTaskInput && (liveState === "off" || liveState === "paused") && (
        <div className="live-task-panel">
          <div className="live-wizard-steps">
            <div className={`live-wizard-step${liveRegion ? " done" : " active"}`}>
              <span className="live-wizard-num">{liveRegion ? "✓" : "①"}</span>
              <span>Regija</span>
              {liveRegion && (
                <button
                  type="button"
                  className="live-wizard-change"
                  onClick={() => { cancelTaskInput(); changeRegion(); }}
                >
                  Promijeni
                </button>
              )}
            </div>
            <div className="live-wizard-sep">›</div>
            <div className={`live-wizard-step${liveRegion ? " active" : " disabled"}`}>
              <span className="live-wizard-num">②</span>
              <span>Zadatak</span>
            </div>
            <div className="live-wizard-sep">›</div>
            <div className="live-wizard-step disabled">
              <span className="live-wizard-num">③</span>
              <span>Pokreni</span>
            </div>
          </div>

          <div className="live-task-title">
            {liveState === "paused" ? "Promijeni zadatak" : "Što treba riješiti?"}
          </div>
          <div className="live-task-hint">
            {liveState === "paused"
              ? "AI nastavlja s novim zadatkom."
              : "Opiši cilj — AI prati ekran i daje konkretne korake."}
          </div>

          <div className="live-task-chips">
            {[
              "Parametriziraj širinu police da prati [.D]",
              "Pomozi s LED / rasvjetom u konstrukciji",
              "Provjeri formule — vidi greške na ekranu",
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                className={`live-task-chip${taskInput === chip ? " selected" : ""}`}
                onClick={() => setTaskInput(chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          <textarea
            className="live-task-input"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder="ili opiši vlastiti zadatak..."
            rows={2}
          />
          <div className="live-upload-row">
            <button
              type="button"
              className="live-upload-btn"
              disabled={liveUploadStatus === "uploading"}
              onClick={() => liveFileInputRef.current?.click()}
            >
              {liveUploadStatus === "uploading" ? "⏳ Učitavam..." : "📁 Učitaj .mac / .zip / .prt (opcionalno)"}
            </button>
            {liveUploadStatus && liveUploadStatus !== "uploading" && (
              <span className={`live-upload-status ${liveUploadStatus.ok ? "ok" : "err"}`}>
                {liveUploadStatus.ok ? `✓ ${liveUploadStatus.count} datoteka(e) dodano` : `✗ ${liveUploadStatus.error}`}
              </span>
            )}
          </div>

          <div className="live-task-actions">
            {liveState === "paused" ? (
              <button
                type="button"
                className="live-task-start"
                disabled={!taskInput.trim()}
                onClick={handleUpdateTask}
              >
                Spremi zadatak
              </button>
            ) : (
              <button
                type="button"
                className="live-task-start"
                disabled={!taskInput.trim()}
                onClick={handleStartLive}
              >
                ③ Pokreni Live
              </button>
            )}
            <button type="button" className="live-task-cancel" onClick={cancelTaskInput}>
              Odustani
            </button>
          </div>
        </div>
      )}

      {/* Live 3.0: active task banner */}
      {(liveState === "running" || liveState === "paused") && liveTask && (
        <div className="live-task-banner">
          <span className="live-task-banner-text">🎯 Cilj: <strong>{liveTask}</strong></span>
          {liveState === "paused" && (
            <>
              <button
                type="button"
                className="live-task-edit"
                disabled={liveUploadStatus === "uploading"}
                onClick={() => liveFileInputRef.current?.click()}
                title="Učitaj .mac/.zip/.prt datoteku u bazu znanja"
              >
                {liveUploadStatus === "uploading" ? "⏳" : liveUploadStatus?.ok ? `✓ ${liveUploadStatus.count} dod.` : liveUploadStatus?.error ? "✗" : "📁 .mac/.zip/.prt"}
              </button>
              <button
                type="button"
                className="live-task-edit"
                onClick={() => {
                  setTaskInput(liveTask);
                  setShowTaskInput(true);
                }}
              >
                Promijeni zadatak
              </button>
            </>
          )}
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

        {/* Slash command palette — shown when input starts with / */}
        {input.trim().startsWith("/") && !stolarFormVisible && !nauciFormVisible && !sumirajVisible && !isStreaming && (
          <SlashCommandPalette
            input={input.trim()}
            onSelect={(cmd) => {
              if (cmd === "/sumiraj-znanje") {
                setInput("");
                handleSumirajStart([...messages]);
              } else if (cmd === "/nauči") {
                setInput("");
                setNauciFormVisible(true);
                setNauciStep(1);
                setNauciPitanja([]);
              } else if (cmd === "/stolar") {
                setInput("");
                setStolarFormVisible(true);
              } else if (cmd === "/debug") {
                setInput("");
                handleSend("/debug");
              } else {
                setInput(cmd + " ");
                textareaRef.current?.focus();
              }
            }}
          />
        )}

        {/* Sumiraj panel — konsolidacija znanja iz razgovora */}
        {sumirajVisible ? (
          <SumirajPanel
            stavke={sumirajStavke}
            onSave={handleSumirajSave}
            onCancel={() => { setSumirajVisible(false); setSumirajStavke([]); setSumirajLoading(false); }}
            loading={sumirajLoading}
          />
        ) : nauciFormVisible ? (
          <NauciInlineForm
            onAsk={handleNauciStart}
            onSave={handleNauciSave}
            onCancel={() => { setNauciFormVisible(false); setNauciStep(1); setNauciPitanja([]); }}
            loading={nauciLoading}
            step={nauciStep}
            pitanja={nauciPitanja}
          />
        ) : stolarFormVisible ? (
          <StolarInlineForm
            onSubmit={handleStolarSaveElectron}
            onCancel={() => setStolarFormVisible(false)}
            loading={stolarFormLoading}
          />
        ) : (
          <div className="input-row">
            <div className="input-inner">
              <textarea
                ref={textareaRef}
                className="chat-input"
                style={{ height: inputHeight }}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  liveState === "running"
                    ? "Upiši pitanje živom agentu... (Enter za slanje)"
                    : "Upiši pitanje... (Enter za slanje)"
                }
                disabled={isStreaming}
              />
              <div className="input-actions-row">
                <button
                  className={`input-btn-screenshot${screenshotDataUrl ? " active" : ""}`}
                  onClick={handleScreenshotCapture}
                  disabled={isStreaming}
                  title="Snimi ekran (F9)"
                >
                  📷
                </button>
                <button
                  className={`plan-mode-btn${planMode ? " active" : ""}`}
                  onClick={() => setPlanMode(p => !p)}
                  disabled={isStreaming}
                  title={planMode ? "Plan mode ON — Claude planira prije izvršavanja" : "Plan mode — Claude planira i pita"}
                >
                  {planMode ? "📋 Plan ON" : "📋 Plan"}
                </button>
              </div>
            </div>

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
        )}

        <div className="input-hint">F9 ekran · /sumiraj-znanje · /nauči pravila · /stolar rječnik · /istraži Bridge · Enter šalje</div>
      </div>

      {/* Single hidden file input for live .mac/.zip upload — shared by wizard and banner */}
      <input
        ref={liveFileInputRef}
        type="file"
        accept=".mac,.zip,.prt"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleLiveUpload(e.target.files)}
      />

      {showBridgeAgent && (
        <BridgePage
          onClose={() => { setShowBridgeAgent(false); bridgeQueryRef.current = ""; }}
          mtInstallPath={mtInstallPath}
          setMtInstallPath={setMtInstallPath}
          mtManifest={mtManifest}
          setMtManifest={setMtManifest}
          initialQuery={bridgeQueryRef.current}
        />
      )}

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          liveSpentUsd={liveSpentUsd}
          liveBudgetUsd={liveBudgetUsd}
          liveCallCount={liveCallCount}
          liveRegion={liveRegion}
          setLiveRegion={setLiveRegion}
          setLiveEnabled={(enabled) => {
            if (!enabled) stopLiveMode();
          }}
          setLiveSpentUsd={setLiveSpentUsd}
          setLiveCallCount={setLiveCallCount}
          setLiveBudgetUsd={setLiveBudgetUsd}
          onChangeRegion={changeRegion}
          onOpenBridge={() => setShowBridgeAgent(true)}
          sumirajThreshold={sumirajThreshold}
          onSumirajThresholdChange={(v) => {
            setSumirajThreshold(v);
            window.electron.saveSettings({ sumirajThreshold: v }).catch(() => {});
          }}
        />
      )}

      {showDebugPanel && (
        <div className="debug-overlay">
          <div className="debug-panel">
            <div className="debug-panel-header">
              <span>🐛 Debug sesija</span>
              <button className="debug-close-btn" onClick={cancelDebugSession}>✕</button>
            </div>

            <div className="debug-step">
              <div className="debug-step-label">1. Opiši problem</div>
              <textarea
                className="debug-problem-input"
                placeholder="Što ne radi? Koji dio formule ili parametre istražuješ?"
                value={debugProblem}
                onChange={(e) => setDebugProblem(e.target.value)}
                rows={3}
              />
            </div>

            <div className="debug-step">
              <div className="debug-step-label">2. Snimaj klikove u MegaTischleru</div>
              {debugState === "off" ? (
                <button
                  className="debug-action-btn debug-record-btn"
                  onClick={startDebugRecording}
                  disabled={!debugProblem.trim()}
                >
                  ⏺ Počni snimanje klikova
                </button>
              ) : (
                <div>
                  <div className="debug-recording-banner">
                    ⏺ Snimanje aktivno — klikni u MegaTischleru (max 12)
                    <span className="debug-frame-count"> {debugFrames.length}/12</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="debug-action-btn debug-stop-btn" onClick={stopDebugRecording}>
                      ⏹ Zaustavi snimanje
                    </button>
                    {debugFrames.length > 0 && (
                      <button className="debug-action-btn debug-remove-btn" onClick={removeLastDebugFrame}>
                        ✕ Ukloni zadnji
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {debugFrames.length > 0 && (
              <div className="debug-step">
                <div className="debug-step-label">3. Pregled ({debugFrames.length} screenshota)</div>
                <div className="debug-filmstrip">
                  {debugFrames.map((f) => (
                    <div key={f.index} className="debug-film-frame">
                      <img src={f.thumb} alt={`Klik ${f.index}`} />
                      <div className="debug-film-label">{f.index}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="debug-actions-row">
              <button className="debug-cancel-btn" onClick={cancelDebugSession}>Odustani</button>
              <button
                className="debug-send-btn"
                disabled={!debugProblem.trim() || debugFrames.length === 0 || isStreaming || debugState === "recording"}
                onClick={handleDebugSend}
              >
                {isStreaming ? "Šalje..." : `🔍 Pošalji na analizu (${debugFrames.length} screenshot${debugFrames.length === 1 ? "" : "a"})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mount ──────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
