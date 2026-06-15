import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, Send, Copy, Check, Loader2, X, Paperclip, FileText, GraduationCap } from "lucide-react";
import type { ChatMessage } from "@workspace/api-client-react";

// Message type extended with screenshot thumbnail, optional attached file name, system hint type, and thinking content
type ChatMessageExt = ChatMessage & { screenshotThumb?: string; attachedFileName?: string; type?: "system"; thinkingContent?: string };

// Attached document state
type AttachedFile = {
  name: string;
  sizeKb: number;
  isText: boolean;
  text?: string;
  note?: string;
};

// Stolar learning flow state
type StolarFlowState = {
  pojam: string;
  definicija: string;
  zaključci: string[];
  currentIdx: number;
  edits: Record<number, string>;
  decisions: Record<number, "ok" | "wrong">;
  saving: boolean;
};

// ── Inline markdown: **bold**, *italic*, `code` ───────────────────────────
function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g);
  return tokens.map((token, i) => {
    if (!token) return null;
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("*") && token.endsWith("*") && token.length > 2 && !token.startsWith("**")) {
      return <em key={i} className="italic">{token.slice(1, -1)}</em>;
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-zinc-800/90 border border-zinc-700/60 font-mono text-[11.5px] text-amber-200 leading-none"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return token;
  });
}

// ── Block-level text renderer ─────────────────────────────────────────────
const TextBlock = ({ text }: { text: string }) => {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let ulItems: string[] = [];
  let olItems: Array<{ num: string; content: string }> = [];
  let paraLines: string[] = [];

  const flushUL = () => {
    if (!ulItems.length) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="space-y-1.5 my-0.5">
        {ulItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
            <span className="flex-1 leading-relaxed">{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    ulItems = [];
  };

  const flushOL = () => {
    if (!olItems.length) return;
    elements.push(
      <ol key={`ol-${elements.length}`} className="space-y-1.5 my-0.5">
        {olItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-[1px] text-[11px] font-mono text-primary/70 flex-shrink-0 min-w-[1.4em] text-right leading-relaxed">
              {item.num}.
            </span>
            <span className="flex-1 leading-relaxed">{renderInline(item.content)}</span>
          </li>
        ))}
      </ol>
    );
    olItems = [];
  };

  const flushPara = () => {
    if (!paraLines.length) return;
    const joined = paraLines.join("\n");
    elements.push(
      <p key={`p-${elements.length}`} className="leading-relaxed whitespace-pre-line">
        {renderInline(joined)}
      </p>
    );
    paraLines = [];
  };

  const flushAll = () => { flushUL(); flushOL(); flushPara(); };

  for (const line of lines) {
    // Heading ## / ###
    const hMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      flushAll();
      const level = hMatch[1].length;
      const cls =
        level === 1
          ? "text-[14px] font-bold text-foreground pb-1 border-b border-border/40 mt-1"
          : level === 2
          ? "text-[13px] font-semibold text-foreground mt-1"
          : "text-[13px] font-medium text-foreground/90";
      elements.push(
        <div key={`h-${elements.length}`} className={cls}>
          {renderInline(hMatch[2])}
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushAll();
      elements.push(<hr key={`hr-${elements.length}`} className="border-border/50 my-1" />);
      continue;
    }

    // Unordered list item: - item  or  * item
    const ulMatch = line.match(/^[\-\*•]\s+(.+)$/);
    if (ulMatch) {
      flushOL(); flushPara();
      ulItems.push(ulMatch[1]);
      continue;
    }

    // Ordered list item: 1. item  or  1) item
    const olMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      flushUL(); flushPara();
      olItems.push({ num: olMatch[1], content: olMatch[2] });
      continue;
    }

    // Empty line → flush everything
    if (!line.trim()) {
      flushAll();
      continue;
    }

    // Regular paragraph line
    flushUL(); flushOL();
    paraLines.push(line);
  }

  flushAll();

  return <div className="space-y-2">{elements}</div>;
};

// ── Worklist (structured steps from AI) ───────────────────────────────────
type WorklistStep = { title?: string; where?: string; formula?: string | null; hint?: string | null };

