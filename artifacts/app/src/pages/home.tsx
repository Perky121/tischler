import { KnowledgePanel } from "@/components/knowledge-panel";
import { ChatPanel } from "@/components/chat-panel";

export default function Home() {
  return (
    <main className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div className="w-[40%] min-w-[320px] max-w-[600px] border-r border-border bg-card/50">
        <KnowledgePanel />
      </div>
      <div className="flex-1 flex min-w-0">
        <ChatPanel />
      </div>
    </main>
  );
}
