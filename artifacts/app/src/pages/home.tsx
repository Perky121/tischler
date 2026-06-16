import { useState } from "react";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { ChatPanel } from "@/components/chat-panel";
import { StolarBazaPanel } from "@/components/stolar-baza-panel";
import { FormulaRulesPanel } from "@/components/formula-rules-panel";
import { PanelLeftClose, PanelLeftOpen, Database, BookOpen, SlidersHorizontal } from "lucide-react";

type LeftTab = "znanje" | "stolar" | "pravila";

export default function Home() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<LeftTab>("znanje");

  return (
    <main className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* Left panel — collapsible */}
      <div
        className="relative flex-shrink-0 border-r border-border bg-card/50 overflow-hidden flex flex-col"
        style={{
          width: collapsed ? 0 : "40%",
          minWidth: collapsed ? 0 : 320,
          maxWidth: 600,
          transition: "width 0.28s ease, min-width 0.28s ease",
        }}
      >
        {/* Content wrapper — fade out when collapsing */}
        <div
          className="h-full flex flex-col"
          style={{
            opacity: collapsed ? 0 : 1,
            pointerEvents: collapsed ? "none" : undefined,
            transition: "opacity 0.15s ease",
          }}
        >
          {/* Tab bar */}
          <div className="flex items-center border-b border-border bg-card/80 flex-shrink-0">
            <button
              onClick={() => setActiveTab("znanje")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px
                ${activeTab === "znanje"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
            >
              <Database className="w-3.5 h-3.5" />
              Baza znanja
            </button>
            <button
              onClick={() => setActiveTab("stolar")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px
                ${activeTab === "stolar"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Naučeni pojmovi
            </button>
            <button
              onClick={() => setActiveTab("pravila")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px
                ${activeTab === "pravila"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Parametrizacija - pravila
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "znanje" ? (
              <KnowledgePanel />
            ) : activeTab === "stolar" ? (
              <StolarBazaPanel />
            ) : (
              <FormulaRulesPanel />
            )}
          </div>
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
