import { useState, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetKnowledge, 
  getGetKnowledgeQueryKey,
  getGetKnowledgeFilesQueryKey,
  useGetKnowledgeFiles,
  useSummarizeKnowledgeFile,
} from "@workspace/api-client-react";
import { MODULE_TYPES } from "@workspace/formula-rules";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Upload, Database, FileText, Loader2, RefreshCw, ChevronDown, ChevronRight, Sparkles, CheckCircle2, Table2, Search, X, Copy, Check } from "lucide-react";

function CopyKeyButton({ paramKey }: { paramKey: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(`[${paramKey}]`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title={`Kopiraj [${paramKey}]`}
      aria-label={`Kopiraj [${paramKey}]`}
      data-testid={`copy-param-${paramKey}`}
      className="shrink-0 self-start mt-0.5 text-muted-foreground hover:text-primary transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

type CsvType = "materials" | "elements" | "userparameters";

const CSV_LABELS: Record<CsvType, { label: string; hint: string }> = {
  materials: { label: "MATERIALS.csv", hint: "Katalog materijala (ploče, kantovi, okov...)" },
  elements: { label: "ELEMENTS-mt.csv", hint: "Katalog elemenata (1VEZH2, 2POL1...)" },
  userparameters: { label: "USERPARAMETERS.csv", hint: "Katalog parametara (GK, ODU, GLU...)" },
};

export function KnowledgePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [paramQuery, setParamQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: knowledge, isLoading: isLoadingKnowledge } = useGetKnowledge();
  const { data: filesData, isLoading: isLoadingFiles, refetch: refetchFiles } = useGetKnowledgeFiles();

  const summarizeMutation = useSummarizeKnowledgeFile({
    mutation: {
      onSuccess: () => {
        void refetchFiles();
        toast({ title: "Sažetak generiran!" });
      },
      onError: () => {
        toast({ title: "Greška pri generiranju sažetka", variant: "destructive" });
      }
    }
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isReparsing, setIsReparsing] = useState(false);
  const [csvUploading, setCsvUploading] = useState<CsvType | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvPendingType, setCsvPendingType] = useState<CsvType | null>(null);

  const userParameters = useMemo(
    () => knowledge?.userparameters ?? [],
    [knowledge?.userparameters],
  );

  const filteredParams = useMemo(() => {
    const q = normalizeText(paramQuery.trim());
    if (!q) return userParameters;
    return userParameters.filter((p) => {
      const haystack = normalizeText(`${p.key} ${p.desc} ${p.caption} ${p.longdesc}`);
      return haystack.includes(q);
    });
  }, [paramQuery, userParameters]);

  const handleCsvUpload = useCallback(async (file: File, type: CsvType) => {
    setCsvUploading(type);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/upload-csv?type=${type}`, { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: "CSV uvezen", description: data.message });
        queryClient.invalidateQueries({ queryKey: getGetKnowledgeQueryKey() });
      } else {
        toast({ title: "CSV upload nije uspio", description: data.error || "Nepoznata greška", variant: "destructive" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Greška mreže";
      toast({ title: "CSV upload nije uspio", description: msg, variant: "destructive" });
    } finally {
      setCsvUploading(null);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }, [toast, queryClient]);

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !csvPendingType) return;
    const file = e.target.files[0];
    if (file) handleCsvUpload(file, csvPendingType);
  };

  const triggerCsvUpload = (type: CsvType) => {
    setCsvPendingType(type);
    setTimeout(() => csvInputRef.current?.click(), 0);
  };

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
        queryClient.invalidateQueries({ queryKey: getGetKnowledgeFilesQueryKey() });
      } else {
        toast({ title: "Ponovno parsiranje nije uspjelo", description: data.error || "Nepoznata greška", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Ponovno parsiranje nije uspjelo", description: err.message || "Greška mreže", variant: "destructive" });
    } finally {
      setIsReparsing(false);
    }
  };


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
        queryClient.invalidateQueries({ queryKey: getGetKnowledgeFilesQueryKey() });
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
              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Materijali</span>
                <span className={`text-2xl font-bold tabular-nums ${(knowledge?.csv_meta?.materials_count ?? 0) > 0 ? "" : "text-muted-foreground/40"}`}>
                  {knowledge?.csv_meta?.materials_count ?? 0}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Elementi</span>
                <span className={`text-2xl font-bold tabular-nums ${(knowledge?.csv_meta?.elements_count ?? 0) > 0 ? "" : "text-muted-foreground/40"}`}>
                  {knowledge?.csv_meta?.elements_count ?? 0}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Par. katalog</span>
                <span className={`text-2xl font-bold tabular-nums ${(knowledge?.csv_meta?.userparameters_count ?? 0) > 0 ? "" : "text-muted-foreground/40"}`}>
                  {knowledge?.csv_meta?.userparameters_count ?? 0}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3 text-xs text-muted-foreground uppercase tracking-widest flex items-center">
          <Search className="w-3.5 h-3.5 mr-2" />
          Pretraga parametara
        </h3>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={paramQuery}
            onChange={(e) => setParamQuery(e.target.value)}
            placeholder='npr. "Utor", "Dubina", "ODU"...'
            data-testid="param-search-input"
            className="w-full rounded-md border border-border bg-card pl-9 pr-9 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
          {paramQuery && (
            <button
              type="button"
              onClick={() => setParamQuery("")}
              aria-label="Očisti pretragu"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {userParameters.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 py-2">
            Katalog parametara nije uvezen. Uvezi USERPARAMETERS.csv u sekciji "CSV katalozi" ispod.
          </p>
        ) : (
          <>
            <div className="text-[11px] text-muted-foreground mb-2">
              {paramQuery.trim()
                ? `${filteredParams.length} ${filteredParams.length === 1 ? "rezultat" : "rezultata"}`
                : `${userParameters.length} parametara u katalogu`}
            </div>
            {filteredParams.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 py-2" data-testid="param-search-empty">
                Nema parametara koji odgovaraju "{paramQuery.trim()}".
              </p>
            ) : (
              <div className="rounded-md border border-border overflow-hidden divide-y divide-border" data-testid="param-search-results">
                {filteredParams.map((p) => {
                  const constraints: string[] = [];
                  if (p.caption) constraints.push(p.caption);
                  if (p.isInt) constraints.push("cijeli broj");
                  if (!p.allowNeg) constraints.push("≥0");
                  if (p.limMin != null && p.limMax != null) constraints.push(`raspon ${p.limMin}–${p.limMax}`);
                  else if (p.limMin != null) constraints.push(`min ${p.limMin}`);
                  else if (p.limMax != null) constraints.push(`max ${p.limMax}`);
                  return (
                    <div key={p.key} className="flex items-start gap-3 px-3 py-2 bg-card hover:bg-accent/20 transition-colors group">
                      <CopyKeyButton paramKey={p.key} />
                      <span className="font-mono text-xs font-semibold text-primary shrink-0 min-w-[64px] pt-0.5">
                        [{p.key}]
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm flex items-center gap-1.5 flex-wrap">
                          {p.desc || <span className="text-muted-foreground/50 italic">bez opisa</span>}
                          {p.isHelper && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 whitespace-nowrap">
                              pomoćni
                            </span>
                          )}
                        </span>
                        {p.longdesc && !p.caption && (
                          <span className="text-[11px] text-muted-foreground/70 mt-0.5">{p.longdesc}</span>
                        )}
                        {constraints.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {constraints.map((c, i) => (
                              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80 whitespace-nowrap">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
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

      <div>
        <h3 className="font-medium mb-3 text-xs text-muted-foreground uppercase tracking-widest flex items-center">
          <Table2 className="w-3.5 h-3.5 mr-2" />
          CSV katalozi
        </h3>
        <div className="rounded-md border border-border overflow-hidden">
          {(["materials", "elements", "userparameters"] as CsvType[]).map((type) => {
            const { label, hint } = CSV_LABELS[type];
            const isActive = csvUploading === type;
            const csvMeta = knowledge?.csv_meta;
            const count = csvMeta ? csvMeta[`${type}_count` as keyof typeof csvMeta] as number : 0;
            const updatedAt = csvMeta ? csvMeta[`${type}_updated_at` as keyof typeof csvMeta] as string | null : null;
            return (
              <div
                key={type}
                className="flex items-center justify-between px-3 py-2 border-b border-border last:border-b-0 bg-card hover:bg-accent/20 transition-colors"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-mono font-medium">{label}</span>
                  <span className="text-[10px] text-muted-foreground/70">{hint}</span>
                  {count > 0 && updatedAt ? (
                    <span className="text-[9px] text-green-500 mt-0.5">
                      {count} zapisa · {new Date(updatedAt).toLocaleDateString("hr-HR")}
                    </span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground/40 mt-0.5">Nije uvezeno</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={csvUploading !== null}
                  onClick={() => triggerCsvUpload(type)}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-border bg-muted/50 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 shrink-0 ml-2"
                >
                  {isActive ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <Upload className="w-2.5 h-2.5" />
                  )}
                  {isActive ? "Uvoz..." : "Uvezi"}
                </button>
              </div>
            );
          })}
        </div>
        <input
          type="file"
          ref={csvInputRef}
          onChange={handleCsvFileChange}
          className="hidden"
          accept=".csv"
        />
      </div>

      <div>
        <h3 className="font-medium mb-3 text-xs text-muted-foreground uppercase tracking-widest flex items-center">
          <FileText className="w-3.5 h-3.5 mr-2" />
          .mac datoteke
        </h3>
        {isLoadingFiles ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !filesData?.files.length ? (
          <div className="text-xs text-muted-foreground/60 py-6 text-center border border-dashed border-border rounded-md">
            Nema uploadanih .mac datoteka s formulama
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Datoteka</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Formule</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Dodano</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Stanje</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filesData.files.map((file) => {
                  const isExpanded = expandedFile === file.name;
                  const isStudied = !!file.summary;
                  const isSummarizing = summarizeMutation.isPending &&
                    (summarizeMutation.variables as { data: { filename: string } } | undefined)?.data?.filename === file.name;
                  const moduleTypeEntry = MODULE_TYPES.find((m) => m.module === file.module);
                  return (
                    <>
                      <tr
                        key={file.name}
                        className={`border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors ${isExpanded ? "bg-accent/20" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setExpandedFile(isExpanded ? null : file.name)}
                            className="flex items-start gap-1.5 hover:text-primary transition-colors text-left"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3 mt-0.5 shrink-0" /> : <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />}
                            <span>
                              <span className="font-mono text-[11px] text-foreground/90 block">{file.name}</span>
                              {moduleTypeEntry && (
                                <span className="text-[9px] text-muted-foreground/60 leading-tight block">{moduleTypeEntry.type}</span>
                              )}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-primary">{file.formulaCount}</td>
                        <td className="px-3 py-2 text-muted-foreground text-[10px]">
                          {new Date(file.uploadedAt).toLocaleDateString("hr-HR")}
                        </td>
                        <td className="px-3 py-2">
                          {isStudied ? (
                            <span className="flex items-center gap-1 text-green-500 text-[10px] font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Proučena
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50 text-[10px]">Nije</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => summarizeMutation.mutate({ data: { filename: file.name } })}
                            disabled={isSummarizing}
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-border bg-muted/50 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                          >
                            {isSummarizing ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-2.5 h-2.5" />
                            )}
                            Sumiraj
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${file.name}-exp`} className="border-b border-border last:border-b-0 bg-muted/10">
                          <td colSpan={5} className="px-4 py-3">
                            {isStudied ? (
                              <p className="text-[11px] text-foreground/80 leading-relaxed">{file.summary}</p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground/60 italic">
                                Klikni "Sumiraj" kako bi AI analizirao formule ove datoteke.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
