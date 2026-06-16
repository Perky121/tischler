import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageIcon, Send, Copy, Check, Loader2, X, Paperclip, FileText, GraduationCap, Box, PanelRightClose, PanelRightOpen, Trash2, ChevronRight, ChevronDown, Save, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { useGetRules, useSaveRules, useGetFormulaPrompt, useSaveFormulaPrompt } from "@workspace/api-client-react";
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

const VIEWER_MODULES = ["KUH_VISOKI", "VISECI", "OTVORENI", "PECNICA", "PERILICA", "MIKROVALNA", "NAPA", "KUTNI_VANJSKI"];

const MODULE_LABELS_HR: Record<string, string> = {
  KUH_VISOKI: "Visoki element",
  VISECI: "Viseći element",
  OTVORENI: "Otvoreni regal",
  PECNICA: "Stupac za pećnicu",
  PERILICA: "Kućište za perilicu",
  MIKROVALNA: "Viseći s mikrovalnom",
  NAPA: "Kućište za napu",
  KUTNI_VANJSKI: "Kutni element",
};

type ParamEntry = { id: string; module: string; W: number; H: number; D: number; ts: number };

type KbFormula = { formula: string; source: string; module: string; type?: string };

const TYPE_LABELS_HR: Record<string, string> = {
  dimenzija: "Dimenzije",
  pozicija: "Pozicije",
  uvjet: "Uvjeti",
  ukljucenje: "Uključenja",
  referenca: "Reference",
  rotacija: "Rotacije",
};

const ALL_KB_MODULES = [
  "KUH_VISOKI", "VISECI", "OTVORENI", "PECNICA", "PERILICA",
  "MIKROVALNA", "NAPA", "KUTNI_VANJSKI", "KUTNI",
  "ORMAR", "ORMAR_U", "NADGRADE", "OSNOVNI", "EL_PUNA_LEDA", "KUTIJA",
];

function parseDimsFromText(text: string): { module: string; W?: number; H?: number; D?: number } | null {
  // Find the LAST module name mentioned — later corrections win
  let mod = "";
  let modIdx = -1;
  for (const m of VIEWER_MODULES) {
    const idx = text.lastIndexOf(m);
    if (idx > modIdx) { modIdx = idx; mod = m; }
  }
  // Find the LAST occurrence of each dimension — later corrections override earlier ones
  const allW = [...text.matchAll(/(?:^|[^A-Za-z_])W=(\d+)/g)];
  const allH = [...text.matchAll(/(?:^|[^A-Za-z_])H=(\d+)/g)];
  const allD = [...text.matchAll(/(?:^|[^A-Za-z_])D=(\d+)/g)];
  const lastW = allW.length > 0 ? allW[allW.length - 1] : null;
  const lastH = allH.length > 0 ? allH[allH.length - 1] : null;
  const lastD = allD.length > 0 ? allD[allD.length - 1] : null;
  if (!mod && !lastW && !lastH && !lastD) return null;
  return {
    module: mod,
    ...(lastW !== null ? { W: parseInt(lastW[1], 10) } : {}),
    ...(lastH !== null ? { H: parseInt(lastH[1], 10) } : {}),
    ...(lastD !== null ? { D: parseInt(lastD[1], 10) } : {}),
  };
}

