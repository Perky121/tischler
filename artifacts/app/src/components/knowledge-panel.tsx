import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetKnowledge, 
  getGetKnowledgeQueryKey,
  useGetRules,
  useSaveRules,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Upload, Database, FileText, Loader2, Save, CheckCircle2, RefreshCw } from "lucide-react";

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

  const [isUploading, setIsUploading] = useState(false);
  const [isReparsing, setIsReparsing] = useState(false);

  const handleReparse = async () => {
    setIsReparsing(true);
    try {
      const res = await fetch("/api/reparse", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        toast({
          title: "Ponovno parsiranje uspješno",
          description: `${data.stats.formulaCount} formula, ${data.stats.parameterCount} parametara.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetKnowledgeQueryKey() });
      } else {
        toast({ title: "Ponovno parsiranje nije uspjelo", description: data.error || "Nepoznata greška", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Ponovno parsiranje nije uspjelo", description: err.message || "Greška mreže", variant: "destructive" });
    } finally {
      setIsReparsing(false);
    }
  };

  useEffect(() => {
    if (rules?.content !== undefined) {
      setRulesContent(rules.content);
    }
  }, [rules]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith(".mac") || name.endsWith(".zip");
    });
    if (validFiles.length === 0) {
      toast({ title: "Nema valjanih datoteka", description: "Odaberi .mac ili .zip datoteke", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      validFiles.forEach(file => formData.append("files", file));

      const res = await fetch("/api/upload-mac", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok && data.success) {
        toast({
          title: "Upload uspješan",
          description: `Pronađeno ${data.stats.formulaCount} formula, ${data.stats.parameterCount} parametara.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetKnowledgeQueryKey() });
      } else {
        toast({ title: "Upload nije uspio", description: data.error || data.message || "Nepoznata greška", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Upload nije uspio", description: err.message || "Greška mreže", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [toast, queryClient]);

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
    if (isUploading) return;
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
          <h3 className="font-medium flex items-center justify-between text-xs text-muted-foreground uppercase tracking-widest mb-3">
            <span className="flex items-center">
              <Database className="w-3.5 h-3.5 mr-2 text-primary" />
              Statistike
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReparse}
              disabled={isReparsing || isUploading}
              className="h-6 text-[10px] px-2"
              title="Ponovno parsiraj sve spremljene .mac datoteke najnovijim parserom"
              data-testid="reparse-button"
            >
              {isReparsing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              Ponovno parsiraj
            </Button>
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
          Upload .mac / .zip datoteka
        </h3>
        <div
          data-testid="mac-upload-zone"
          className={`border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer
            ${isDragging ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40"}
            ${isUploading ? "opacity-60 pointer-events-none" : ""}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
          ) : (
            <Upload className={`w-8 h-8 mb-3 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          )}
          <p className="text-sm font-medium mb-1">
            {isUploading ? "Procesiranje..." : isDragging ? "Pusti datoteke ovdje" : "Povuci .mac ili .zip datoteke ovdje"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isUploading ? "Ekstrakcija formula u tijeku..." : "ili klikni za odabir · .zip može sadržavati više .mac datoteka"}
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            className="hidden"
            multiple
            accept=".mac,.zip"
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
