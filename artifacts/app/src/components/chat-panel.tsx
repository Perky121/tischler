import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, Send, Copy, Check, Loader2 } from "lucide-react";
import type { ChatMessage } from "@workspace/api-client-react";

// Helper for parsing simple markdown code blocks
const MarkdownMessage = ({ content }: { content: string }) => {
  const parts = content.split(/(```[\s\S]*?```)/g);
  
  return (
    <div className="space-y-4 text-sm">
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const match = part.match(/```(\w*)\n([\s\S]*?)```/);
          const lang = match?.[1] || '';
          const code = match?.[2] || part.slice(3, -3).trim();
          
          return <CodeBlock key={i} code={code} lang={lang} />;
        }
        
        // Render text part, split by newlines for basic paragraphs
        return (
          <div key={i} className="whitespace-pre-wrap leading-relaxed">
            {part}
          </div>
        );
      })}
    </div>
  );
};

const CodeBlock = ({ code, lang }: { code: string; lang: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-md bg-zinc-950 border border-border overflow-hidden my-4">
      <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-b border-border">
        <span className="text-xs text-zinc-400 font-mono">{lang || 'code'}</span>
        <button 
          onClick={handleCopy}
          className="text-zinc-400 hover:text-zinc-100 transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      setScreenshot(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (!input.trim() && !screenshot) return;
    
    const userMessage: ChatMessage & { screenshot?: string } = {
      role: "user",
      content: input,
      ...(screenshot ? { screenshot } : {})
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    const currentScreenshot = screenshot;
    setScreenshot(null);
    setIsStreaming(true);

    // Add empty assistant message to append to
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      // Create request payload
      // Remove screenshot data from history passed to API
      const historyForApi = newMessages.map(m => ({
        role: m.role,
        content: m.content
      })).slice(-20);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          screenshot_base64: currentScreenshot,
          history: historyForApi.slice(0, -1) // All except current
        })
      });

      if (!res.ok) throw new Error("Failed to send message");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
        
        for (const line of lines) {
          const dataStr = line.replace(/^data: /, '').trim();
          if (!dataStr) continue;
          
          try {
            const data = JSON.parse(dataStr);
            if (data.done) {
              break;
            } else if (data.content) {
              assistantContent += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
          } catch (e) {
            console.error("Error parsing SSE JSON:", e, "String:", dataStr);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Error connecting to AI. Please try again." };
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
    <div className="flex flex-col h-full w-full bg-background relative">
      <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-4">
            <div className="max-w-md space-y-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <span className="text-primary text-xl font-bold">MT</span>
              </div>
              <h2 className="text-xl font-semibold">MegaTischler Copilot</h2>
              <p className="text-muted-foreground text-sm">
                Spreman za pisanje parametarskih formula. 
                Pitaj me o specifičnim uvjetima za ugradnju okova ili zatraži generiranje koda.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8 max-w-4xl mx-auto pb-4">
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              // Using any cast to access custom field
              const hasScreenshot = (msg as any).screenshot;
              
              return (
                <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
                    {!isUser && (
                      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-primary">
                        <span className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-[10px]">MT</span>
                        Copilot
                      </div>
                    )}
                    <div className={`
                      ${isUser ? "bg-accent text-accent-foreground px-4 py-3 rounded-2xl rounded-tr-sm" : "text-foreground"}
                    `}>
                      {isUser && hasScreenshot && (
                        <div className="mb-2 flex items-center gap-1.5 text-xs bg-black/20 text-muted-foreground px-2 py-1 rounded w-max">
                          <span className="text-[10px]">📷</span> sa screenshotom
                        </div>
                      )}
                      
                      {isUser ? (
                        <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                      ) : (
                        <MarkdownMessage content={msg.content} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 text-xs font-medium text-primary mb-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Razmišlja...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-background">
        <div className="max-w-4xl mx-auto">
          {screenshot && (
            <div className="mb-3 relative inline-block">
              <div className="w-20 h-20 rounded-md border border-border overflow-hidden bg-black/50">
                <img src={screenshot} alt="Screenshot preview" className="w-full h-full object-cover" />
              </div>
              <button 
                onClick={() => setScreenshot(null)}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs hover:bg-destructive/90"
              >
                ×
              </button>
            </div>
          )}
          
          <div className="relative flex items-end gap-2 bg-card border border-border rounded-xl p-2 focus-within:ring-1 focus-within:ring-primary shadow-sm">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleScreenshotSelect}
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Pogledaj ekran"
            >
              <ImageIcon className="w-5 h-5" />
            </Button>
            
            <Textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Upiši poruku..."
              className="min-h-[44px] max-h-32 resize-none border-0 focus-visible:ring-0 shadow-none bg-transparent p-3 text-sm py-3"
              disabled={isStreaming}
            />
            
            <Button 
              onClick={handleSend}
              disabled={(!input.trim() && !screenshot) || isStreaming}
              className="shrink-0 rounded-lg mb-0.5"
            >
              <Send className="w-4 h-4 mr-2" />
              Pošalji
            </Button>
          </div>
          <div className="text-center mt-2 text-[11px] text-muted-foreground">
            Sustav podržava Markdown formatiranje i MegaTischler sintaksu.
          </div>
        </div>
      </div>
    </div>
  );
}
