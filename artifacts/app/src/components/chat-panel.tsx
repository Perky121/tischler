import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, Send, Copy, Check, Loader2, X } from "lucide-react";
import type { ChatMessage } from "@workspace/api-client-react";

// Message type extended with screenshot thumbnail
type ChatMessageExt = ChatMessage & { screenshotThumb?: string };

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

function WorklistFormulaInline({ formula }: { formula: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 mt-1 px-2 py-1 rounded border border-border bg-zinc-950/80 flex-wrap">
      <span className="text-[10px] font-bold uppercase text-muted-foreground shrink-0">Formula</span>
      <code className="flex-1 min-w-0 font-mono text-[12px] text-amber-200/90 break-all">{formula}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(formula);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border bg-muted/50 hover:border-primary shrink-0"
      >
        {copied ? "✓ Kopirano" : "Kopiraj"}
      </button>
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

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessageExt[]>([]);
  const [input, setInput] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Strip data URL prefix to get raw base64 for the API
  const extractBase64 = (dataUrl: string): string => {
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    return match ? match[1] : dataUrl;
  };

  const handleSend = async () => {
    if (!input.trim() && !screenshotDataUrl) return;

    const currentScreenshot = screenshotDataUrl;
    const userMsg: ChatMessageExt = {
      role: "user",
      content: input.trim(),
      ...(currentScreenshot ? { screenshotThumb: currentScreenshot } : {}),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setScreenshotDataUrl(null);
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
      } = {
        message: userMsg.content,
        history: historyForApi,
      };

      if (currentScreenshot) {
        body.screenshot_base64 = extractBase64(currentScreenshot);
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
            } else if (data.content) {
              assistantContent += data.content;
            }
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: assistantContent };
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
              const hasScreenshot = !!msg.screenshotThumb;

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
                        {msg.content && (
                          <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                        )}
                      </div>
                    )}

                    {/* Assistant message */}
                    {!isUser && (
                      <div className="text-foreground">
                        {msg.content ? (() => {
                          const wlSteps = !isStreaming ? extractWorklist(msg.content) : null;
                          if (wlSteps) {
                            const intro = stripWorklist(msg.content);
                            return (
                              <>
                                {intro ? <MarkdownMessage content={intro} /> : null}
                                <WorklistCard steps={wlSteps} />
                              </>
                            );
                          }
                          return <MarkdownMessage content={msg.content} />;
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

          <div className="flex items-end gap-2 bg-card border border-border rounded-xl p-2 focus-within:ring-1 focus-within:ring-primary shadow-sm">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleScreenshotSelect}
              data-testid="screenshot-file-input"
            />
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

            <Button
              onClick={handleSend}
              disabled={(!input.trim() && !screenshotDataUrl) || isStreaming}
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