function extractWorklist(content: string): WorklistStep[] | null {
  const m = content.match(/```worklist\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim()) as { steps?: WorklistStep[] };
    if (Array.isArray(parsed.steps) && parsed.steps.length > 0) return parsed.steps;
  } catch { /* ignore */ }
  return null;
}

function stripWorklist(content: string): string {
  return content.replace(/```worklist[\s\S]*?```/g, "").trim();
}

// Detect Electron context
const isElectron = typeof window !== "undefined" && !!(window as Window & { electron?: unknown }).electron;

type InjectState = "idle" | "loading" | "ok" | "err";

function WorklistFormulaInline({ formula }: { formula: string }) {
  const [copied, setCopied] = useState(false);
  const [injectState, setInjectState] = useState<InjectState>("idle");
  const [injectErr, setInjectErr] = useState("");

  const handleInject = async () => {
    if (injectState === "loading") return;
    setInjectState("loading");
    setInjectErr("");
    try {
      const el = (window as Window & { electron?: { injectFormula?: (f: string) => Promise<{ ok: boolean; error?: string }> } }).electron;
      const result = await el?.injectFormula?.(formula);
      if (result?.ok) {
        setInjectState("ok");
        setTimeout(() => setInjectState("idle"), 2500);
      } else {
        setInjectErr(result?.error ?? "Greška");
        setInjectState("err");
        setTimeout(() => { setInjectState("idle"); setInjectErr(""); }, 3500);
      }
    } catch (e) {
      setInjectErr(String(e));
      setInjectState("err");
      setTimeout(() => { setInjectState("idle"); setInjectErr(""); }, 3500);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-1 px-2 py-1 rounded border border-border bg-zinc-950/80 flex-wrap">
      <span className="text-[10px] font-bold uppercase text-muted-foreground shrink-0">Formula</span>
      <code className="flex-1 min-w-0 font-mono text-[12px] text-amber-200/90 break-all">{formula}</code>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(formula);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border bg-muted/50 hover:border-primary"
        >
          {copied ? "✓ Kopirano" : "Kopiraj"}
        </button>
        {isElectron && (
          <button
            type="button"
            onClick={handleInject}
            disabled={injectState === "loading"}
            title={injectErr || "Upiši formulu direktno u aktivno polje MegaTischlera"}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors ${
              injectState === "ok"
                ? "border-green-600 bg-green-600/20 text-green-400"
                : injectState === "err"
                  ? "border-red-500 bg-red-500/20 text-red-400"
                  : injectState === "loading"
                    ? "border-border bg-muted/30 text-muted-foreground cursor-wait"
                    : "border-border bg-muted/50 hover:border-amber-500 hover:text-amber-300"
            }`}
          >
            {injectState === "loading" ? "⏳" : injectState === "ok" ? "✓ Upisano" : injectState === "err" ? "✗ Greška" : "🖊 Upiši"}
          </button>
        )}
      </div>
      {injectState === "err" && injectErr && (
        <span className="w-full text-[10px] text-red-400 mt-0.5">{injectErr}</span>
      )}
    </div>
  );
}

