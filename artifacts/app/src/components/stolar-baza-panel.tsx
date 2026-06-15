import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetStolarKnowledge,
  getGetStolarKnowledgeQueryKey,
  useStolarDelete,
  useStolarUpdate,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  Loader2,
  BookOpen,
  Plus,
  Minus,
} from "lucide-react";

type EditState = {
  definicija: string;
  zaključci: string[];
};

function EntryCard({
  entry,
  onDeleted,
  onUpdated,
}: {
  entry: { pojam: string; definicija: string; zaključci: string[]; timestamp: string };
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editState, setEditState] = useState<EditState>({ definicija: "", zaključci: [] });

  const deleteMutation = useStolarDelete({
    mutation: {
      onSuccess: () => {
        toast({ title: `Pojam '${entry.pojam}' obrisan.` });
        onDeleted();
      },
      onError: () => {
        toast({ title: "Greška pri brisanju", variant: "destructive" });
        setConfirmDelete(false);
      },
    },
  });

  const updateMutation = useStolarUpdate({
    mutation: {
      onSuccess: () => {
        toast({ title: `Pojam '${entry.pojam}' ažuriran.` });
        setEditing(false);
        onUpdated();
      },
      onError: () => {
        toast({ title: "Greška pri ažuriranju", variant: "destructive" });
      },
    },
  });

  const handleStartEdit = () => {
    setEditState({ definicija: entry.definicija, zaključci: [...entry.zaključci] });
    setExpanded(true);
    setEditing(true);
    setConfirmDelete(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = () => {
    const filtered = editState.zaključci.filter((z) => z.trim().length > 0);
    updateMutation.mutate({
      pojam: entry.pojam,
      data: { definicija: editState.definicija, zaključci: filtered },
    });
  };

  const handleAddZaključak = () => {
    setEditState((s) => ({ ...s, zaključci: [...s.zaključci, ""] }));
  };

  const handleRemoveZaključak = (idx: number) => {
    setEditState((s) => ({ ...s, zaključci: s.zaključci.filter((_, i) => i !== idx) }));
  };

  const handleZaključakChange = (idx: number, val: string) => {
    setEditState((s) => {
      const next = [...s.zaključci];
      next[idx] = val;
      return { ...s, zaključci: next };
    });
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteMutation.mutate({ pojam: entry.pojam });
  };

  const formattedDate = (() => {
    try {
      return new Date(entry.timestamp).toLocaleDateString("hr-HR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "";
    }
  })();

  return (
    <div
      className={`rounded-md border transition-colors ${
        editing
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-card/40 hover:border-border/80"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => { if (!editing) setExpanded((e) => !e); }}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <span className="font-semibold text-sm truncate">{entry.pojam}</span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-1">
            {entry.zaključci.length} zaključ.
          </span>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!editing && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleStartEdit}
              title="Uredi pojam"
            >
              <Pencil className="w-3 h-3" />
            </Button>
          )}
          {confirmDelete ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                className="h-6 px-2 text-[10px]"
                onClick={handleDeleteClick}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  "Potvrdi"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px]"
                onClick={() => setConfirmDelete(false)}
              >
                Odustani
              </Button>
            </>
          ) : (
            !editing && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                onClick={handleDeleteClick}
                title="Obriši pojam"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )
          )}
        </div>
      </div>

      {/* Expanded / editing body */}
      {(expanded || editing) && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-2.5">
          {editing ? (
            <>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Definicija
                </label>
                <Textarea
                  value={editState.definicija}
                  onChange={(e) => setEditState((s) => ({ ...s, definicija: e.target.value }))}
                  className="text-xs resize-none min-h-[72px] bg-background/60"
                  rows={3}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Zaključci
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={handleAddZaključak}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Dodaj
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {editState.zaključci.map((z, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <input
                        value={z}
                        onChange={(e) => handleZaključakChange(i, e.target.value)}
                        className="flex-1 text-xs bg-background/60 border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => handleRemoveZaključak(i)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  {editState.zaključci.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">Nema zaključaka</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSaveEdit}
                  disabled={updateMutation.isPending || !editState.definicija.trim()}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Spremi
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={handleCancelEdit}
                  disabled={updateMutation.isPending}
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Odustani
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                  Definicija
                </p>
                <p className="text-xs leading-relaxed text-foreground/90">{entry.definicija}</p>
              </div>
              {entry.zaključci.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                    Zaključci
                  </p>
                  <ul className="space-y-1">
                    {entry.zaključci.map((z, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-primary mt-0.5 flex-shrink-0">·</span>
                        <span className="text-foreground/80 leading-relaxed">{z}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {formattedDate && (
                <p className="text-[10px] text-muted-foreground/60">Dodano: {formattedDate}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function StolarBazaPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useGetStolarKnowledge();

  const entries = data?.entries ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetStolarKnowledgeQueryKey() });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">Naučeni pojmovi</h2>
        <p className="text-xs text-muted-foreground mb-1">
          Stolarski pojmovi koje je AI naučio kroz razgovor
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-md border border-border p-3 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Greška pri učitavanju pojmova. Provjeri je li backend pokrenut.
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center py-12 text-muted-foreground">
          <BookOpen className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">Nema naučenih pojmova</p>
          <p className="text-xs opacity-70 max-w-[220px] leading-relaxed">
            Koristi naredbu <span className="font-mono text-[11px]">/stolar</span> u chatu da naučiš
            AI stolarske pojmove i mjere.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            {entries.length} {entries.length === 1 ? "pojam" : entries.length < 5 ? "pojma" : "pojmova"}
          </p>
          {entries.map((entry) => (
            <EntryCard
              key={entry.pojam}
              entry={entry}
              onDeleted={invalidate}
              onUpdated={invalidate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
