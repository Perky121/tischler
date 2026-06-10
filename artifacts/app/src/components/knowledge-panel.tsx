import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetKnowledge, 
  getGetKnowledgeQueryKey,
  useGetRules,
  useSaveRules,
  useUploadMac
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Upload, Database, FileText, Loader2, Save, CheckCircle2 } from "lucide-react";

export function KnowledgePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [rulesContent, setRulesContent] = useState("");
  const [rulesSaved, setRulesSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: knowledge, isLoading: isLoadingKnowledge } = useGetKnowledge();
  const { data: rules, isLoading: isLoadingRules } = useGetRules();

  const saveRulesMutation = useSaveRules({
    mutation: {
      onSuccess: () => {
        setRulesSaved(true);
        setTimeout(() => setRulesSaved(false), 3000);
        queryClient.invalidateQueries({ queryKey: getGetKnowledgeQueryKey() });
      },
      onError: () => {
        toast({ title: "Greška pri spremanju pravila", variant: "destructive" });
      }
    }
  });

  const uploadMacMutation = useUploadMac({
    mutation: {
      onSuccess: (data: any) => {
        if (data.success) {
          toast({ 
            title: "Upload uspješan",
            description: `Pronađeno ${data.stats.formulaCount} formula, ${data.stats.parameterCount} parametara.`
          });
          queryClient.invalidateQueries({ queryKey: getGetKnowledgeQueryKey() });
        } else {
          toast({ title: "Upload nije uspio", description: data.message || "Nepoznata greška", variant: "destructive" });
        }
      },
      onError: (error: any) => {
        toast({ title: "Upload nije uspio", description: error.message || "Nepoznata greška", variant: "destructive" });
      },
      onSettled: () => {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  });

  useEffect(() => {
    if (rules?.content !== undefined) {
      setRulesContent(rules.content);
    }
  }, [rules]);

  const uploadFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const macFiles = fileArray.filter(f => f.name.toLowerCase().endsWith(".mac"));
    if (macFiles.length === 0) {
      toast({ title: "Nema .mac datoteka", description: "Odaberi datoteke s ekstenzijom .mac", variant: "destructive" });
      return;
    }
    const formData = new FormData();
    macFiles.forEach(file => formData.append("files", file));
    uploadMacMutation.mutate({ data: formData as any });
  }, [uploadMacMutation, toast]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    uploadFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploadMacMutation.isPending) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFiles(files);
  };

  const handleSaveRules = () => {
    saveRulesMutation.mutate({ data: { content: rulesContent } });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">Baza znanja</h2>
        <p className="text-xs text-muted-foreground mb-5">MegaTischler formule i parametri</p>

        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="font-medium flex items-center text-xs text-muted-foreground uppercase tracking-widest mb-3">
            <Database className="w-3.5 h-3.5 mr-2 text-primary" />
            Statistike
          </h3>

          {isLoadingKnowledge ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Formule</span>
                <span className="text-2xl font-bold tabular-nums text-primary">{knowledge?.stats.formulaCount ?? 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Parametri</span>
                <span className="text-2xl font-bold tabular-nums">{knowledge?.stats.parameterCount ?? 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Datoteke</span>
                <span className="text-2xl font-bold tabular-nums">{knowledge?.stats.fileCount ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3 text-xs text-muted-foreground uppercase tracking-widest flex items-center">
          <FileText className="w-3.5 h-3.5 mr-2" />
          Upload .mac datoteka
        </h3>
        <div
          data-testid="mac-upload-zone"
          className={`border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer
            ${isDragging ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40"}
            ${uploadMacMutation.isPending ? "opacity-60 pointer-events-none" : ""}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploadMacMutation.isPending && fileInputRef.current?.click()}
        >
          {uploadMacMutation.isPending ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
          ) : (
            <Upload className={`w-8 h-8 mb-3 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          )}
          <p className="text-sm font-medium mb-1">
            {uploadMacMutation.isPending ? "Procesiranje..." : isDragging ? "Pusti datoteke ovdje" : "Povuci .mac datoteke ovdje"}
          </p>
          <p className="text-xs text-muted-foreground">
            {uploadMacMutation.isPending ? "Ekstrakcija formula u tijeku..." : "ili klikni za odabir"}
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            className="hidden"
            multiple
            accept=".mac"
            data-testid="mac-file-input"
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-[220px]">
        <h3 className="font-medium mb-3 text-xs text-muted-foreground uppercase tracking-widest flex items-center justify-between">
          <span>Stipina pravila</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSaveRules}
            disabled={saveRulesMutation.isPending}
            data-testid="save-rules-button"
            className="h-7 text-xs"
          >
            {saveRulesMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : rulesSaved ? (
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-green-500" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            {rulesSaved ? "Spremljeno" : "Spremi"}
          </Button>
        </h3>
        {isLoadingRules ? (
          <Skeleton className="flex-1 w-full rounded-md" />
        ) : (
          <Textarea
            value={rulesContent}
            onChange={(e) => { setRulesContent(e.target.value); setRulesSaved(false); }}
            className="flex-1 font-mono text-xs resize-none bg-muted/20 focus-visible:ring-1 leading-relaxed"
            placeholder={"Upiši svoja pravila za MegaTischler...\n\nPrimjer:\n- Uvijek koristi decimalni zarez (0,5 ne 0.5)\n- Polica uvijek prati dubinu: [.D]-20\n- ..."}
            data-testid="rules-textarea"
          />
        )}
      </div>
    </div>
  );
}