function buildViewer3DUrl(steps: WorklistStep[]): string | null {
  let mod = "";
  let W: number | undefined;
  let H: number | undefined;
  let D: number | undefined;

  for (const step of steps) {
    const text = [step.formula, step.title, step.hint, step.where].filter(Boolean).join(" ");
    if (!mod && step.where) {
      for (const m of VIEWER_MODULES) {
        if (step.where.includes(m)) { mod = m; break; }
      }
    }
    const wm = text.match(/(?:^|[^A-Za-z_])W=(\d+)/);
    const hm = text.match(/(?:^|[^A-Za-z_])H=(\d+)/);
    const dm = text.match(/(?:^|[^A-Za-z_])D=(\d+)/);
    if (wm && !W) W = parseInt(wm[1], 10);
    if (hm && !H) H = parseInt(hm[1], 10);
    if (dm && !D) D = parseInt(dm[1], 10);
  }

  if (!W && !H && !D && !mod) return null;

  const params = new URLSearchParams();
  if (mod) params.set("module", mod);
  if (W) params.set("W", String(W));
  if (H) params.set("H", String(H));
  if (D) params.set("D", String(D));
  return `/3d-viewer/?${params.toString()}`;
}

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
  const viewer3DUrl = buildViewer3DUrl(steps);

  return (
    <div className="mt-2 rounded-md border border-border overflow-hidden text-xs">
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/40 border-b border-border">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Radni list</span>
        <div className="flex items-center gap-2">
          {viewer3DUrl && (
            <a
              href={viewer3DUrl}
              target="_blank"
              rel="noreferrer"
              title="Otvori 3D pregled s dimenzijama iz radnog lista"
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border border-border bg-muted/50 hover:border-blue-500 hover:text-blue-400 transition-colors"
            >
              <Box className="w-3 h-3" />
              Provjeri u 3D
            </a>
          )}
          <span className="text-[10px] text-muted-foreground">{steps.length} korak{steps.length === 1 ? "" : "a"}</span>
        </div>
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const show3DRef = useRef(false);
  const lastDimsRef = useRef<{ module: string; W?: number; H?: number; D?: number }>(
    (() => {
      try {
        const raw = typeof window !== "undefined" ? localStorage.getItem("mt_last_3d_dims") : null;
        if (raw) return JSON.parse(raw) as { module: string; W?: number; H?: number; D?: number };
      } catch { /* ignore */ }
      return { module: "" };
    })()
  );
  const [show3D, setShow3D] = useState(false);
  const [panel3DTab, setPanel3DTab] = useState<"pregled" | "lista">("pregled");
  const [paramList, setParamList] = useState<ParamEntry[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("mt_param_list") : null;
      if (raw) return JSON.parse(raw) as ParamEntry[];
    } catch { /* ignore */ }
    return [];
  });
  const [activeFormulaModule, setActiveFormulaModule] = useState<string>(
    () => {
      try {
        const raw = typeof window !== "undefined" ? localStorage.getItem("mt_last_3d_dims") : null;
        if (raw) { const d = JSON.parse(raw) as { module?: string }; if (d.module) return d.module; }
      } catch { /* ignore */ }
      return "KUH_VISOKI";
    }
  );
  const [moduleFormulas, setModuleFormulas] = useState<KbFormula[]>([]);
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(["dimenzija"]));
  const [pendingDimsUpdate, setPendingDimsUpdate] = useState<{ module: string; W: number; H: number; D: number } | null>(null);

  // ── Prompt panel state ────────────────────────────────────────────────────
  const [showPrompt, setShowPrompt] = useState(false);
  const [rulesContent, setRulesContent] = useState("");
  const [rulesSaved, setRulesSaved] = useState(false);

  const { data: rulesData, isLoading: isLoadingRules } = useGetRules();
  const saveRulesMutation = useSaveRules({
    mutation: {
      onSuccess: () => {
        setRulesSaved(true);
        setTimeout(() => setRulesSaved(false), 3000);
      },
      onError: () => { /* ignore */ }
    }
  });

  useEffect(() => {
    if (rulesData?.content !== undefined) {
      setRulesContent(rulesData.content);
    }
  }, [rulesData]);

  // ── Formula prompt panel state ─────────────────────────────────────────
  const [formulaPromptContent, setFormulaPromptContent] = useState("");
  const [formulaPromptSaved, setFormulaPromptSaved] = useState(false);

  const { data: formulaPromptData, isLoading: isLoadingFormulaPrompt } = useGetFormulaPrompt();
  const saveFormulaPromptMutation = useSaveFormulaPrompt({
    mutation: {
      onSuccess: () => {
        setFormulaPromptSaved(true);
        setTimeout(() => setFormulaPromptSaved(false), 3000);
      },
      onError: () => { /* ignore */ }
    }
  });

  useEffect(() => {
    if (formulaPromptData?.content !== undefined) {
      setFormulaPromptContent(formulaPromptData.content);
    }
  }, [formulaPromptData]);

  // ── 3D viewer parametrization state ──────────────────────────────────────
  // Params are keyed by variable name (VPT, KDT, PO, UDD); -1 means "auto"
  const [viewer3DModule, setViewer3DModule] = useState<string>("KUH_VISOKI");
  const [viewer3DParams, setViewer3DParams] = useState<Record<string, number>>({
    VPT: 1, KDT: -1, PO: -1, UDD: 3,
  });

  function sendParamsToViewer(params: Record<string, number>) {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "MEGATISCHLER_PARAMS", params }, "*");
    }
  }

  function setAndSendParam(key: string, value: number) {
    const next = { ...viewer3DParams, [key]: value };
    setViewer3DParams(next);
    sendParamsToViewer(next);
  }

  // Module-specific param definitions (mirrors formula-engine.ts meta, inlined to avoid cross-artifact import)
  const VIEWER_PARAM_META: Record<string, Array<{
    key: string; label: string;
    type: "select" | "stepper";
    options?: { value: number; label: string }[];
    min?: number; max?: number;
    visibleWhen?: (p: Record<string, number>) => boolean;
  }>> = {
    KUH_VISOKI: [
      {
        key: "VPT", label: "Donji dio", type: "select",
        options: [{ value: 0, label: "Fronta" }, { value: 1, label: "Ladice" }, { value: 2, label: "Prazno" }],
      },
      {
        key: "UDD", label: "Ladice", type: "stepper", min: 1, max: 6,
        visibleWhen: (p) => p["VPT"] === 1,
      },
      {
        key: "KDT", label: "Vrata", type: "select",
        options: [{ value: -1, label: "Auto" }, { value: 0, label: "Bez" }, { value: 1, label: "Jedno" }, { value: 2, label: "Dva" }],
      },
      {
        key: "PO", label: "Police", type: "select",
        options: [{ value: -1, label: "Auto" }, ...[0,1,2,3,4,5].map(v => ({ value: v, label: String(v) }))],
      },
    ],
    VISECI: [
      {
        key: "KDT", label: "Vrata", type: "select",
        options: [{ value: -1, label: "Auto" }, { value: 0, label: "Bez" }, { value: 1, label: "Jedno" }, { value: 2, label: "Dva" }],
      },
      {
        key: "PO", label: "Police", type: "select",
        options: [{ value: -1, label: "Auto" }, ...[0,1,2,3,4].map(v => ({ value: v, label: String(v) }))],
      },
    ],
    OTVORENI: [
      {
        key: "PO", label: "Police", type: "select",
        options: [{ value: -1, label: "Auto" }, ...[0,1,2,3,4,5,6,7,8].map(v => ({ value: v, label: String(v) }))],
      },
    ],
    KUTNI_VANJSKI: [
      {
        key: "PO", label: "Police (po strani)", type: "select",
        options: [{ value: -1, label: "Auto" }, ...[0,1,2,3,4].map(v => ({ value: v, label: String(v) }))],
      },
    ],
  };

  const MODULE_PARAM_DEFAULTS_INLINE: Record<string, Record<string, number>> = {
    KUH_VISOKI: { VPT: 1, KDT: -1, PO: -1, UDD: 3 },
    VISECI:     { KDT: -1, PO: -1 },
    OTVORENI:   { PO: -1 },
    KUTNI_VANJSKI: { PO: -1 },
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    function handleDimsUpdate(e: MessageEvent) {
      if (!e.data || e.data.type !== "MEGATISCHLER_DIMS_UPDATE") return;
      const { module: m, W: w, H: h, D: d } = e.data as { type: string; module?: string; W?: number; H?: number; D?: number };
      if (typeof w !== "number" || typeof h !== "number" || typeof d !== "number") return;
      setPendingDimsUpdate({ module: m ?? "", W: w, H: h, D: d });
      // Sync module state so formula tree auto-switches
      if (m) {
        setActiveFormulaModule(m);
        lastDimsRef.current = { ...lastDimsRef.current, module: m, W: w, H: h, D: d };
        try { localStorage.setItem("mt_last_3d_dims", JSON.stringify(lastDimsRef.current)); } catch { /* ignore */ }
        // Reset params when module changes
        setViewer3DModule(m);
        setViewer3DParams(MODULE_PARAM_DEFAULTS_INLINE[m] ?? {});
      }
    }
    window.addEventListener("message", handleDimsUpdate);
    return () => window.removeEventListener("message", handleDimsUpdate);
  }, []);

  // Fetch formulas for active module when lista tab is open
  useEffect(() => {
    if (panel3DTab !== "lista") return;
    let cancelled = false;
    setFormulaLoading(true);
    fetch(`/api/knowledge?module=${encodeURIComponent(activeFormulaModule)}`)
      .then(r => r.json())
      .then((data: { formulas: KbFormula[] }) => {
        if (!cancelled) setModuleFormulas(data.formulas ?? []);
      })
      .catch(() => { if (!cancelled) setModuleFormulas([]); })
      .finally(() => { if (!cancelled) setFormulaLoading(false); });
    return () => { cancelled = true; };
  }, [panel3DTab, activeFormulaModule]);

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

  const handleSend = async (overrideMessage?: string) => {
    // Slash command router — intercept before sending to AI
    const effectiveInput = overrideMessage !== undefined ? overrideMessage : input;
    const trimmed = effectiveInput.trimStart();
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
    if (effectiveInput.trimStart().toLowerCase().startsWith("/stolar ")) {
      const rest = effectiveInput.trimStart().slice(8).trim();
      if (!rest) return;
      const firstSpace = rest.indexOf(" ");
      const pojam = firstSpace > 0 ? rest.slice(0, firstSpace) : rest;
      const definicija = rest;
      setMessages(prev => [...prev, { role: "user", content: `/stolar ${rest}` }]);
      setInput("");
      await handleStolarCommand(pojam, definicija);
      return;
    }

    if (!effectiveInput.trim() && !screenshotDataUrl && !attachedFile) return;

    const currentScreenshot = screenshotDataUrl;
    const currentFile = attachedFile;
    const userMsg: ChatMessageExt = {
      role: "user",
      content: effectiveInput.trim(),
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
        .slice(0, -1) // all messages except current user msg
        .slice(-10) // last 10
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
              const parsed = parseDimsFromText(assistantContent);
              if (parsed) {
                const merged = { ...lastDimsRef.current };
                if (parsed.module) merged.module = parsed.module;
                if (parsed.W !== undefined) merged.W = parsed.W;
                if (parsed.H !== undefined) merged.H = parsed.H;
                if (parsed.D !== undefined) merged.D = parsed.D;
                lastDimsRef.current = merged;
                try { localStorage.setItem("mt_last_3d_dims", JSON.stringify(merged)); } catch { /* ignore */ }
                if (merged.W && merged.H && merged.D) {
                  if (!show3DRef.current) {
                    show3DRef.current = true;
                    setShow3D(true);
                  }
                  if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage({
                      type: "MEGATISCHLER_DIMS",
                      module: merged.module || "KUH_VISOKI",
                      W: merged.W,
                      H: merged.H,
                      D: merged.D,
                    }, "*");
                  }
                  // Accumulate in parametrization list (dedup by module+W+H+D)
                  const mod = merged.module || "KUH_VISOKI";
                  const eW = merged.W, eH = merged.H, eD = merged.D;
                  setParamList(prev => {
                    if (prev.some(e => e.module === mod && e.W === eW && e.H === eH && e.D === eD)) return prev;
                    const next = [
                      { id: `${mod}-${eW}-${eH}-${eD}-${Date.now()}`, module: mod, W: eW, H: eH, D: eD, ts: Date.now() },
                      ...prev,
                    ].slice(0, 50);
                    try { localStorage.setItem("mt_param_list", JSON.stringify(next)); } catch { /* ignore */ }
                    return next;
                  });
                  // Auto-switch formula view to the detected module
                  setActiveFormulaModule(mod);
                }
              }
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
    <div className="flex h-full w-full overflow-hidden">
    <div className="flex flex-col flex-1 min-w-0 bg-background relative overflow-hidden" data-testid="chat-panel">
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
                                handleSend(msg);
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

          {/* 3D dims update chip */}
          {pendingDimsUpdate && (
            <div className="mb-2 flex items-center gap-2 bg-blue-950/40 border border-blue-500/30 rounded-lg px-3 py-2 text-xs">
              <Box className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-blue-200 flex-1 min-w-0 truncate">
                Dimenzije promijenjene u 3D:{" "}
                {pendingDimsUpdate.module && <strong>{pendingDimsUpdate.module} · </strong>}
                <strong>W={pendingDimsUpdate.W}</strong>{" "}
                <strong>H={pendingDimsUpdate.H}</strong>{" "}
                <strong>D={pendingDimsUpdate.D}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  const { module: m, W, H, D } = pendingDimsUpdate;
                  const modPart = m ? `${m}, ` : "";
                  setInput(`Kopiraj formule za ${modPart}W=${W} H=${H} D=${D} mm`);
                  setPendingDimsUpdate(null);
                  textareaRef.current?.focus();
                }}
                className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded border border-blue-500/40 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
              >
                Pošalji Copilotu
              </button>
              <button
                type="button"
                onClick={() => setPendingDimsUpdate(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Odbaci"
              >
                <X className="w-3.5 h-3.5" />
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

            {/* 3D panel toggle */}
            <Button
              variant="ghost"
              size="icon"
              className={`shrink-0 rounded-lg transition-colors ${show3D ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setShow3D(s => { show3DRef.current = !s; return !s; }); }}
              title={show3D ? "Zatvori 3D pregled" : "Otvori 3D pregled"}
              data-testid="toggle-3d-button"
            >
              <Box className="w-5 h-5" />
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
              {planMode ? "📋 Plan ON" : "📋 Plan"}
            </Button>

            <Button
              onClick={() => handleSend()}
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

      {/* ── Prompt tab toggle button ─────────────────────────────────────── */}
      <div className="absolute right-0 top-0 h-full z-30 flex items-center pointer-events-none">
        <button
          onClick={() => setShowPrompt(p => !p)}
          title={showPrompt ? "Zatvori Prompt panel" : "Otvori Prompt (pravila)"}
          className="pointer-events-auto flex flex-col items-center justify-center gap-0.5 w-6 py-5 bg-card/90 border border-border border-r-0 rounded-l-md shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors select-none"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span
            className="text-[7px] font-bold uppercase tracking-wider mt-0.5"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            Prompt
          </span>
        </button>
      </div>

      {/* ── Prompt slide-out panel ──────────────────────────────────────── */}
      <div
        className="absolute top-0 h-full z-20 flex flex-col bg-card border-l border-border shadow-xl"
        style={{
          right: "1.5rem",
          width: showPrompt ? 320 : 0,
          opacity: showPrompt ? 1 : 0,
          pointerEvents: showPrompt ? undefined : "none",
          transition: "width 0.25s ease, opacity 0.15s ease",
          overflow: "hidden",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0 bg-card">
          <span className="text-sm font-semibold">Postavke</span>
          <button
            onClick={() => setShowPrompt(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5" style={{ minHeight: 0 }}>
          {/* Editor 1: stipe_rules.txt */}
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground">Stil odgovora i kontekst rada</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Pravila, preferencije i kontekst koji se šalju uz svaki upit. Ovdje postavi ton, stil i specifičnosti tvoje radionice.
              </p>
            </div>
            {isLoadingRules ? (
              <Skeleton className="h-32 w-full rounded-md" />
            ) : (
              <Textarea
                value={rulesContent}
                onChange={(e) => { setRulesContent(e.target.value); setRulesSaved(false); }}
                className="font-mono text-xs resize-none bg-muted/20 focus-visible:ring-1 leading-relaxed"
                rows={8}
                placeholder={"Upiši svoja pravila za MegaTischler...\n\nPrimjer:\n- Uvijek koristi decimalni zarez (0,5 ne 0.5)\n- Polica uvijek prati dubinu: [.D]-20\n- ..."}
                data-testid="prompt-panel-textarea"
              />
            )}
            <Button
              size="sm"
              className="w-full"
              onClick={() => saveRulesMutation.mutate({ data: { content: rulesContent } })}
              disabled={saveRulesMutation.isPending}
            >
              {saveRulesMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : rulesSaved ? (
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {rulesSaved ? "Spremljeno" : "Spremi"}
            </Button>
          </div>

          <div className="border-t border-border" />

          {/* Editor 2: formula_prompt.txt */}
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground">Dopunski naputak za formule</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Vlastite napomene za pisanje formula — ubrizgavaju se u AI odmah iza pravila sintakse.
              </p>
            </div>
            {isLoadingFormulaPrompt ? (
              <Skeleton className="h-32 w-full rounded-md" />
            ) : (
              <Textarea
                value={formulaPromptContent}
                onChange={(e) => { setFormulaPromptContent(e.target.value); setFormulaPromptSaved(false); }}
                className="font-mono text-xs resize-none bg-muted/20 focus-visible:ring-1 leading-relaxed"
                rows={6}
                placeholder={"Npr. Za ovaj projekt uvijek koristi kanticu debljine 2mm na frontalnim pločama. Slobodne police pozicioniraj relativno na [.Pod.Z]..."}
                data-testid="formula-prompt-panel-textarea"
              />
            )}
            <Button
              size="sm"
              className="w-full"
              onClick={() => saveFormulaPromptMutation.mutate({ data: { content: formulaPromptContent } })}
              disabled={saveFormulaPromptMutation.isPending}
            >
              {saveFormulaPromptMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : formulaPromptSaved ? (
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {formulaPromptSaved ? "Spremljeno" : "Spremi"}
            </Button>
          </div>
        </div>
      </div>
    </div>

    {/* 3D panel toggle — at boundary, always visible */}
    <div className="relative flex-shrink-0 flex items-center z-20">
      <button
        onClick={() => { setShow3D(s => { show3DRef.current = !s; return !s; }); }}
        title={show3D ? "Zatvori 3D panel" : "Otvori 3D panel"}
        className="flex items-center justify-center w-5 h-12 bg-card/80 border border-border rounded-l-md
                   text-muted-foreground hover:text-foreground hover:bg-muted
                   transition-colors select-none shadow-sm"
      >
        {show3D ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
      </button>
    </div>

    {/* Live 3D panel — 50% width, collapsible */}
    <div
      className="flex-shrink-0 border-l border-border flex flex-col overflow-hidden"
      style={{
        width: show3D ? "50%" : 0,
        minWidth: show3D ? 480 : 0,
        opacity: show3D ? 1 : 0,
        pointerEvents: show3D ? undefined : "none",
        transition: "width 0.28s ease, min-width 0.28s ease, opacity 0.15s ease",
      }}
    >
      {/* Tab bar — mirrors left panel style */}
      <div className="flex items-center border-b border-border bg-card/80 flex-shrink-0">
        <button
          onClick={() => setPanel3DTab("pregled")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px
            ${panel3DTab === "pregled"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
        >
          <Box className="w-3.5 h-3.5" />
          Pregled
        </button>
        <button
          onClick={() => setPanel3DTab("lista")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px
            ${panel3DTab === "lista"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
        >
          Parametrizacije
          {paramList.length > 0 && (
            <span className="ml-1 bg-primary/20 text-primary rounded-full text-[10px] px-1.5 leading-tight">
              {paramList.length}
            </span>
          )}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => { setShow3D(false); show3DRef.current = false; }}
          className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Zatvori 3D panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Pregled tab — 3D iframe + params bar */}
      {panel3DTab === "pregled" && (
        <div className="flex-1 flex flex-col min-h-0">
          <iframe
            ref={iframeRef}
            src="/3d-viewer/?embed=1"
            className="flex-1 border-0 bg-slate-100 min-h-0"
            title="MegaTischler 3D preglednik"
            onLoad={() => {
              const dims = lastDimsRef.current;
              if (dims.W && dims.H && dims.D && iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage({
                  type: "MEGATISCHLER_DIMS",
                  module: dims.module || "KUH_VISOKI",
                  W: dims.W,
                  H: dims.H,
                  D: dims.D,
                }, "*");
              }
              // Also send current params after dims are loaded
              setTimeout(() => sendParamsToViewer(viewer3DParams), 200);
            }}
          />

          {/* Params bar — only shown for modules with configurable params */}
          {(() => {
            const currentMod = viewer3DModule || lastDimsRef.current.module || "KUH_VISOKI";
            const paramsMeta = VIEWER_PARAM_META[currentMod];
            if (!paramsMeta || paramsMeta.length === 0) return null;
            const visibleMeta = paramsMeta.filter(m => !m.visibleWhen || m.visibleWhen(viewer3DParams));
            if (visibleMeta.length === 0) return null;
            return (
              <div className="flex-shrink-0 border-t border-border bg-card/90 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {visibleMeta.map(meta => (
                  <div key={meta.key} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{meta.label}</span>
                    {meta.type === "select" && meta.options ? (
                      <select
                        value={viewer3DParams[meta.key] ?? (meta.options[0]?.value ?? 0)}
                        onChange={e => setAndSendParam(meta.key, parseInt(e.target.value, 10))}
                        className="text-[11px] rounded border border-border bg-background text-foreground px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {meta.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : meta.type === "stepper" ? (
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => setAndSendParam(meta.key, Math.max(meta.min ?? 1, (viewer3DParams[meta.key] ?? 1) - 1))}
                          className="w-5 h-5 flex items-center justify-center rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted text-xs transition-colors"
                        >−</button>
                        <span className="w-5 text-center text-[11px] font-mono font-semibold text-foreground">
                          {viewer3DParams[meta.key] ?? 1}
                        </span>
                        <button
                          onClick={() => setAndSendParam(meta.key, Math.min(meta.max ?? 6, (viewer3DParams[meta.key] ?? 1) + 1))}
                          className="w-5 h-5 flex items-center justify-center rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted text-xs transition-colors"
                        >+</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Lista tab — formula tree + session history */}
      {panel3DTab === "lista" && (
        <div className="flex-1 overflow-y-auto">

          {/* ── Section 1: Formula tree for active module ─────────────────── */}
          <div className="border-b border-border">
            {/* Section header */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Formule modula
              </span>
              {formulaLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>

            {/* Module chip selector — horizontal scroll */}
            <div className="flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar border-b border-border">
              {ALL_KB_MODULES.map(mod => (
                <button
                  key={mod}
                  onClick={() => setActiveFormulaModule(mod)}
                  className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors border
                    ${activeFormulaModule === mod
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"}`}
                >
                  {mod}
                </button>
              ))}
            </div>

            {/* Formula label for active module */}
            <div className="px-4 py-1.5 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{activeFormulaModule}</span>
              {MODULE_LABELS_HR[activeFormulaModule] && (
                <span className="ml-1.5 opacity-60">— {MODULE_LABELS_HR[activeFormulaModule]}</span>
              )}
              {!formulaLoading && moduleFormulas.length > 0 && (
                <span className="ml-1.5 opacity-40">({moduleFormulas.length} formula)</span>
              )}
            </div>

            {/* Formula groups — collapsible by type */}
            {formulaLoading ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground/50">Učitavam...</div>
            ) : moduleFormulas.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground/50">Nema formula za ovaj modul</div>
            ) : (() => {
              // Group by type
              const groups: Record<string, KbFormula[]> = {};
              for (const f of moduleFormulas) {
                const key = f.type ?? "ostalo";
                if (!groups[key]) groups[key] = [];
                groups[key].push(f);
              }
              const order = ["dimenzija", "uvjet", "ukljucenje", "pozicija", "referenca", "rotacija", "ostalo"];
              const sorted = [...Object.keys(groups)].sort(
                (a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
              );
              return (
                <div className="pb-2">
                  {sorted.map(typeKey => {
                    const items = groups[typeKey];
                    const label = TYPE_LABELS_HR[typeKey] ?? (typeKey.charAt(0).toUpperCase() + typeKey.slice(1));
                    const isExpanded = expandedTypes.has(typeKey);
                    return (
                      <div key={typeKey} className="border-b border-border/50 last:border-b-0">
                        <button
                          className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-accent/50 transition-colors"
                          onClick={() => setExpandedTypes(prev => {
                            const next = new Set(prev);
                            if (next.has(typeKey)) next.delete(typeKey); else next.add(typeKey);
                            return next;
                          })}
                        >
                          {isExpanded
                            ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          }
                          <span className="text-[11px] font-semibold text-foreground">{label}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground/50">{items.length}</span>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-2 space-y-0.5">
                            {items.map((f, i) => (
                              <div
                                key={i}
                                className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-accent/40 transition-colors"
                              >
                                <code className="flex-1 min-w-0 font-mono text-[11px] text-amber-200/80 break-all leading-snug">
                                  {f.formula}
                                </code>
                                <button
                                  onClick={() => navigator.clipboard.writeText(f.formula)}
                                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all text-[10px]"
                                  title="Kopiraj formulu"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* ── Section 2: Session dim history ────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Sesija{paramList.length > 0 && ` (${paramList.length})`}
              </span>
              {paramList.length > 0 && (
                <button
                  onClick={() => {
                    setParamList([]);
                    try { localStorage.removeItem("mt_param_list"); } catch { /* ignore */ }
                  }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Obriši sve
                </button>
              )}
            </div>

            {paramList.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-muted-foreground/40">
                Razgovaraj s Copilotom o dimenzijama — komadi će se ovdje prikazivati
              </div>
            ) : (
              <div className="p-3 space-y-1.5">
                {paramList.map(entry => (
                  <div
                    key={entry.id}
                    className="group flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => {
                      if (iframeRef.current?.contentWindow) {
                        iframeRef.current.contentWindow.postMessage({
                          type: "MEGATISCHLER_DIMS",
                          module: entry.module,
                          W: entry.W,
                          H: entry.H,
                          D: entry.D,
                        }, "*");
                      }
                      lastDimsRef.current = { module: entry.module, W: entry.W, H: entry.H, D: entry.D };
                      setActiveFormulaModule(entry.module);
                      setPanel3DTab("pregled");
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 opacity-70" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-mono font-bold text-foreground">{entry.module}</span>
                        <span className="text-[10px] text-muted-foreground/60 truncate">
                          {MODULE_LABELS_HR[entry.module] ?? ""}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-primary/80">
                        {entry.W}×{entry.H}×{entry.D}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/40 flex-shrink-0">
                      {new Date(entry.ts).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setParamList(prev => {
                          const next = prev.filter(x => x.id !== entry.id);
                          try { localStorage.setItem("mt_param_list", JSON.stringify(next)); } catch { /* ignore */ }
                          return next;
                        });
                      }}
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
    </div>
  );
}
