import { useState } from "react";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { ChatPanel } from "@/components/chat-panel";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export default function Home() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <main className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* Left panel — collapsible */}
      <div
        className="relative flex-shrink-0 border-r border-border bg-card/50 overflow-hidden"
        style={{
          width: collapsed ? 0 : "40%",
          minWidth: collapsed ? 0 : 320,
          maxWidth: 600,
          transition: "width 0.28s ease, min-width 0.28s ease",
        }}
      >
        {/* Content wrapper — fade out when collapsing */}
        <div
          className="h-full"
          style={{
            opacity: collapsed ? 0 : 1,
            pointerEvents: collapsed ? "none" : undefined,
            transition: "opacity 0.15s ease",
          }}
        >
          <KnowledgePanel />
        </div>
      </div>

      {/* Toggle tab — lives at the boundary */}
      <div className="relative flex-shrink-0 flex items-center z-20">
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Otvori bazu znanja" : "Zatvori bazu znanja"}
          className="flex items-center justify-center w-5 h-12 bg-card/80 border border-border rounded-r-md
                     text-muted-foreground hover:text-foreground hover:bg-muted
                     transition-colors select-none shadow-sm"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-3.5 h-3.5" />
          ) : (
            <PanelLeftClose className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Right — chat */}
      <div className="flex-1 flex min-w-0">
        <ChatPanel />
      </div>
    </main>
  );
}
