import { useState } from "react";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { ChatPanel } from "@/components/chat-panel";
import { StolarBazaPanel } from "@/components/stolar-baza-panel";
import { FormulaRulesPanel } from "@/components/formula-rules-panel";
import { Bot, Database, BookOpen, SlidersHorizontal } from "lucide-react";

type Tab = "chat" | "znanje" | "stolar" | "pravila";

const TABS = [
  { id: "chat", label: "ChatBot", icon: Bot },
  { id: "znanje", label: "Baza znanja", icon: Database },
  { id: "stolar", label: "Naučeni pojmovi", icon: BookOpen },
  { id: "pravila", label: "Parametrizacija - pravila", icon: SlidersHorizontal },
] as const;

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-card/80 flex-shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px
                ${activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "chat" ? (
          <ChatPanel />
        ) : activeTab === "znanje" ? (
          <KnowledgePanel />
        ) : activeTab === "stolar" ? (
          <StolarBazaPanel />
        ) : (
          <FormulaRulesPanel />
        )}
      </div>
    </main>
  );
}