function WorklistCard({ steps }: { steps: WorklistStep[] }) {
  const [done, setDone] = useState(() => new Array(steps.length).fill(false));

  return (
    <div className="mt-2 rounded-md border border-border overflow-hidden text-xs">
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/40 border-b border-border">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Radni list</span>
        <span className="text-[10px] text-muted-foreground">{steps.length} korak{steps.length === 1 ? "" : "a"}</span>
      </div>
      {steps.map((step, i) => {
        const formula = step.formula?.trim();
        return (
          <div
            key={i}
            className={`flex gap-2 px-2 py-1.5 border-b border-border last:border-b-0 bg-card/30 ${done[i] ? "opacity-50" : ""}`}
          >
            <button
              type="button"
              className={`w-5 h-5 shrink-0 mt-0.5 rounded border text-[10px] font-bold flex items-center justify-center ${done[i] ? "bg-green-600/80 border-green-600 text-white" : "border-border bg-muted/30"}`}
              onClick={() => setDone((prev) => { const n = [...prev]; n[i] = !n[i]; return n; })}
              aria-pressed={done[i]}
            >
              {done[i] ? "✓" : i + 1}
            </button>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className={`font-semibold text-[12px] leading-snug ${done[i] ? "line-through" : ""}`}>
                {step.title}
              </div>
              {step.where && (
                <div className="flex gap-2 leading-snug">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground shrink-0 w-10">Gdje</span>
                  <span className="text-[11px] text-muted-foreground">{step.where}</span>
                </div>
              )}
              {step.hint && (
                <div className="flex gap-2 leading-snug">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground shrink-0 w-10">Zašto</span>
                  <span className="text-[11px] text-foreground/80">{step.hint}</span>
                </div>
              )}
              {formula && <WorklistFormulaInline formula={formula} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Full markdown message ─────────────────────────────────────────────────
const MarkdownMessage = ({ content }: { content: string }) => {
  // Split code fences out first, process rest as text blocks
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 text-sm">
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
};

// ── Code block with copy button ───────────────────────────────────────────
const CodeBlock = ({ code, lang }: { code: string; lang: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-md bg-zinc-950 border border-border overflow-hidden my-2">
      <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-b border-border">
        <span className="text-xs text-zinc-400 font-mono">{lang || "kod"}</span>
        <button
          onClick={handleCopy}
          className="text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1 text-xs"
          title="Kopiraj"
          data-testid="copy-code-button"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Kopirano" : "Kopiraj"}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="text-[13px] leading-relaxed font-mono text-zinc-300">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

// ── Stolar: zaključak review card ─────────────────────────────────────────
function StolarInferCard({
  flow,
  onDecide,
  onEdit,
  onSave,
  onCancel,
}: {
  flow: StolarFlowState;
  onDecide: (idx: number, decision: "ok" | "wrong") => void;
  onEdit: (idx: number, text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [editText, setEditText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const { zaključci, currentIdx, decisions, edits, saving } = flow;
  const allDecided = currentIdx >= zaključci.length;
  const prihvaćeniCount = Object.values(decisions).filter((d) => d === "ok").length;

  if (allDecided) {
    return (
      <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <GraduationCap className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-primary truncate">Učim od tebe: {flow.pojam}</span>
        </div>
        <div className="text-xs text-muted-foreground mb-2">
          Pregled prije pohrane — prihvaćeno <strong>{prihvaćeniCount}</strong> od {zaključci.length} zaključaka:
        </div>
        <div className="mb-3 space-y-1">
          {zaključci.map((zakl, idx) => {
            const decision = decisions[idx];
            const edited = edits[idx];
            const isOk = decision === "ok";
            const isWrong = decision === "wrong";
            const wasEdited = isOk && edited !== undefined && edited !== zakl;
            return (
              <div
                key={idx}
                className={`flex items-start gap-2 rounded px-2 py-1.5 text-[11px] leading-snug ${
                  isWrong
                    ? "bg-red-500/8 border border-red-500/20"
                    : "bg-green-600/8 border border-green-600/20"
                }`}
              >
                <span className={`mt-0.5 shrink-0 font-bold ${isWrong ? "text-red-400" : "text-green-400"}`}>
                  {isWrong ? "✗" : "✓"}
                </span>
                <div className="flex-1 min-w-0">
                  {wasEdited ? (
                    <>
                      <span className="line-through text-muted-foreground/60 break-words">{zakl}</span>
                      <span className="mx-1.5 text-muted-foreground/50">→</span>
                      <span className="text-foreground break-words">{edited}</span>
                    </>
                  ) : (
                    <span className={isWrong ? "line-through text-muted-foreground/50 break-words" : "text-foreground/90 break-words"}>
                      {edited ?? zakl}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="text-xs h-7" onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            Spremi
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={onCancel} disabled={saving}>
            Odustani
          </Button>
        </div>
      </div>
    );
  }

  const currentZakl = zaključci[currentIdx];

  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-primary">Učim od tebe: {flow.pojam}</span>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{currentIdx + 1}/{zaključci.length}</span>
      </div>
      <div className="text-[11px] text-muted-foreground/70 italic mb-2 leading-relaxed truncate">
        „{flow.definicija}"
      </div>
      <div className="text-xs leading-snug bg-muted/30 rounded p-2 mb-2.5">
        {edits[currentIdx] ?? currentZakl}
      </div>
      {isEditing ? (
        <div className="space-y-1.5">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="text-xs min-h-[56px] resize-none"
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="text-[10px] h-6 px-2"
              onClick={() => { onEdit(currentIdx, editText); setIsEditing(false); setEditText(""); }}
              disabled={!editText.trim()}
            >
              Potvrdi ispravak
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-[10px] h-6 px-2"
              onClick={() => { setIsEditing(false); setEditText(""); }}
            >
              Odustani
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => onDecide(currentIdx, "ok")}
            className="text-[11px] px-2.5 py-1 rounded-md border border-green-600/40 bg-green-600/10 text-green-400 hover:bg-green-600/20 font-medium transition-colors"
          >
            ✓ Točno
          </button>
          <button
            onClick={() => onDecide(currentIdx, "wrong")}
            className="text-[11px] px-2.5 py-1 rounded-md border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium transition-colors"
          >
            ✗ Netočno
          </button>
          <button
            onClick={() => { setIsEditing(true); setEditText(edits[currentIdx] ?? currentZakl); }}
            className="text-[11px] px-2.5 py-1 rounded-md border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-primary/40 font-medium transition-colors"
          >
            ✏ Ispravi
          </button>
        </div>
      )}
    </div>
  );
}

// ── Plan mode: parse and render structured plan + A/B/C/D questions ────────
interface PlanContent {
  preText: string;
  planText: string;
  questionBlocks: { question: string; options: { letter: string; text: string }[] }[];
}

function parsePlanContent(content: string): PlanContent | null {
  if (!content.includes("**PLAN:**")) return null;
  const planIdx = content.indexOf("**PLAN:**");
  const qIdx = content.indexOf("**PITANJA:**");
  const preText = content.slice(0, planIdx).trim();
  const planText = (qIdx > -1
    ? content.slice(planIdx + 8, qIdx)
    : content.slice(planIdx + 8)
  ).trim();
  const questionText = qIdx > -1 ? content.slice(qIdx + 12).trim() : "";
  const questionBlocks: { question: string; options: { letter: string; text: string }[] }[] = [];
  if (questionText) {
    let curQ = "";
    let curOpts: { letter: string; text: string }[] = [];
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

function PlanResponseCard({ plan, onAnswer }: { plan: PlanContent; onAnswer: (msg: string) => void }) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  return (
    <div className="space-y-3">
      {plan.preText && <MarkdownMessage content={plan.preText} />}
      <div className="border-l-4 border-primary bg-primary/5 rounded-r-lg p-4">
        <div className="text-xs font-semibold text-primary mb-2 uppercase tracking-wider">📋 Plan</div>
        <MarkdownMessage content={plan.planText} />
      </div>
      {plan.questionBlocks.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">❓ Pitanja</div>
          {plan.questionBlocks.map((block, qi) => (
            <div key={qi} className="space-y-2">
              <div className="text-sm text-foreground">{qi + 1}. {block.question}</div>
              <div className="flex flex-wrap gap-2">
                {block.options.map((opt) => (
                  <button
                    key={opt.letter}
                    onClick={() => {
                      if (selected[qi]) return;
                      setSelected(prev => ({ ...prev, [qi]: opt.letter }));
                      onAnswer(`${block.question}\n→ ${opt.letter}) ${opt.text}`);
                    }}
                    disabled={!!selected[qi]}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      selected[qi] === opt.letter
                        ? "bg-primary text-primary-foreground border-primary"
                        : selected[qi]
                        ? "opacity-40 border-border text-muted-foreground cursor-default"
                        : "border-border text-foreground hover:bg-accent hover:border-primary/50 cursor-pointer"
                    }`}
                  >
                    <span className="font-semibold mr-1">{opt.letter})</span>{opt.text}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stolar: inline popup when AI asks about an unknown term ────────────────
function PojamPitanje({
  pojam,
  onAnswer,
  onDismiss,
}: {
  pojam: string;
  onAnswer: (definicija: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const [val, setVal] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!val.trim() || loading) return;
    setLoading(true);
    await onAnswer(val.trim());
    setLoading(false);
  };

  return (
    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
      <div className="text-[11px] font-semibold text-amber-400/90 mb-2 flex items-center gap-1.5">
        🤔 Što je „{pojam}" u stolariji?
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          className="flex-1 min-w-0 text-xs bg-background border border-border rounded px-2 py-1 outline-none focus:border-primary/50 transition-colors"
          placeholder="Upiši definiciju..."
          disabled={loading}
          autoFocus
        />
        <button
          onClick={handleSubmit}
          disabled={!val.trim() || loading}
          className="text-[11px] font-medium px-3 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 shrink-0 transition-colors"
        >
          {loading ? "..." : "Objasni"}
        </button>
        <button
          onClick={onDismiss}
          className="text-[11px] px-2 py-1 rounded hover:bg-muted/50 text-muted-foreground shrink-0 transition-colors"
        >
          Preskači
        </button>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessageExt[]>([]);
  const [input, setInput] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [stolarFlow, setStolarFlow] = useState<StolarFlowState | null>(null);
  const [stolarLoading, setStolarLoading] = useState(false);
  const [answeredPojmovi, setAnsweredPojmovi] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleScreenshotSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setScreenshotDataUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDocSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (docInputRef.current) docInputRef.current.value = "";

    const name = file.name;
    const sizeKb = Math.round((file.size / 1024) * 10) / 10;
    const TEXT_EXTS = new Set(['.txt', '.mac', '.prt', '.def', '.cfg', '.ini', '.md', '.log', '.csv']);
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    const isText = TEXT_EXTS.has(ext);

    // Electron env: IPC handler reads file from local path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elec = (window as any).electron;
    if (elec?.readAttachment) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filePath = (file as any).path as string | undefined;
      if (filePath) {
        const result = await elec.readAttachment({ fullPath: filePath, filename: name });
        if (result.ok) {
          setAttachedFile({
            name,
            sizeKb: Math.round((result.sizeBytes / 1024) * 10) / 10,
            isText: result.isText as boolean,
            text: result.text as string | undefined,
            note: result.isText ? undefined : "Binarna datoteka — sadržaj nije dostupan kao tekst",
          });
        }
        return;
      }
    }

    // Web / fallback: FileReader
    if (isText) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachedFile({ name, sizeKb, isText: true, text: ev.target?.result as string });
      };
      reader.readAsText(file, "utf-8");
    } else {
      setAttachedFile({ name, sizeKb, isText: false, note: "Binarna datoteka — sadržaj nije dostupan kao tekst" });
    }
  };

  // Strip data URL prefix to get raw base64 for the API
  const extractBase64 = (dataUrl: string): string => {
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    return match ? match[1] : dataUrl;
  };

  // ── Stolar handlers ───────────────────────────────────────────────────────

  const handleStolarCommand = async (pojam: string, definicija: string) => {
    setStolarLoading(true);
    try {
      const res = await fetch("/api/stolar/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pojam, definicija }),
      });
      if (!res.ok) throw new Error("infer failed");
      const data = await res.json() as { zaključci?: string[] };
      setStolarFlow({
        pojam,
        definicija,
        zaključci: data.zaključci ?? [],
        currentIdx: 0,
        edits: {},
        decisions: {},
        saving: false,
      });
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "⚠️ Greška pri generiranju zaključaka. Pokušaj ponovo." },
      ]);
    } finally {
      setStolarLoading(false);
    }
  };

  const handleStolarDecide = (idx: number, decision: "ok" | "wrong") => {
    setStolarFlow(prev =>
      prev ? { ...prev, decisions: { ...prev.decisions, [idx]: decision }, currentIdx: idx + 1 } : null
    );
  };

  const handleStolarEdit = (idx: number, text: string) => {
    setStolarFlow(prev =>
      prev
        ? {
            ...prev,
            edits: { ...prev.edits, [idx]: text },
            decisions: { ...prev.decisions, [idx]: "ok" },
            currentIdx: idx + 1,
          }
        : null
    );
  };

  const handleStolarSave = async () => {
    if (!stolarFlow) return;
    setStolarFlow(prev => (prev ? { ...prev, saving: true } : null));
    const prihvaćeni: string[] = [];
    for (let i = 0; i < stolarFlow.zaključci.length; i++) {
      if (stolarFlow.decisions[i] === "ok") {
        prihvaćeni.push(stolarFlow.edits[i] ?? stolarFlow.zaključci[i]);
      }
    }
    try {
      await fetch("/api/stolar/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pojam: stolarFlow.pojam,
          definicija: stolarFlow.definicija,
          zaključci: prihvaćeni,
        }),
      });
      const n = prihvaćeni.length;
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `Naučio sam **${n}** zaključak${n === 1 ? "" : "a"} o pojmu **${stolarFlow.pojam}**. Koristit ću ovo znanje u budućim odgovorima.`,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "⚠️ Greška pri zapisivanju stolarskog znanja." },
      ]);
    } finally {
      setStolarFlow(null);
    }
  };

  const handlePojamAnswer = async (msgIdx: number, pojam: string, definicija: string) => {
    try {
      const inferRes = await fetch("/api/stolar/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pojam, definicija }),
      });
      const inferData = await inferRes.json() as { zaključci?: string[] };
      const zaključci = inferData.zaključci ?? [];

      await fetch("/api/stolar/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pojam, definicija, zaključci }),
      });

      setAnsweredPojmovi(prev => new Set([...prev, msgIdx]));
      const n = zaključci.length;
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `Hvala! Zapamtio sam **${n}** zaključak${n === 1 ? "" : "a"} o pojmu **${pojam}**. Koristit ću ovo znanje u svim budućim odgovorima.`,
        },
      ]);
    } catch {
      setAnsweredPojmovi(prev => new Set([...prev, msgIdx]));
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "⚠️ Greška pri zapisivanju pojma." },
      ]);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  const addSystemHint = (content: string) => {
    setMessages(prev => [...prev, { role: "assistant", content, type: "system" } as ChatMessageExt]);
    setInput("");
  };

  const handleSend = async () => {
    // Slash command router — intercept before sending to AI
    const trimmed = input.trimStart();
    if (trimmed.startsWith("/")) {
      const lower = trimmed.toLowerCase();

      // /stolar with no argument → show usage hint
      if (lower === "/stolar" || lower.startsWith("/stolar ") && trimmed.slice(8).trim() === "") {
        addSystemHint("💡 Koristi: `/stolar [pojam] [definicija]` — npr. `/stolar radijus Polumjer luka u formuli`");
        return;
      }

      // /istraži — Electron only
      if (lower.startsWith("/istraži")) {
        addSystemHint("ℹ️ Naredba `/istraži` dostupna je samo u desktop (Electron) aplikaciji.");
        return;
      }

      // /debug — Electron only
      if (lower.startsWith("/debug")) {
        addSystemHint("ℹ️ Naredba `/debug` dostupna je samo u desktop (Electron) aplikaciji.");
        return;
      }

      // /stolar with argument — falls through to existing handler below
      if (!lower.startsWith("/stolar ")) {
        // Unknown slash command catch-all
        addSystemHint("❓ Nepoznata naredba. Dostupna naredba u web chatu: `/stolar [pojam]`");
        return;
      }
    }

    // /stolar command: teach the AI a carpentry term
    if (input.trimStart().toLowerCase().startsWith("/stolar ")) {
      const rest = input.trimStart().slice(8).trim();
      if (!rest) return;
      const firstSpace = rest.indexOf(" ");
      const pojam = firstSpace > 0 ? rest.slice(0, firstSpace) : rest;
      const definicija = rest;
      setMessages(prev => [...prev, { role: "user", content: `/stolar ${rest}` }]);
      setInput("");
      await handleStolarCommand(pojam, definicija);
      return;
    }

    if (!input.trim() && !screenshotDataUrl && !attachedFile) return;

    const currentScreenshot = screenshotDataUrl;
    const currentFile = attachedFile;
    const userMsg: ChatMessageExt = {
      role: "user",
      content: input.trim(),
      ...(currentScreenshot ? { screenshotThumb: currentScreenshot } : {}),
      ...(currentFile ? { attachedFileName: currentFile.name } : {}),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setScreenshotDataUrl(null);
    setAttachedFile(null);
    setIsStreaming(true);

    // Add placeholder assistant message
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      // Build history (exclude the just-added user msg and empty assistant placeholder)
      const historyForApi = nextMessages
        .slice(0, -0) // all messages up to current
        .slice(-11, -1) // last 10 before current user msg
        .map(m => ({ role: m.role, content: m.content }));

      const body: {
        message: string;
        history: { role: string; content: string }[];
        screenshot_base64?: string;
        file_content?: { name: string; text?: string; note?: string };
        plan_mode?: boolean;
      } = {
        message: userMsg.content,
        history: historyForApi,
      };

      if (currentScreenshot) {
        body.screenshot_base64 = extractBase64(currentScreenshot);
      }

      if (currentFile) {
        body.file_content = currentFile.isText
          ? { name: currentFile.name, text: currentFile.text }
          : { name: currentFile.name, note: currentFile.note };
      }

      if (planMode) {
        body.plan_mode = true;
        setPlanMode(false);
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Veza s AI-jem nije uspjela");
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

        // Process only complete lines (terminated by \n)
        const newlineIdx = lineBuffer.lastIndexOf("\n");
        if (newlineIdx === -1) continue;

        const complete = lineBuffer.slice(0, newlineIdx + 1);
        lineBuffer = lineBuffer.slice(newlineIdx + 1);

        const lines = complete.split("\n").filter(l => l.startsWith("data: "));

        for (const line of lines) {
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (data.done) { streamDone = true; break; }
            if (data.error) {
              assistantContent += `\n\n⚠️ ${data.error}`;
            } else if (data.thinking) {
              thinkingContent += data.thinking;
            } else if (data.content) {
              assistantContent += data.content;
            }
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
                ...(thinkingContent ? { thinkingContent } : {}),
              } as ChatMessageExt;
              return updated;
            });
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Nepoznata greška";
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `⚠️ Greška: ${msg}`,
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background" data-testid="chat-panel">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-4">
            <div className="max-w-md space-y-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
                <span className="text-primary text-xl font-bold font-mono">MT</span>
              </div>
              <h2 className="text-xl font-semibold">MegaTischler Copilot</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Spreman za pisanje parametarskih formula.<br />
                Postavi pitanje ili priloži screenshot dijaloga parametara.
              </p>
              <div className="text-xs text-muted-foreground/60 space-y-1 font-mono text-left bg-muted/20 rounded-md p-3 border border-border">
                <div className="text-muted-foreground/40 mb-2">// primjeri upita</div>
                <div>"Zašto mi polica ne prati D?"</div>
                <div>"Formula za širinu vrata s luftom"</div>
                <div>"Objasni [.D]-[.GLU]-20"</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto pb-4">
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const isSystem = (msg as ChatMessageExt).type === "system";
              const hasScreenshot = !!msg.screenshotThumb;

              // System hint messages — compact, dim, no AI header
              if (isSystem) {
                return (
                  <div key={i} className="flex justify-center" data-testid={`message-${i}`}>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 border border-border/40 text-[12px] text-muted-foreground max-w-[90%]">
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`} data-testid={`message-${i}`}>
                  <div className={`${isUser ? "max-w-[80%]" : "w-full"}`}>
                    {!isUser && (
                      <div className="flex items-center gap-2 mb-2 text-[11px] font-medium text-primary uppercase tracking-wider">
                        <span className="w-4 h-4 rounded bg-primary/20 flex items-center justify-center text-[9px] font-bold">MT</span>
                        Copilot
                      </div>
                    )}

                    {/* User message bubble */}
                    {isUser && (
                      <div className="bg-accent text-accent-foreground px-4 py-3 rounded-2xl rounded-tr-sm">
                        {/* Screenshot thumbnail inside bubble */}
                        {hasScreenshot && (
                          <div className="mb-3">
                            <img
                              src={msg.screenshotThumb}
                              alt="Screenshot"
                              className="max-w-[240px] max-h-[160px] object-contain rounded-md border border-white/10"
                              data-testid={`screenshot-thumb-${i}`}
                            />
                            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-accent-foreground/60">
                              <span>📷</span>
                              <span>priložen screenshot</span>
                            </div>
                          </div>
                        )}
                        {/* Attached file chip inside bubble */}
                        {msg.attachedFileName && (
                          <div className="mb-2 flex items-center gap-1.5 text-[11px] bg-black/10 rounded-md px-2 py-1 w-fit max-w-full">
                            <FileText className="w-3 h-3 shrink-0 opacity-70" />
                            <span className="truncate opacity-80">{msg.attachedFileName}</span>
                          </div>
                        )}
                        {msg.content && (
                          <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                        )}
                      </div>
                    )}

                    {/* Assistant message */}
                    {!isUser && (
                      <div className="text-foreground">
                        {/* Thinking collapsible — shown only when thinkingContent exists */}
                        {(msg as ChatMessageExt).thinkingContent && (
                          <details className="mb-3 group">
                            <summary className="cursor-pointer select-none list-none flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors w-fit">
                              <span className="group-open:rotate-90 transition-transform inline-block text-[10px]">▶</span>
                              <span>💭 Razmišljanje Claude-a</span>
                            </summary>
                            <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/30 text-[11px] font-mono text-muted-foreground/80 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                              {(msg as ChatMessageExt).thinkingContent}
                            </div>
                          </details>
                        )}
                        {msg.content ? (() => {
                          // Detect [POJAM: naziv] marker — only first occurrence
                          const pojamMatch = !isStreaming
                            ? msg.content.match(/\[POJAM:\s*([^\]]+)\]/)
                            : null;
                          const cleanContent = pojamMatch
                            ? msg.content.replace(/\[POJAM:\s*[^\]]+\]/g, "").trim()
                            : msg.content;

                          // Plan response takes priority over worklist
                          const planContent = !isStreaming ? parsePlanContent(cleanContent) : null;
                          const wlSteps = !isStreaming && !planContent ? extractWorklist(cleanContent) : null;
                          const mainNode = planContent
                            ? <PlanResponseCard plan={planContent} onAnswer={(msg) => {
                                setInput(msg);
                                setTimeout(() => handleSend(), 0);
                              }} />
                            : wlSteps
                            ? (() => {
                                const intro = stripWorklist(cleanContent);
                                return (
                                  <>
                                    {intro ? <MarkdownMessage content={intro} /> : null}
                                    <WorklistCard steps={wlSteps} />
                                  </>
                                );
                              })()
                            : <MarkdownMessage content={cleanContent} />;

                          return (
                            <>
                              {mainNode}
                              {pojamMatch && !answeredPojmovi.has(i) && (
                                <PojamPitanje
                                  pojam={pojamMatch[1].trim()}
                                  onAnswer={(def) =>
                                    handlePojamAnswer(i, pojamMatch[1].trim(), def)
                                  }
                                  onDismiss={() =>
                                    setAnsweredPojmovi(prev => new Set([...prev, i]))
                                  }
                                />
                              )}
                            </>
                          );
                        })() : (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Razmišlja...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto">
          {/* File attachment preview chip */}
          {attachedFile && (
            <div className="mb-2 flex items-center gap-3 bg-muted/30 rounded-lg p-2 border border-border">
              <div className="w-8 h-8 rounded border border-border bg-muted/50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{attachedFile.name}</div>
                <div className="text-xs text-muted-foreground">
                  {attachedFile.sizeKb} KB · {attachedFile.isText ? "tekst" : "binarna datoteka"}
                </div>
              </div>
              <button
                onClick={() => setAttachedFile(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Ukloni datoteku"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Screenshot preview above input */}
          {screenshotDataUrl && (
            <div className="mb-3 flex items-start gap-3 bg-muted/30 rounded-lg p-2 border border-border">
              <img
                src={screenshotDataUrl}
                alt="Screenshot za slanje"
                className="w-16 h-16 object-contain rounded border border-border bg-black/40 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">Screenshot priložen</div>
                <div className="text-xs text-muted-foreground">Bit će poslan uz sljedeću poruku</div>
              </div>
              <button
                onClick={() => setScreenshotDataUrl(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Ukloni screenshot"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Stolar learning flow panel */}
          {(stolarLoading || stolarFlow) && (
            <div className="mb-3">
              {stolarLoading && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  Generiram zaključke o pojmu...
                </div>
              )}
              {stolarFlow && !stolarLoading && (
                <StolarInferCard
                  flow={stolarFlow}
                  onDecide={handleStolarDecide}
                  onEdit={handleStolarEdit}
                  onSave={handleStolarSave}
                  onCancel={() => setStolarFlow(null)}
                />
              )}
            </div>
          )}

          <div className="flex items-end gap-2 bg-card border border-border rounded-xl p-2 focus-within:ring-1 focus-within:ring-primary shadow-sm">
            {/* Hidden screenshot input */}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleScreenshotSelect}
              data-testid="screenshot-file-input"
            />
            {/* Hidden document input */}
            <input
              type="file"
              accept=".txt,.mac,.prt,.def,.cfg,.ini,.pdf,.zip,.mdb,.bhr,.md,.log,.csv"
              className="hidden"
              ref={docInputRef}
              onChange={handleDocSelect}
              data-testid="doc-file-input"
            />

            {/* Screenshot button */}
            <Button
              variant="ghost"
              size="icon"
              className={`shrink-0 rounded-lg transition-colors ${screenshotDataUrl ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Priloži screenshot (Pogledaj ekran)"
              data-testid="screenshot-button"
            >
              <ImageIcon className="w-5 h-5" />
            </Button>

            {/* Document attach button */}
            <Button
              variant="ghost"
              size="icon"
              className={`shrink-0 rounded-lg transition-colors ${attachedFile ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => docInputRef.current?.click()}
              disabled={isStreaming}
              title="Priloži datoteku (.mac, .txt, .pdf, ...)"
              data-testid="attach-button"
            >
              <Paperclip className="w-5 h-5" />
            </Button>

            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Upiši poruku... (Enter za slanje, Shift+Enter za novi red)"
              className="min-h-[44px] max-h-36 resize-none border-0 focus-visible:ring-0 shadow-none bg-transparent p-2 text-sm"
              disabled={isStreaming}
              data-testid="chat-input"
            />

            {/* Plan mode toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPlanMode(p => !p)}
              disabled={isStreaming}
              title={planMode ? "Plan mode uključen — Claude će planirati prije izvršavanja" : "Uključi Plan mode"}
              className={`shrink-0 rounded-lg text-xs px-2.5 h-9 transition-colors ${planMode ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="plan-mode-button"
            >
              📋 Plan
            </Button>

            <Button
              onClick={handleSend}
              disabled={(!input.trim() && !screenshotDataUrl && !attachedFile) || isStreaming || stolarLoading || !!stolarFlow}
              className="shrink-0 rounded-lg mb-0.5"
              data-testid="send-button"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1.5" />
              )}
              Pošalji
            </Button>
          </div>

          <div className="text-center mt-2 text-[10px] text-muted-foreground/50">
            Shift+Enter za novi red · Enter za slanje · Claude claude-opus-4-8
          </div>
        </div>
      </div>
    </div>
  );
}
